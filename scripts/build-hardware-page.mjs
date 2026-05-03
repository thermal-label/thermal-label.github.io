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

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
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
  untested: '⏳ untested',
};

const TRANSPORT_LABEL = {
  usb: 'USB',
  tcp: 'TCP',
  serial: 'Serial',
  'bluetooth-spp': 'Bluetooth SPP',
  'bluetooth-gatt': 'Bluetooth LE',
};

// Family colour squares match the homepage hero blocks.
const FAMILY_GLYPH = {
  'brother-ql':   '🟦',
  'labelmanager': '🟧',
  'labelwriter':  '🟥',
};

// One glyph per transport type. SPP and GATT share 📶 — both wireless,
// the per-row "Bluetooth SPP" / "Bluetooth LE" label disambiguates.
const TRANSPORT_GLYPH = {
  usb:              '🔌',
  tcp:              '🌐',
  serial:           '🔗',
  'bluetooth-spp':  '📶',
  'bluetooth-gatt': '📶',
};

// Per-(family, protocol) device icon. Drives the hand-drawn line-art
// SVG silhouette shown on each device page (docs/public/icons/
// device-<id>.svg) plus a short prose media label. Keyed `family:protocol`
// because `d1-tape` belongs to two families with very different
// physical devices (the LabelManager handheld vs. the LabelWriter Duo
// composite). When a new combination lands, fall back to no icon
// rather than mislabelling.
const DEVICE_ICON = {
  'brother-ql:ql-raster':   { id: 'brother-ql',         label: 'DK rolls — die-cut + continuous, 12–62 mm wide' },
  'brother-ql:pt-raster':   { id: 'brother-pt',         label: 'TZe laminated tape (and HSe heat-shrink tube on PT-E models)' },
  'labelmanager:d1-tape':   { id: 'dymo-labelmanager',  label: 'D1 thermal-transfer tape, 6–24 mm wide' },
  'labelwriter:lw-450':     { id: 'dymo-lw-450',        label: 'Pre-cut die-cut labels on a backing carrier' },
  'labelwriter:lw-550':     { id: 'dymo-lw-550',        label: 'Pre-cut die-cut labels — NFC-locked DYMO-genuine media required' },
  'labelwriter:d1-tape':    { id: 'dymo-lw-duo',        label: 'Composite Duo — pre-cut die-cut labels + D1 tape on a second interface' },
};

function deviceIconFor(family, engines) {
  if (!engines || engines.length === 0) return null;
  const protocols = engines.map(e => e.protocol).filter(Boolean);

  // Composite-device detection: the LabelWriter Duo carries both the
  // LW raster engine (label side) and a D1 tape engine. Either engine
  // alone would resolve to a single-output silhouette, but the Duo
  // chassis has both outputs and deserves its own icon.
  if (family === 'labelwriter' && protocols.includes('d1-tape')) {
    return DEVICE_ICON['labelwriter:d1-tape'];
  }

  const primary = protocols[0];
  return DEVICE_ICON[`${family}:${primary}`] ?? null;
}

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

function familyGlyph(family) {
  return FAMILY_GLYPH[family] ?? '⬜';
}

function transportGlyph(t) {
  return TRANSPORT_GLYPH[t] ?? '🔌';
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

// CSS-friendly hex values for the colour names that appear in
// MEDIA[*].background and MEDIA[*].text on labelmanager / labelwriter
// cartridge entries. "clear" has no flat colour — it gets a dedicated
// CSS class (checker-pattern background) instead.
const MEDIA_COLOR_HEX = {
  black:  '#1f1f1f',
  white:  '#ffffff',
  blue:   '#1e6cd6',
  red:    '#d93636',
  green:  '#2e8540',
  orange: '#f39820',
  yellow: '#f5dd2c',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// Render a media entry's name. When the registry carries `text` and
// `background` colour fields (D1 cartridges, LW Duo tape, LW 550
// cartridges) emit an inline swatch with those colours so the user
// recognises the cassette at a glance. Plain entries (DK rolls,
// die-cut LW labels, TZe rows that aren't per-colour) fall back to
// the bare name. CSS for `.media-swatch` lives in theme/custom.css.
function renderMediaName(m) {
  const name = m.name ?? m.id ?? '—';
  const bg = m.background;
  const fg = m.text;
  if (!bg || !fg) return name;
  const fgHex = MEDIA_COLOR_HEX[fg];
  if (!fgHex) return name;
  if (bg === 'clear') {
    return `<span class="media-swatch media-swatch--clear" style="--swatch-fg:${fgHex};">${escapeHtml(name)}</span>`;
  }
  const bgHex = MEDIA_COLOR_HEX[bg];
  if (!bgHex) return name;
  return `<span class="media-swatch" style="--swatch-bg:${bgHex};--swatch-fg:${fgHex};">${escapeHtml(name)}</span>`;
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

function transportDetails(name, params) {
  switch (name) {
    case 'usb':
      return `VID \`${params.vid}\`, PID \`${params.pid}\``;
    case 'tcp': {
      const mdns = params.mdns ? `, mDNS \`${params.mdns.serviceType}\`` : '';
      return `port ${params.port}${mdns}`;
    }
    case 'serial': {
      const extra = params.supportedBauds && params.supportedBauds.length > 1
        ? ` (also: ${params.supportedBauds.filter(b => b !== params.defaultBaud).join(', ')})`
        : '';
      return `default ${params.defaultBaud} baud${extra}`;
    }
    case 'bluetooth-spp':
      return params.namePrefix ? `name prefix \`${params.namePrefix}\`` : 'classic Bluetooth SPP';
    case 'bluetooth-gatt': {
      const np = params.namePrefix ? `, name prefix \`${params.namePrefix}\`` : '';
      return `service \`${params.serviceUuid}\`${np}`;
    }
    default:
      return `\`${JSON.stringify(params)}\``;
  }
}

function renderConnectivityTable(transports, support) {
  if (transports.length === 0) return '_No transports declared._';
  const lines = [
    '| Transport | Details | Status |',
    '| --- | --- | --- |',
  ];
  for (const [name, params] of transports) {
    const st = support?.transports?.[name];
    lines.push(
      `| ${transportGlyph(name)} **${transportShortLabel(name)}** | ${transportDetails(name, params)} | ${st ? statusBadgeInline(st) : '—'} |`,
    );
  }
  return lines.join('\n');
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

function renderEnginesTable(engines, support, family) {
  if (engines.length === 0) return '_No engines declared._';
  const lines = [
    '| Role | Resolution | Head | Protocol | Media | Capabilities | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const e of engines) {
    const caps = renderEngineCapabilities(e);
    if (e.bind?.usb?.bInterfaceNumber !== undefined) {
      caps.push(`USB interface ${e.bind.usb.bInterfaceNumber}`);
    }
    if (e.bind?.address !== undefined) {
      caps.push(`protocol address ${e.bind.address}`);
    }
    const st = support?.engines?.[e.role];
    const cells = [
      `**${e.role}**`,
      `${e.dpi} dpi`,
      `${e.headDots} dots`,
      renderProtocolBadge(family, e.protocol),
      e.mediaCompatibility?.length ? e.mediaCompatibility.join(', ') : '—',
      caps.length ? caps.join(', ') : '—',
      st ? statusBadgeInline(st) : '—',
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderMediaTable(media) {
  if (media.length === 0) return '_No media in the registry matches this engine._';
  const lines = [
    '| Category | Name | Dimensions | SKUs |',
    '| --- | --- | --- | --- |',
  ];
  for (const m of media) {
    lines.push(`| ${fmtCategory(m)} | ${renderMediaName(m)} | ${fmtDimensions(m)} | ${fmtSkus(m)} |`);
  }
  return lines.join('\n');
}

function renderReports(support, hasIssues) {
  const reports = support?.reports ?? [];
  if (reports.length === 0) {
    return hasIssues
      ? '_Be the first — see the **Help verify this printer** card at the top of the page._'
      : '_No reports yet._';
  }
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

function buildIssueLinks(dev, issuesUrl) {
  if (!issuesUrl) return null;
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
  return {
    verify: buildIssueUrl(issuesUrl, verifyTitle, verifyBody),
    bug:    buildIssueUrl(issuesUrl, bugTitle, bugBody),
  };
}

function renderHero(dev, driver, issuesUrl) {
  const links = buildIssueLinks(dev, issuesUrl);
  if (!links) return '';
  const status = dev.support?.status ?? 'untested';

  // Untested + broken: emphasise the verify ask. Verified + partial:
  // tone is "your refresh report still helps" but less urgent.
  const lead = (status === 'untested' || status === 'broken')
    ? `Got a **${dev.name}**? A two-minute test report turns this from **${statusBadgeInline(status)}** into **✅ verified** for everyone who buys the same model.`
    : `Got a **${dev.name}**? A fresh test report against the latest \`${driver.pkg}\` keeps this entry honest — driver versions move faster than verifications.`;

  return [
    '::: info ✋ Help verify this printer',
    lead,
    '',
    `[**File a test report →**](${links.verify})  `,
    `[**Report a bug →**](${links.bug})`,
    ':::',
  ].join('\n');
}

function renderFooterCta(dev, driver, issuesUrl) {
  const links = buildIssueLinks(dev, issuesUrl);
  if (!links) return '';
  // Source-of-truth path: each device is one JSON5 file in the driver
  // repo, named after `dev.key` exactly. Sending docs corrections
  // straight to that file beats a generic "edit this page" link to a
  // generated .md that gets overwritten on every build.
  const dataUrl = `https://github.com/thermal-label/${driver.name}/edit/main/packages/core/data/devices/${dev.key}.json5`;
  return [
    `[**Have one of these? File a verification report →**](${links.verify})`,
    `[**Found a bug? →**](${links.bug})`,
    `[**Spotted an error on this page? Edit the device data →**](${dataUrl})`,
  ].join('  \n');
}

function renderAtAGlance(dev, driver, pkgVersion) {
  const status = dev.support?.status ?? 'untested';
  const transports = Object.keys(dev.transports ?? {});
  const engines = dev.engines ?? [];

  const transportsCell = transports.length === 0
    ? '—'
    : transports.map(t => `${transportGlyph(t)} ${transportShortLabel(t)}`).join(' · ');

  const headCell = engines.length === 0
    ? '—'
    : engines.length === 1
      ? `${engines[0].headDots} dots @ ${engines[0].dpi} dpi`
      : engines.map(e => `${e.headDots} dots @ ${e.dpi} dpi (${e.role})`).join(' · ');

  const protocolCell = engines.length === 0
    ? '—'
    : engines.map(e => renderProtocolBadge(dev.family, e.protocol)).join(' · ');

  const supportPkgVersion = dev.support?.packageVersion;
  const pkgCell = supportPkgVersion
    ? `\`${driver.pkg}@${supportPkgVersion}\``
    : `\`${driver.pkg}@${pkgVersion}\``;

  const lastVerifiedCell = dev.support?.lastVerified
    ? `📅 ${dev.support.lastVerified}`
    : '—';

  const icon = deviceIconFor(dev.family, engines);
  const mediaCell = icon
    ? `<img src="/icons/device-${icon.id}.svg" class="media-icon-inline" alt="" /> ${icon.label}`
    : '—';

  const lines = [
    '| | |',
    '| --- | --- |',
    `| ${familyGlyph(dev.family)} **Family** | ${driver.displayName} |`,
    `| 🩺 **Status** | **${statusBadgeInline(status)}** |`,
    `| 🔌 **Transports** | ${transportsCell} |`,
    `| 🏷️ **Media** | ${mediaCell} |`,
    `| 📐 **Print head** | ${headCell} |`,
    `| 📡 **Protocol** | ${protocolCell} |`,
    `| 📦 **Package** | ${pkgCell} |`,
    `| 📅 **Last verified** | ${lastVerifiedCell} |`,
  ];
  return lines.join('\n');
}

function renderDevicePage(dev, driver, media, issuesUrl, pkgVersion) {
  const status = dev.support?.status ?? 'untested';
  const transports = Object.entries(dev.transports ?? {});
  const chassisCaps = renderChassisCapabilities(dev);
  const hasQuirks = !!(dev.hardwareQuirks || dev.support?.quirks);

  const sections = [];

  // Per-(family, protocol) line-art device silhouette as a floated
  // visual to the right of the title block. Sits before the H1 in
  // source order so the markdown H1 still anchors VitePress's outline.
  const icon = deviceIconFor(dev.family, dev.engines);
  if (icon) {
    sections.push(
      `<img src="/icons/device-${icon.id}.svg" class="device-hero-icon" alt="" />`,
    );
  }

  // Title with the family colour square — same vocabulary as the
  // homepage hero blocks.
  sections.push(`# ${familyGlyph(dev.family)} ${dev.name}`);

  // One-line status / transports strip under the title. The transport
  // glyphs let the eye locate "USB-only" vs "wireless" without reading.
  const transportPills = transports.length > 0
    ? transports.map(([t]) => `${transportGlyph(t)} ${transportShortLabel(t)}`).join(' · ')
    : '—';
  sections.push(`**${statusBadgeInline(status)}** · ${transportPills}`);

  // Hero CTA — first thing under the strip. Inviting test reports is
  // the highest-value action a visitor can take, so the ask leads.
  const hero = renderHero(dev, driver, issuesUrl);
  if (hero) sections.push(hero);

  // At a glance — table of high-density facts. Replaces the prose
  // subtitle and consolidates head / protocol / package / last-verified
  // in one scannable block.
  sections.push('## At a glance');
  sections.push(renderAtAGlance(dev, driver, pkgVersion));

  sections.push('## Engines');
  sections.push(renderEnginesTable(dev.engines ?? [], dev.support, dev.family));

  sections.push('## Connectivity');
  sections.push(renderConnectivityTable(transports, dev.support));
  if (chassisCaps.length > 0) {
    sections.push(`**Chassis features:** ${chassisCaps.join(', ')}`);
  }

  if (hasQuirks) {
    sections.push('## Hardware quirks');
    const quirkParts = [];
    if (dev.hardwareQuirks) quirkParts.push(dev.hardwareQuirks);
    if (dev.support?.quirks) quirkParts.push(dev.support.quirks);
    sections.push([
      '::: warning Read before integrating',
      quirkParts.join('\n\n'),
      ':::',
    ].join('\n'));
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
  sections.push(renderReports(dev.support, !!issuesUrl));

  const footerCta = renderFooterCta(dev, driver, issuesUrl);
  if (footerCta) {
    sections.push('---');
    sections.push(footerCta);
  }

  // Frontmatter — give the page a title VitePress can use, and hide
  // these per-device pages from the local search if they bloat results.
  // editLink is off because the page is generated from `data/devices/<KEY>.json5`;
  // the body's footer CTA links straight to that JSON5 file instead.
  const frontmatter = [
    '---',
    `title: ${escapeYamlValue(dev.name)}`,
    `description: ${escapeYamlValue(`${dev.name} — ${driver.displayName} hardware support, transports, supported media, and verification reports.`)}`,
    'editLink: false',
    'pageClass: hardware-detail',
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
sidebar: false
aside: false
pageClass: hardware-page
---

<script setup>
import HardwareTable from '../.vitepress/components/HardwareTable.vue';
</script>

# Hardware coverage

<ClientOnly>
  <HardwareTable />
</ClientOnly>

## Coverage stats

- **Total devices:** ${c.total}
- **Verified:** ${c.verified}
- **Partial:** ${c.partial}
- **Broken:** ${c.broken}
- **Untested:** ${c.untested}

Every device in the contracts-shape \`DEVICES\` registry of every
thermal-label driver. Each row links to a per-device page with
transports, engines, supported media, and verification reports.

::: tip Verify your device
A two-minute test helps everyone who buys one of these printers. See
the [verification guide](https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/verifying-hardware.md)
for what to run and how to file a report.
:::

<small>Generated ${data.generatedAt} from \`@thermal-label/*-core\`
\`DEVICES\` registries. The data file lives at \`/hardware/_data.json\`
if you need to consume it programmatically.</small>
`;
}

// Per-driver overview metadata used by renderDriverIndex. Each driver
// gets a tagline, a one-line description per known doc page, and a list
// of protocol pages to surface. The page-list entries are filtered
// against the actually-pulled tree, so a driver dropping (or renaming)
// a page removes it from the index without touching this script.
const DRIVER_OVERVIEWS = {
  'brother-ql': {
    tagline:
      'TypeScript driver for the Brother QL DK-tape series and the Brother PT-P / PT-E TZe / HSe tape series. Talks USB, TCP, Bluetooth SPP and Bluetooth LE.',
    pages: [
      { slug: 'getting-started',       title: 'Getting started',         desc: 'Install the packages and run a first print.' },
      { slug: 'core',                  title: 'Core',                    desc: 'Types, registries, raster encoder. Browser-safe.' },
      { slug: 'node',                  title: 'Node',                    desc: 'USB (libusb), TCP, and Serial transports for Node.' },
      { slug: 'web',                   title: 'Web (WebUSB)',            desc: 'WebUSB and Web Bluetooth in Chrome / Edge.' },
      { slug: 'hardware',              title: 'Hardware',                desc: 'Per-device pages with verification reports.' },
      { slug: 'verification-checklist',title: 'Verification checklist',  desc: 'What to run before filing a verification report.' },
      { slug: 'media',                 title: 'Media',                   desc: 'DK / TZe / HSe roll catalog.' },
      { slug: 'troubleshooting',       title: 'Troubleshooting',         desc: 'Common failure modes and how to read status frames.' },
    ],
    demoLink: '/demo/brother-ql',
    protocols: [
      { href: '/brother-ql/protocol/ql', title: 'QL raster', desc: 'DK-tape QL series, including two-colour QL-800 / QL-810W / QL-820NWB.' },
      { href: '/brother-ql/protocol/pt', title: 'PT raster', desc: 'PT-P / PT-E P-touch lineup, 128-pin and 560-pin heads, TZe + HSe.' },
    ],
  },
  labelmanager: {
    tagline:
      'TypeScript driver for the DYMO LabelManager D1 tape lineup. USB and Bluetooth LE; single-colour thermal-transfer tape from 6 mm up to 24 mm.',
    pages: [
      { slug: 'getting-started',       title: 'Getting started',         desc: 'Install the packages and run a first print.' },
      { slug: 'core',                  title: 'Core',                    desc: 'Types, encoder, D1 command stream. Browser-safe.' },
      { slug: 'node',                  title: 'Node',                    desc: 'USB and Serial transports for Node.' },
      { slug: 'web',                   title: 'Web',                     desc: 'WebUSB and Web Bluetooth in Chrome / Edge.' },
      { slug: 'hardware',              title: 'Hardware',                desc: 'Per-device pages with verification reports.' },
      { slug: 'verification-checklist',title: 'Verification checklist',  desc: 'What to run before filing a verification report.' },
    ],
    demoLink: '/demo/labelmanager',
    protocols: [
      { href: '/labelmanager/protocol', title: 'D1 tape', desc: 'LabelManager command stream over USB and BLE.' },
    ],
  },
  labelwriter: {
    tagline:
      'TypeScript driver for the DYMO LabelWriter die-cut series — LW 4xx, LW 5xx, the 4XL/5XL wide formats, and the LW 450 Duo composite. USB, TCP, and (where supported) Web Bluetooth.',
    pages: [
      { slug: 'getting-started',       title: 'Getting started',         desc: 'Install the packages and run a first print.' },
      { slug: 'core',                  title: 'Core',                    desc: 'Types, registries, raster encoders for LW 450 / LW 550 / Duo tape.' },
      { slug: 'node',                  title: 'Node',                    desc: 'USB (libusb) and TCP transports for Node.' },
      { slug: 'web',                   title: 'Web (WebUSB)',            desc: 'WebUSB pairing and printing in Chrome / Edge.' },
      { slug: 'hardware',              title: 'Hardware',                desc: 'Per-device pages, including the 550-series NFC media gate.' },
      { slug: 'verification-checklist',title: 'Verification checklist',  desc: 'What to run before filing a verification report.' },
    ],
    demoLink: '/demo/labelwriter',
    protocols: [
      { href: '/labelwriter/protocol/lw-450',   title: 'LW 450 raster',  desc: 'Classic LW 4xx generation.' },
      { href: '/labelwriter/protocol/lw-550',   title: 'LW 550 raster',  desc: 'Current LW 5xx generation, including NFC media validation.' },
      { href: '/labelwriter/protocol/duo-tape', title: 'Duo tape',       desc: 'The second interface on the LW 450 Duo.' },
    ],
    callout: {
      kind: 'warning',
      title: '550 series NFC label lock',
      body: 'The LabelWriter 550, 550 Turbo, and 5XL enforce NFC chip validation on every print job. **Non-certified labels are rejected at the hardware level** — there is no software workaround. See the [hardware list](./hardware) for the full model list.',
    },
  },
};

function renderDriverIndex(driver, pkgVersion, deviceCount) {
  const overview = DRIVER_OVERVIEWS[driver.name];
  if (!overview) {
    die(`no DRIVER_OVERVIEWS entry for ${driver.name} — add one or remove the driver from DRIVERS`);
  }

  const driverDir = join(DOCS_ROOT, driver.name);
  const present = (slug) => existsSync(join(driverDir, slug + '.md')) || existsSync(join(driverDir, slug, 'index.md'));
  const pages = overview.pages.filter(p => present(p.slug));
  const docLines = pages.map(p => `- [${p.title}](./${p.slug}) — ${p.desc}`);
  if (overview.demoLink) {
    docLines.push(`- [Live demo](${overview.demoLink}) — pair a printer over WebUSB and print from this site.`);
  }

  const familyParam = encodeURIComponent(driver.displayName);
  const corePkg = `${driver.pkg.replace(/-core$/, '')}`;
  const npmHref = `https://www.npmjs.com/package/${driver.pkg}`;
  const ghHref = `https://github.com/thermal-label/${driver.name}`;

  const sections = [];
  sections.push(`# ${corePkg}-*`);
  sections.push(overview.tagline);
  sections.push(
    `**${deviceCount} supported devices** · current version \`${pkgVersion}\` · ` +
    `[browse hardware coverage →](/hardware/#family=${familyParam})`,
  );
  sections.push('## Packages');
  sections.push([
    `- [\`${corePkg}-core\`](./core) — types, registries, encoders. Safe in Node and browsers.`,
    present('node') ? `- [\`${corePkg}-node\`](./node) — Node-side transports and adapter.` : null,
    present('web')  ? `- [\`${corePkg}-web\`](./web) — browser-side transports and adapter.` : null,
  ].filter(Boolean).join('\n'));

  sections.push('## Documentation');
  sections.push(docLines.join('\n'));

  if (existsSync(join(driverDir, 'api'))) {
    sections.push('## API reference');
    sections.push(
      `TypeDoc-generated reference for the published packages — ` +
      `[browse the API tree →](./api/).`,
    );
  }

  if (overview.protocols.length > 0) {
    sections.push('## Wire protocols');
    sections.push(overview.protocols.map(p => `- [${p.title}](${p.href}) — ${p.desc}`).join('\n'));
  }

  if (overview.callout) {
    sections.push(`::: ${overview.callout.kind} ${overview.callout.title}\n${overview.callout.body}\n:::`);
  }

  sections.push('## Source');
  sections.push(`[${ghHref.replace('https://', '')}](${ghHref}) · [npm: \`${driver.pkg}\`](${npmHref})`);

  const frontmatter = [
    '---',
    `title: ${escapeYamlValue(driver.displayName)}`,
    `description: ${escapeYamlValue(`${driver.displayName} TypeScript driver — Node, browser, hardware, wire protocol, and live demo.`)}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + sections.join('\n\n') + '\n';
}

// Walk a pulled `<driver>/api/` tree and return one entry per published
// package whose typedoc README we found. The layout is inconsistent
// across drivers (typedoc entry-point quirks): brother-ql wraps in
// `@thermal-label/<pkg>/`, labelmanager nests in `<pkg>/dist/`,
// labelwriter in `<pkg>/src/`. The detection covers all three shapes.
function detectApiPackages(apiDir) {
  if (!existsSync(apiDir)) return [];
  const out = [];

  const scoped = join(apiDir, '@thermal-label');
  if (existsSync(scoped) && statSync(scoped).isDirectory()) {
    for (const pkg of readdirSync(scoped).sort()) {
      const readme = join(scoped, pkg, 'README.md');
      if (existsSync(readme)) out.push({ pkg, href: `./@thermal-label/${pkg}/README.md` });
    }
    return out;
  }

  for (const name of readdirSync(apiDir).sort()) {
    const dirPath = join(apiDir, name);
    if (!statSync(dirPath).isDirectory()) continue;
    for (const inner of ['', 'dist', 'src']) {
      const readme = inner ? join(dirPath, inner, 'README.md') : join(dirPath, 'README.md');
      if (existsSync(readme)) {
        const href = inner ? `./${name}/${inner}/README.md` : `./${name}/README.md`;
        out.push({ pkg: name, href });
        break;
      }
    }
  }
  return out;
}

// Generate the landing page at `<driver>/api/index.md` so `/<driver>/api/`
// resolves cleanly. The typedoc tree itself stays untouched — we just
// add a friendly index that links to each per-package README.
function renderApiIndex(driver, packages) {
  const corePkg = driver.pkg.replace(/-core$/, '');
  const lines = packages.map(p => {
    // brother-ql ships per-package READMEs already named
    // `brother-ql-core` etc. inside `@thermal-label/`; labelmanager and
    // labelwriter use bare `core` / `node` / `web` directories that
    // need the driver prefix to become a full package name.
    const isFullName = p.pkg.includes('-');
    const fullName = isFullName ? `@thermal-label/${p.pkg}` : `${corePkg}-${p.pkg}`;
    return `- [\`${fullName}\`](${p.href}) — TypeDoc-generated reference.`;
  });

  const sections = [
    `# ${driver.displayName} — API reference`,
    `Generated TypeDoc reference for every package in the \`${corePkg}-*\` family. ` +
    `These pages cover the **public surface** — exported classes, interfaces, ` +
    `functions, type aliases, and variables. ` +
    `For installation, examples, and the wire-protocol references, ` +
    `start at the [${driver.displayName} overview](../).`,
    '## Packages',
    lines.length > 0 ? lines.join('\n') : '_No TypeDoc packages detected — re-run `pnpm docs:api` in the driver repo._',
    '::: info Want a guided tour first?',
    `The [${driver.displayName} overview](../) lists installation, transports, hardware, and wire protocols before you dive into the typed API.`,
    ':::',
  ];

  const frontmatter = [
    '---',
    `title: ${escapeYamlValue(`API reference — ${driver.displayName}`)}`,
    `description: ${escapeYamlValue(`TypeDoc-generated API reference for the ${corePkg}-* packages.`)}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + sections.join('\n\n') + '\n';
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

    // Replace the pulled-from-upstream `<driver>/index.md` (a hero
    // landing whose links assume the driver had its own VitePress site
    // mounted at /) with a generated overview that uses correct
    // /<driver>/* paths and surfaces only the pages actually present.
    writeFileSync(
      join(HW_ROOT, '..', driver.name, 'index.md'),
      renderDriverIndex(driver, pkgJson.version, devices.length),
    );

    // If the driver shipped a typedoc tree under `<driver>/api/`, drop
    // an index page on top so `/<driver>/api/` resolves and visitors
    // get a per-package landing instead of a 404 / raw README.
    const apiDir = join(DOCS_ROOT, driver.name, 'api');
    const apiPackages = detectApiPackages(apiDir);
    if (apiPackages.length > 0) {
      // Remove sibling-named stub `.md` files (e.g. labelmanager ships
      // `api/core.md` next to `api/core/`). VitePress route resolution
      // matches the stub first and shadows the directory, breaking any
      // link that descends into `<pkg>/dist/README.md`. Also remove
      // typedoc's `modules.md` overview since the generated index.md
      // takes its place — leaving it in would dead-link to the stubs
      // we just removed.
      for (const p of apiPackages) {
        const stub = join(apiDir, `${p.pkg}.md`);
        if (existsSync(stub) && existsSync(join(apiDir, p.pkg)) && statSync(join(apiDir, p.pkg)).isDirectory()) {
          rmSync(stub);
        }
      }
      const modulesStub = join(apiDir, 'modules.md');
      if (existsSync(modulesStub)) rmSync(modulesStub);
      writeFileSync(join(apiDir, 'index.md'), renderApiIndex(driver, apiPackages));
      log(`${driver.name}: wrote api/index.md (${apiPackages.length} package${apiPackages.length === 1 ? '' : 's'})`);
    }

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
