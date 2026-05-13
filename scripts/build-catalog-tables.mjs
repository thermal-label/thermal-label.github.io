#!/usr/bin/env node
// Regenerate the `<!-- CATALOG_TABLE:start ... --> ... <!-- CATALOG_TABLE:end -->`
// blocks inside per-driver catalog pages (e.g. `niimbot-hardware.md`,
// `escpos-hardware.md`). The blocks carry an optional attribute list
// on the start marker that filters which chassis to include:
//
//   <!-- CATALOG_TABLE:start -->
//   <!-- CATALOG_TABLE:start protocol=escpos-a -->
//   <!-- CATALOG_TABLE:start protocol=tspl-c1,tspl-l3,tspl-m3 -->
//
// The table source is each driver's pulled `.aggregate/devices/<driver>.json`
// (rich projection emitted by codegen). Prose around the markers is
// hand-authored and untouched.
//
// Run order: docs:pull → build-hardware-page → build-catalog-tables →
// vitepress build. The script edits the pulled catalog pages in
// `docs/<driver>/` — it does not write back to driver repos.
//
// Driver-side data flow:
//   - pull-driver-docs.mjs copies <driver>/docs/ into docs/<driver>/
//   - pull-driver-docs.mjs copies <driver>/packages/core/data/devices.json
//     into .aggregate/devices/<driver>.json
//   - this script reads both and rewrites the marker blocks in place

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driverMembers, loadDrivers } from './lib/load-drivers.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const AGG_DEVICES_DIR = join(SITE_ROOT, '.aggregate', 'devices');

function log(msg) { process.stdout.write(`[build-catalog-tables] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-catalog-tables] error: ${msg}\n`); process.exit(1); }

const STATUS_LABEL_INLINE = {
  verified:  '✅ verified',
  partial:   '⚠️ partial',
  broken:    '❌ broken',
  untested:  '⏳ untested',
};

const TRANSPORT_LABEL = {
  usb: 'USB',
  tcp: 'TCP',
  serial: 'Serial',
  'bluetooth-spp': 'Bluetooth SPP',
  'bluetooth-gatt': 'Bluetooth LE',
};

function statusBadge(s) {
  return STATUS_LABEL_INLINE[s] ?? (s ? `· ${s}` : '—');
}

function transportLabel(t) {
  return TRANSPORT_LABEL[t] ?? t;
}

function fmtTransports(transports) {
  const keys = Object.keys(transports ?? {});
  if (keys.length === 0) return '—';
  return keys.map(transportLabel).join(' · ');
}

function fmtProtocols(engines) {
  if (!engines || engines.length === 0) return '—';
  return engines.map(e => `\`${e.protocol}\``).join(' · ');
}

function fmtDpi(engines) {
  if (!engines || engines.length === 0) return '—';
  const dpis = [...new Set(engines.map(e => e.dpi).filter(Boolean))];
  return dpis.length === 0 ? '—' : dpis.join(' / ');
}

function fmtHead(engines) {
  if (!engines || engines.length === 0) return '—';
  const dots = [...new Set(engines.map(e => e.headDots).filter(Boolean))];
  return dots.length === 0 ? '—' : dots.join(' / ');
}

function deviceMatchesFilter(device, filter) {
  if (!filter || !filter.protocols) return true;
  const protos = (device.engines ?? []).map(e => e.protocol);
  return protos.some(p => filter.protocols.includes(p));
}

function renderTable(devices, filter) {
  const rows = devices
    .filter(d => deviceMatchesFilter(d, filter))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return '_No chassis match this filter yet._';
  }

  const lines = [
    '| Chassis | Protocol | DPI | Head | Transports | Status |',
    '| --- | --- | --: | --: | --- | --- |',
  ];
  for (const d of rows) {
    const status = d.support?.status ?? 'untested';
    lines.push(
      `| **${d.name}** | ${fmtProtocols(d.engines)} | ${fmtDpi(d.engines)} | ${fmtHead(d.engines)} | ${fmtTransports(d.transports)} | ${statusBadge(status)} |`,
    );
  }
  return lines.join('\n');
}

// Parse `<!-- CATALOG_TABLE:start [attrs] -->` attribute list. Today
// only `protocol=foo,bar` is recognised; unknown attrs are ignored
// (forward-compat — adding new filters shouldn't require a docs-site
// release in lockstep).
function parseAttrs(raw) {
  const filter = {};
  if (!raw) return filter;
  for (const tok of raw.trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq < 0) continue;
    const k = tok.slice(0, eq);
    const v = tok.slice(eq + 1);
    if (k === 'protocol') {
      filter.protocols = v.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return filter;
}

const MARKER_RE = /<!--\s*CATALOG_TABLE:start([^>]*)-->\s*[\s\S]*?<!--\s*CATALOG_TABLE:end\s*-->/g;

function rewriteMarkers(source, devices) {
  let count = 0;
  const out = source.replace(MARKER_RE, (_match, attrs) => {
    count++;
    const filter = parseAttrs(attrs);
    const body = renderTable(devices, filter);
    const startTag = attrs && attrs.trim()
      ? `<!-- CATALOG_TABLE:start ${attrs.trim()} -->`
      : '<!-- CATALOG_TABLE:start -->';
    return `${startTag}\n\n${body}\n\n<!-- CATALOG_TABLE:end -->`;
  });
  return { out, count };
}

function loadAggregate(driver) {
  const path = join(AGG_DEVICES_DIR, `${driver}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`${driver}: failed to parse ${path}: ${err.message}`);
  }
}

function processDriverDir(driver, devices) {
  const dir = join(DOCS_ROOT, driver);
  if (!existsSync(dir)) return 0;
  let totalBlocks = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const fullPath = join(dir, entry);
    const src = readFileSync(fullPath, 'utf8');
    if (!src.includes('CATALOG_TABLE:start')) continue;
    const { out, count } = rewriteMarkers(src, devices);
    if (count === 0) continue;
    writeFileSync(fullPath, out);
    log(`${driver}: regenerated ${count} table block(s) in ${entry}`);
    totalBlocks += count;
  }
  return totalBlocks;
}

function main() {
  const drivers = driverMembers(loadDrivers());
  let total = 0;
  for (const d of drivers) {
    const agg = loadAggregate(d.name);
    if (!agg) {
      // pull-driver-docs.mjs already hard-fails if a driver-kind member
      // is missing its aggregate; absence here means the driver isn't
      // pulled in this build (shouldn't happen, but don't crash).
      continue;
    }
    total += processDriverDir(d.name, agg.devices ?? []);
  }
  log(`wrote ${total} table block(s) across ${drivers.length} drivers`);
}

main();
