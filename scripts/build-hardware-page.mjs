#!/usr/bin/env node
// Build the unified /hardware/ page by merging:
//   - DEVICES from each @thermal-label/<driver>-core package (npm)
//   - docs/<driver>/hardware-status.yaml (pulled by pull-driver-docs.mjs)
//
// Outputs:
//   - docs/hardware/_data.json  — single dataset consumed by HardwareTable.vue
//   - docs/hardware/index.md    — page chrome + <HardwareTable /> invocation
//   - docs/<driver>/_status-fragment.md  — per-driver narrow-scope table
//
// Run order: docs:pull → build-hardware-page → vitepress build
//
// Schema reference:
// https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/hardware-status-schema.md

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');

// Display names + which core packages to read DEVICES from. Order here
// drives the order of family filter chips and the default sort.
const DRIVERS = [
  { name: 'brother-ql',   displayName: 'Brother QL',         pkg: '@thermal-label/brother-ql-core' },
  { name: 'labelmanager', displayName: 'DYMO LabelManager',  pkg: '@thermal-label/labelmanager-core' },
  { name: 'labelwriter',  displayName: 'DYMO LabelWriter',   pkg: '@thermal-label/labelwriter-core' },
];

const STATUS_ORDER = { verified: 0, partial: 1, broken: 2, untested: 3 };

function log(msg) { process.stdout.write(`[build-hardware-page] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-hardware-page] error: ${msg}\n`); process.exit(1); }

async function loadDevices(pkg) {
  const mod = await import(pkg);
  if (!mod.DEVICES) die(`${pkg} does not export DEVICES`);
  return Object.entries(mod.DEVICES).map(([key, dev]) => ({ key, ...dev }));
}

function loadStatusYaml(driverName) {
  const path = join(DOCS_ROOT, driverName, 'hardware-status.yaml');
  if (!existsSync(path)) {
    log(`${driverName}: no hardware-status.yaml found at ${path} — treating all devices as untested`);
    return { schemaVersion: 1, driver: driverName, devices: [] };
  }
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`${driverName}: failed to parse ${path}: ${err.message}`);
  }
}

function pidHex(pid) {
  return '0x' + pid.toString(16).padStart(4, '0');
}

function mergeDriver(driver, version, devices, statusDoc) {
  const statusByPid = new Map();
  for (const entry of statusDoc.devices ?? []) {
    statusByPid.set(entry.pid, entry);
  }

  const rows = devices.map(dev => {
    const status = statusByPid.get(dev.pid);
    return {
      key: dev.key,
      driver: driver.name,
      family: driver.displayName,
      name: dev.name,
      vid: dev.vid,
      pid: dev.pid,
      pidHex: pidHex(dev.pid),
      transports: dev.transports ?? [],
      status: status?.status ?? 'untested',
      transportStatus: status?.transports ?? null,
      lastVerified: status?.lastVerified ?? null,
      packageVersion: status?.packageVersion ?? null,
      quirks: status?.quirks ?? null,
      notes: status?.notes ?? null,
      reports: status?.reports ?? [],
      // family-specific extras the table may surface as tooltips later
      capabilities: pickCapabilities(dev),
    };
  });

  // Sanity-check: every YAML device must exist in DEVICES
  for (const entry of statusDoc.devices ?? []) {
    if (!devices.some(d => d.pid === entry.pid)) {
      die(`${driver.name}: hardware-status.yaml lists pid ${pidHex(entry.pid)} which is not in DEVICES`);
    }
  }

  return {
    name: driver.name,
    displayName: driver.displayName,
    package: driver.pkg,
    version,
    totalDevices: rows.length,
    devices: rows,
  };
}

function pickCapabilities(dev) {
  const caps = {};
  for (const k of ['twoColor', 'autocut', 'compression', 'editorLite', 'network', 'nfcLock', 'protocol', 'headPins', 'headDots', 'supportedTapes', 'experimental', 'massStoragePid']) {
    if (dev[k] != null) caps[k] = dev[k];
  }
  return caps;
}

function computeCounts(drivers) {
  const counts = { total: 0, verified: 0, partial: 0, broken: 0, untested: 0 };
  for (const d of drivers) {
    for (const row of d.devices) {
      counts.total++;
      counts[row.status]++;
    }
  }
  return counts;
}

function readPkgVersion(pkg) {
  const path = join(SITE_ROOT, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!existsSync(path)) die(`cannot find ${pkg} at ${path} — run \`npm install\` first`);
  return JSON.parse(readFileSync(path, 'utf8')).version;
}

async function main() {
  const merged = [];
  for (const driver of DRIVERS) {
    const version = readPkgVersion(driver.pkg);
    const devices = await loadDevices(driver.pkg);
    const statusDoc = loadStatusYaml(driver.name);
    if (statusDoc.driver && statusDoc.driver !== driver.name) {
      die(`${driver.name}: hardware-status.yaml has driver: "${statusDoc.driver}", expected "${driver.name}"`);
    }
    merged.push(mergeDriver(driver, version, devices, statusDoc));
    log(`${driver.name}@${version}: ${devices.length} devices, ${(statusDoc.devices ?? []).length} with reports`);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    statusOrder: STATUS_ORDER,
    drivers: merged,
    counts: computeCounts(merged),
  };

  const hardwareDir = join(DOCS_ROOT, 'hardware');
  mkdirSync(hardwareDir, { recursive: true });
  writeFileSync(join(hardwareDir, '_data.json'), JSON.stringify(data, null, 2) + '\n');
  log(`wrote docs/hardware/_data.json (${data.counts.total} devices total)`);

  writeFileSync(join(hardwareDir, 'index.md'), buildIndexPage(data));
  log('wrote docs/hardware/index.md');

  for (const driver of merged) {
    const fragmentPath = join(DOCS_ROOT, driver.name, '_status-fragment.md');
    writeFileSync(fragmentPath, buildPerDriverFragment(driver));
    log(`wrote docs/${driver.name}/_status-fragment.md`);
  }
}

function statusBadge(status) {
  const labels = { verified: '✅ verified', partial: '⚠️ partial', broken: '❌ broken', untested: '· untested' };
  return labels[status] ?? status;
}

function buildIndexPage(data) {
  const c = data.counts;
  const quirkRows = [];
  for (const drv of data.drivers) {
    for (const row of drv.devices) {
      if (row.quirks) quirkRows.push({ family: drv.displayName, name: row.name, quirks: row.quirks });
    }
  }
  const quirksBlock = quirkRows.length === 0
    ? ''
    : '\n## Read these first\n\n' +
      'Devices with editorial caveats — known quirks worth understanding before you commit to one of these printers.\n\n' +
      quirkRows.map(q => `### ${q.name} <span style="opacity:.6">(${q.family})</span>\n\n${q.quirks.trim()}`).join('\n\n') + '\n';

  return `---
title: Hardware
description: Every device supported by the thermal-label drivers, with community-verified status.
---

<script setup>
import HardwareTable from '../.vitepress/components/HardwareTable.vue';
</script>

# Hardware coverage

Every device in the \`DEVICES\` registry of every thermal-label driver,
merged with community-filed verification reports.

- **Total devices:** ${c.total}
- **Verified:** ${c.verified}
- **Partial:** ${c.partial}
- **Broken:** ${c.broken}
- **Untested:** ${c.untested}

The table below is **interactive**: click a column header to sort,
toggle facet chips to filter, type to search by model name or PID.
The current view serializes to the URL — share a filtered link.

::: tip Verify your device
A two-minute test helps everyone who buys one of these printers. See
the [verification guide](https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/verifying-hardware.md)
for what to run and how to file a report.
:::
${quirksBlock}
## All devices

<ClientOnly>
  <HardwareTable />
</ClientOnly>

---

<small>Generated ${data.generatedAt} from \`@thermal-label/*-core\`
DEVICES registries and per-driver \`docs/hardware-status.yaml\` files.
The data file lives at \`/hardware/_data.json\` if you need to consume
it programmatically.</small>
`;
}

function buildPerDriverFragment(driver) {
  const lines = [];
  lines.push('<!-- AUTO-GENERATED by scripts/build-hardware-page.mjs — do not edit directly. -->');
  lines.push('<!-- Sourced from this driver\'s DEVICES + docs/hardware-status.yaml. -->');
  lines.push('');
  lines.push(`## Verification status — community-verified`);
  lines.push('');
  lines.push(`This table is generated from \`@thermal-label/${driver.name}-core\`'s`);
  lines.push(`\`DEVICES\` registry merged with this repo's \`docs/hardware-status.yaml\`.`);
  lines.push(`Updated when a verification PR lands. See the unified table at`);
  lines.push(`[\`/hardware/\`](/hardware/) for cross-driver comparison.`);
  lines.push('');
  lines.push('| Model | PID | Transports tested | Status | Last verified | Pkg version | Reports |');
  lines.push('|---|---|---|---|---|---|---|');

  // Sort: verified > partial > broken > untested, then by name
  const sorted = [...driver.devices].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    return sa - sb || a.name.localeCompare(b.name);
  });

  for (const row of sorted) {
    const transports = row.transportStatus
      ? Object.entries(row.transportStatus).map(([k, v]) => `${k} ${v === 'verified' ? '✓' : v === 'partial' ? '~' : '✗'}`).join(' · ')
      : '—';
    const reports = row.reports.length > 0
      ? row.reports.map(r => `[#${r.issue}](https://github.com/thermal-label/${driver.name}/issues/${r.issue})`).join(' ')
      : '—';
    const last = row.lastVerified ?? '—';
    const ver = row.packageVersion ?? '—';
    lines.push(`| ${row.name} | \`${row.pidHex}\` | ${transports} | ${statusBadge(row.status)} | ${last} | ${ver} | ${reports} |`);
  }

  lines.push('');
  return lines.join('\n');
}

await main();
