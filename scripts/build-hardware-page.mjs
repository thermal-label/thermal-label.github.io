#!/usr/bin/env node
// Build the unified Hardware section from each driver's contracts-shape
// DEVICES + MEDIA registries (shipped via npm).
//
// Outputs:
//   - docs/hardware/_data.json             — slim dataset for HardwareTable.vue
//   - docs/hardware/index.md               — page chrome + <HardwareTable />
//   - docs/hardware/{driver}/{slug}.md     — one detail page per device
//
// The driver's runtime DEVICES / MEDIA exports are the single source of
// truth — each driver's data/devices.json is bundled into the published
// package and surfaces unchanged at the export. No YAML overlay, no
// hand-maintained capability allowlist.
//
// Run order: docs:pull → build-hardware-page → vitepress build
//
// Schema reference: @thermal-label/contracts DeviceEntry / MediaDescriptor.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const HW_ROOT = join(DOCS_ROOT, 'hardware');

const DRIVERS = [
  { name: 'brother-ql',   displayName: 'Brother QL',        pkg: '@thermal-label/brother-ql-core' },
  { name: 'labelmanager', displayName: 'DYMO LabelManager', pkg: '@thermal-label/labelmanager-core' },
  { name: 'labelwriter',  displayName: 'DYMO LabelWriter',  pkg: '@thermal-label/labelwriter-core' },
];

// Map every (family, engine.protocol) the registry surfaces to the
// docs URL for its wire-protocol reference page. Keyed by
// `${family}:${protocol}` because `d1-tape` is implemented by two
// different repos (labelmanager — canonical D1, and labelwriter — the
// Duo's tape engine, with divergences in cut + status).
//
// Set the value to `null` to mean "intentionally unlinked" (e.g. a
// stub protocol slug that hasn't shipped its docs yet); the renderer
// falls back to a plain code span. Anything missing entirely fails
// the build — that's the load-bearing part: a new engine.protocol
// can't ship without a doc page or an explicit decision not to link.
const PROTOCOL_DOC_URLS = {
  'brother-ql:ql-raster':   '/brother-ql/protocol/ql',
  'brother-ql:pt-raster':   '/brother-ql/protocol/pt',
  'labelmanager:d1-tape':   '/labelmanager/protocol',
  'labelwriter:lw-450':     '/labelwriter/protocol/lw-450',
  'labelwriter:lw-550':     '/labelwriter/protocol/lw-550',
  'labelwriter:d1-tape':    '/labelwriter/protocol/duo-tape',
};

const STATUS_ORDER = { verified: 0, partial: 1, broken: 2, untested: 3 };
const STATUS_LABEL = {
  verified: '✅ verified',
  partial:  '⚠️ partial',
  broken:   '❌ broken',
  untested: '· untested',
};

// Inline form — no leading bullet, since these get joined with `·`
// separators in detail-page prose and the bullet would double up.
const STATUS_LABEL_INLINE = {
  verified: '✅ verified',
  partial:  '⚠️ partial',
  broken:   '❌ broken',
  untested: 'untested',
};

const TRANSPORT_LABEL = {
  usb: 'USB',
  tcp: 'TCP',
  serial: 'Serial',
  'bluetooth-spp': 'Bluetooth SPP',
  'bluetooth-gatt': 'Bluetooth LE',
};

// Named PrintEngineCapabilities keys from contracts. Driver-side
// extensions fall through to DRIVER_CAPABILITY_LABELS.
const ENGINE_CAPABILITY_LABELS = {
  mediaDetection: 'auto-detects loaded media',
  autocut: 'auto-cut',
};

// Driver-side capability vocabulary — until the labels move into each
// driver's package (plan §4.2), the docs site carries the map.
const DRIVER_CAPABILITY_LABELS = {
  twoColor: 'two-colour ribbon',
  genuineMediaRequired: 'genuine media required',
  experimental: 'experimental',
  editorLite: 'Editor Lite (USB Mass Storage trick)',
  network: 'network',
  nfcLock: 'NFC-locked media',
};

function log(msg) { process.stdout.write(`[build-hardware-page] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-hardware-page] error: ${msg}\n`); process.exit(1); }

function readPkgJson(pkg) {
  const path = join(SITE_ROOT, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!existsSync(path)) die(`cannot find ${pkg} at ${path} — run \`npm install\` first`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function repoIssuesUrl(pkgJson) {
  if (pkgJson.bugs?.url) return pkgJson.bugs.url.replace(/\/$/, '');
  const r = pkgJson.repository;
  if (!r) return null;
  const url = typeof r === 'string' ? r : r.url;
  if (!url) return null;
  return url.replace(/^git\+/, '').replace(/\.git$/, '') + '/issues';
}

async function loadDriverData(pkg) {
  const mod = await import(pkg);
  if (!mod.DEVICES) die(`${pkg} does not export DEVICES`);
  const devices = Object.values(mod.DEVICES);
  const mediaSrc = mod.MEDIA;
  const media = !mediaSrc ? [] : Array.isArray(mediaSrc) ? mediaSrc : Object.values(mediaSrc);
  return { devices, media };
}

function devSlug(key) {
  return key.toLowerCase().replace(/_/g, '-');
}

// Inlined from contracts compatibleMediaFor — keeps the script
// dependency-free.
function compatibleMediaFor(engine, media) {
  const eng = engine.mediaCompatibility;
  return media.filter(m => {
    const mod = m.targetModels;
    if (eng === undefined || mod === undefined) return true;
    return eng.some(t => mod.includes(t));
  });
}

function statusBadge(status) {
  return STATUS_LABEL[status] ?? `· ${status}`;
}

function statusBadgeInline(status) {
  return STATUS_LABEL_INLINE[status] ?? status;
}

function transportShortLabel(t) {
  return TRANSPORT_LABEL[t] ?? t;
}

function escapeYamlValue(v) {
  return String(v).replace(/"/g, '\\"');
}

function fmtDimensions(m) {
  if (m.widthMm != null && m.heightMm != null) return `${m.widthMm} × ${m.heightMm} mm`;
  if (m.widthMm != null) return `${m.widthMm} mm`;
  return '—';
}

function fmtSkus(m) {
  if (!m.skus || m.skus.length === 0) return '—';
  return m.skus.join(', ');
}

function fmtCategory(m) {
  return m.category ?? m.type ?? '—';
}

function renderEngineCapabilities(engine) {
  if (!engine.capabilities) return [];
  const parts = [];
  for (const [k, v] of Object.entries(engine.capabilities)) {
    if (v === false || v == null) continue;
    if (k in ENGINE_CAPABILITY_LABELS) {
      parts.push(ENGINE_CAPABILITY_LABELS[k]);
    } else {
      parts.push(DRIVER_CAPABILITY_LABELS[k] ?? k);
    }
  }
  return parts;
}

function renderChassisCapabilities(dev) {
  if (!dev.capabilities) return [];
  const parts = [];
  for (const [k, v] of Object.entries(dev.capabilities)) {
    if (v === false || v == null) continue;
    parts.push(DRIVER_CAPABILITY_LABELS[k] ?? k);
  }
  return parts;
}

function renderTransportEntry(name, params, support) {
  const status = support?.transports?.[name];
  const tag = status ? ` · ${statusBadgeInline(status)}` : '';
  switch (name) {
    case 'usb':
      return `- **USB** — VID \`${params.vid}\`, PID \`${params.pid}\`${tag}`;
    case 'tcp': {
      const mdns = params.mdns ? `, mDNS \`${params.mdns.serviceType}\`` : '';
      return `- **TCP** — port ${params.port}${mdns}${tag}`;
    }
    case 'serial': {
      const extra = params.supportedBauds && params.supportedBauds.length > 1
        ? ` (also: ${params.supportedBauds.filter(b => b !== params.defaultBaud).join(', ')})`
        : '';
      return `- **Serial** — default ${params.defaultBaud} baud${extra}${tag}`;
    }
    case 'bluetooth-spp': {
      const np = params.namePrefix ? `name prefix "${params.namePrefix}"` : 'classic Bluetooth SPP';
      return `- **Bluetooth SPP** — ${np}${tag}`;
    }
    case 'bluetooth-gatt': {
      const np = params.namePrefix ? `, name prefix "${params.namePrefix}"` : '';
      return `- **Bluetooth LE** — service \`${params.serviceUuid}\`${np}${tag}`;
    }
    default:
      return `- **${name}** — ${JSON.stringify(params)}${tag}`;
  }
}

function renderProtocolBadge(family, protocol) {
  const key = `${family}:${protocol}`;
  if (!(key in PROTOCOL_DOC_URLS)) {
    die(
      `unknown engine.protocol "${protocol}" on family "${family}" — ` +
      `add an entry to PROTOCOL_DOC_URLS in scripts/build-hardware-page.mjs ` +
      `(URL string to link, or null to leave intentionally unlinked).`,
    );
  }
  const url = PROTOCOL_DOC_URLS[key];
  return url === null ? `\`${protocol}\`` : `[\`${protocol}\`](${url})`;
}

function renderEngine(engine, support, family) {
  const lines = [];
  const parts = [
    `${engine.dpi} dpi`,
    `${engine.headDots}-dot head`,
    renderProtocolBadge(family, engine.protocol),
  ];
  if (engine.mediaCompatibility?.length) {
    parts.push(`media: ${engine.mediaCompatibility.join(', ')}`);
  }
  for (const cap of renderEngineCapabilities(engine)) parts.push(cap);
  if (engine.bind?.usb?.bInterfaceNumber !== undefined) {
    parts.push(`USB interface ${engine.bind.usb.bInterfaceNumber}`);
  }
  if (engine.bind?.address !== undefined) {
    parts.push(`protocol address ${engine.bind.address}`);
  }
  const status = support?.engines?.[engine.role];
  if (status) parts.push(statusBadgeInline(status));

  lines.push(`**${engine.role}** — ${parts.join(' · ')}`);
  return lines.join('\n');
}

function renderMediaTable(media) {
  if (media.length === 0) return '_No media in the registry matches this engine._';
  const lines = [
    '| Category | Name | Dimensions | SKUs |',
    '| --- | --- | --- | --- |',
  ];
  for (const m of media) {
    lines.push(`| ${fmtCategory(m)} | ${m.name ?? m.id ?? '—'} | ${fmtDimensions(m)} | ${fmtSkus(m)} |`);
  }
  return lines.join('\n');
}

function renderReports(support) {
  const reports = support?.reports ?? [];
  if (reports.length === 0) return '_No reports yet._';
  const lines = [];
  for (const r of reports) {
    const self = r.selfVerified ? ' _(self-verified)_' : '';
    const os = r.os ? ` · ${r.os}` : '';
    const notes = r.notes ? `\n  > ${r.notes.replace(/\n/g, '\n  > ')}` : '';
    lines.push(`- **#${r.issue}** — ${r.reporter}${self}, ${r.date}${os} · ${statusBadgeInline(r.result)}${notes}`);
  }
  return lines.join('\n');
}

function buildIssueUrl(base, title, body) {
  if (!base) return null;
  const params = new URLSearchParams({ title, body });
  return `${base}/new?${params.toString()}`;
}

function ctaBlock(dev, driver, issuesUrl) {
  if (!issuesUrl) return '';
  const transports = Object.keys(dev.transports ?? {}).map(transportShortLabel).join(' · ') || '—';
  const verifyTitle = `Verification report: ${dev.name}`;
  const verifyBody = [
    `**Device:** ${dev.name}`,
    `**Key:** \`${dev.key}\``,
    `**Family:** ${dev.family}`,
    `**Transports declared:** ${transports}`,
    `**Tested OS:** _(Linux / macOS / Windows)_`,
    '',
    '**What worked:**',
    '',
    '**What didn\'t:**',
    '',
    '**Steps to reproduce:**',
  ].join('\n');
  const bugTitle = `Bug: ${dev.name} — `;
  const bugBody = [
    `**Device:** ${dev.name}`,
    `**Key:** \`${dev.key}\``,
    '**Package versions:**',
    '**OS:**',
    '',
    '**What happened:**',
    '',
    '**What I expected:**',
    '',
    '**Steps to reproduce:**',
  ].join('\n');
  const verifyHref = buildIssueUrl(issuesUrl, verifyTitle, verifyBody);
  const bugHref = buildIssueUrl(issuesUrl, bugTitle, bugBody);
  return [
    `[**Have one of these? File a verification report →**](${verifyHref})`,
    `[**Found a bug? →**](${bugHref})`,
  ].join('  \n');
}

function renderDevicePage(dev, driver, media, issuesUrl, pkgVersion) {
  const status = dev.support?.status ?? 'untested';
  const transports = Object.entries(dev.transports ?? {});
  const transportStrip = transports.map(([t]) => transportShortLabel(t)).join(' · ') || '—';
  const lastVerified = dev.support?.lastVerified;
  const supportPkgVersion = dev.support?.packageVersion;

  const subline = [];
  if (lastVerified) subline.push(`Last verified ${lastVerified}`);
  if (supportPkgVersion) subline.push(`tested against \`${driver.pkg}@${supportPkgVersion}\``);
  const subtitle = subline.length > 0
    ? subline.join(' · ')
    : `Currently in \`${driver.pkg}@${pkgVersion}\` — no public verification reports yet.`;

  const chassisCaps = renderChassisCapabilities(dev);
  const hasQuirks = !!(dev.hardwareQuirks || dev.support?.quirks);

  const sections = [];
  sections.push(`# ${dev.name}`);
  sections.push(`**${statusBadgeInline(status)}** · ${transportStrip}  \n${subtitle}`);

  sections.push('## Engines');
  sections.push((dev.engines ?? []).map(e => renderEngine(e, dev.support, dev.family)).join('\n\n'));

  sections.push('## Connectivity');
  sections.push(transports.map(([name, params]) => renderTransportEntry(name, params, dev.support)).join('\n'));
  if (chassisCaps.length > 0) {
    sections.push(`**Chassis features:** ${chassisCaps.join(', ')}`);
  }

  if (hasQuirks) {
    sections.push('## Quirks');
    if (dev.hardwareQuirks) sections.push(dev.hardwareQuirks);
    if (dev.support?.quirks) sections.push(`> ${dev.support.quirks.replace(/\n/g, '\n> ')}`);
  }

  sections.push('## Supported media');
  const engines = dev.engines ?? [];
  if (engines.length === 1) {
    sections.push(renderMediaTable(compatibleMediaFor(engines[0], media)));
  } else {
    for (const eng of engines) {
      sections.push(`### ${eng.role} engine`);
      sections.push(renderMediaTable(compatibleMediaFor(eng, media)));
    }
  }

  sections.push('## Verification reports');
  sections.push(renderReports(dev.support));

  const cta = ctaBlock(dev, driver, issuesUrl);
  if (cta) {
    sections.push('---');
    sections.push(cta);
  }

  // Frontmatter — give the page a title VitePress can use, and hide
  // these per-device pages from the local search if they bloat results.
  const frontmatter = [
    '---',
    `title: ${escapeYamlValue(dev.name)}`,
    `description: ${escapeYamlValue(`${dev.name} — ${driver.displayName} hardware support, transports, supported media, and verification reports.`)}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + sections.join('\n\n') + '\n';
}

function renderIndexPage(data) {
  const c = data.counts;
  return `---
title: Hardware
description: Every device supported by the thermal-label drivers, with community-verified status.
---

<script setup>
import HardwareTable from '../.vitepress/components/HardwareTable.vue';
</script>

# Hardware coverage

Every device in the contracts-shape \`DEVICES\` registry of every
thermal-label driver. Each row links to a per-device page with
transports, engines, supported media, and verification reports.

- **Total devices:** ${c.total}
- **Verified:** ${c.verified}
- **Partial:** ${c.partial}
- **Broken:** ${c.broken}
- **Untested:** ${c.untested}

The table below is **interactive**: filter by family, transport, or
status, type to search by model name. Click a row to open its detail
page.

::: tip Verify your device
A two-minute test helps everyone who buys one of these printers. See
the [verification guide](https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/verifying-hardware.md)
for what to run and how to file a report.
:::

## All devices

<ClientOnly>
  <HardwareTable />
</ClientOnly>

---

<small>Generated ${data.generatedAt} from \`@thermal-label/*-core\`
\`DEVICES\` registries. The data file lives at \`/hardware/_data.json\`
if you need to consume it programmatically.</small>
`;
}

function renderLegacyFragment(driver) {
  return [
    '<!-- AUTO-GENERATED stub by scripts/build-hardware-page.mjs. -->',
    '<!-- The per-driver hardware table moved to /hardware/ (cross-driver index) -->',
    '<!-- and /hardware/' + driver.name + '/<slug>/ (per-device pages). -->',
    '',
    '> Per-device support details now live on the unified hardware section:',
    '> [`/hardware/`](/hardware/). Filter by family `' + driver.displayName + '`',
    '> to see only this driver\'s devices.',
    '',
  ].join('\n');
}

async function main() {
  // Wipe per-driver detail trees so removed devices don't linger.
  for (const d of DRIVERS) {
    rmSync(join(HW_ROOT, d.name), { recursive: true, force: true });
  }
  mkdirSync(HW_ROOT, { recursive: true });

  const indexRows = [];
  const driversMeta = [];

  for (const driver of DRIVERS) {
    const pkgJson = readPkgJson(driver.pkg);
    const issuesUrl = repoIssuesUrl(pkgJson);
    if (!issuesUrl) {
      log(`${driver.name}: no repository/bugs URL in package.json — CTAs will be omitted`);
    }

    const { devices, media } = await loadDriverData(driver.pkg);

    const driverDir = join(HW_ROOT, driver.name);
    mkdirSync(driverDir, { recursive: true });

    for (const dev of devices) {
      // Sanity-check the contracts shape — fail loudly so a future
      // schema break doesn't silently render half-empty pages.
      if (!dev.engines || !Array.isArray(dev.engines) || dev.engines.length === 0) {
        die(`${driver.name}: device ${dev.key} has no engines[] — registry shape mismatch`);
      }
      if (!dev.transports || typeof dev.transports !== 'object') {
        die(`${driver.name}: device ${dev.key} has no transports{} — registry shape mismatch`);
      }

      const slug = devSlug(dev.key);
      writeFileSync(
        join(driverDir, slug + '.md'),
        renderDevicePage(dev, driver, media, issuesUrl, pkgJson.version),
      );

      indexRows.push({
        key: dev.key,
        driver: driver.name,
        family: driver.displayName,
        name: dev.name,
        transports: Object.keys(dev.transports),
        status: dev.support?.status ?? 'untested',
        slug,
      });
    }

    driversMeta.push({
      name: driver.name,
      displayName: driver.displayName,
      package: driver.pkg,
      version: pkgJson.version,
      totalDevices: devices.length,
    });

    // Stub the legacy include target. Driver-repo `docs/hardware.md`
    // still has `<!--@include: ./_status-fragment.md-->` until each
    // driver lands its cleanup PR; without this stub the docs build
    // fails on missing-include. Retire when no driver `hardware.md`
    // includes it any more.
    const fragmentPath = join(DOCS_ROOT, driver.name, '_status-fragment.md');
    if (existsSync(dirname(fragmentPath))) {
      writeFileSync(fragmentPath, renderLegacyFragment(driver));
    }

    log(`${driver.name}@${pkgJson.version}: wrote ${devices.length} device pages`);
  }

  const counts = { total: indexRows.length, verified: 0, partial: 0, broken: 0, untested: 0 };
  for (const r of indexRows) counts[r.status]++;

  const data = {
    generatedAt: new Date().toISOString(),
    statusOrder: STATUS_ORDER,
    drivers: driversMeta,
    rows: indexRows,
    counts,
  };

  writeFileSync(join(HW_ROOT, '_data.json'), JSON.stringify(data, null, 2) + '\n');
  log(`wrote _data.json (${counts.total} devices total)`);

  writeFileSync(join(HW_ROOT, 'index.md'), renderIndexPage(data));
  log('wrote index.md');
}

await main();
