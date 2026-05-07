#!/usr/bin/env node
// Build the per-(device × transport) compatibility matrix that replaces
// the bundled hardware index. Reads `.aggregate/devices/<driver>.json`
// (pulled by scripts/pull-driver-docs.mjs) for every kind=driver member
// in drivers.json; emits:
//
//   - docs/hardware/index.md            VitePress page chrome + static
//                                       markdown fallback table + Vue mount
//                                       (CompatibilityMatrix.vue)
//   - docs/hardware/_matrix-data.json   the dataset the Vue component reads
//
// The matrix never re-runs propagation — every driver's codegen has
// already produced `verificationGrid` + `supportStatus` per device.
// This script's job is aggregation, integrity-check, and sort.
//
// Integrity rules (hard-fail):
//   - data/devices.json present for every driver-kind member.
//   - For every cell with `propagatedFrom`, the source `deviceKey`
//     resolves inside the same driver's `devices[].key` set.
//
// Sort: rolled-up `supportStatus` desc (verified > expected > partial >
// unverified > unsupported); tiebreak = registry order (the order in
// which devices appear in the driver's data/devices.json, which
// reflects DEVICES registry order).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driverMembers, loadDrivers } from './lib/load-drivers.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const HW_ROOT = join(DOCS_ROOT, 'hardware');
const AGG_DEVICES_DIR = join(SITE_ROOT, '.aggregate', 'devices');

const SITE_HOSTNAME = 'https://thermal-label.github.io';

function log(msg) { process.stdout.write(`[build-matrix-page] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-matrix-page] error: ${msg}\n`); process.exit(1); }

// Per-driver family-glyph for the matrix. Same vocabulary as the
// homepage hero blocks, extended to cover the incoming OEM-mixed
// drivers. Matrix uses uniform colour for the matrix itself; the glyph
// just helps a reader parse the family column at a glance.
const FAMILY_GLYPH = {
  'brother-ql':   'B',
  'cat-printer':  'C',
  'labelife':     'A',
  'labelmanager': 'M',
  'labelwriter':  'W',
  'letratag':     'T',
  'marklife':     'K',
  'niimbot':      'N',
};

const TRANSPORT_LABEL = {
  usb: 'USB',
  tcp: 'TCP',
  serial: 'Serial',
  'bluetooth-spp': 'BT SPP',
  'bluetooth-gatt': 'BT LE',
};

const TRANSPORT_ORDER = ['usb', 'tcp', 'serial', 'bluetooth-spp', 'bluetooth-gatt'];

// User-facing label per EffectiveStatus rung. "Likely works" is the
// user-facing label for the `expected` rung; the docs-site audience
// doesn't need to learn the propagation jargon.
const STATUS_LABEL = {
  verified:    'Verified',
  expected:    'Likely works',
  partial:     'Partial',
  unverified:  'Unverified',
  unsupported: 'Unsupported',
};

// Sort weight: smaller = closer to the top of the matrix. `unsupported`
// is intentionally above `unverified` in the badge stack but below it
// in the device-level rollup — that's the rolled-up rule (worst-case).
// We trust the `supportStatus` field on each device, which already
// applies that rule per contracts/expand.ts:rollupStatus().
//
// For sorting devices: verified > expected > partial > unverified >
// unsupported. Verified rows lead because the matrix is a
// "what works" surface; unsupported rows sink because they're
// known-broken and the maintainer doesn't want browsers to scroll past
// them on the way to the actually-useful entries.
const STATUS_SORT_WEIGHT = {
  verified:    0,
  expected:    1,
  partial:     2,
  unverified:  3,
  unsupported: 4,
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

function escapeYamlValue(v) {
  return String(v).replace(/"/g, '\\"');
}

function emitHeadFrontmatter(entries) {
  if (!entries || entries.length === 0) return '';
  return 'head:\n' + entries.map(e => '  - ' + JSON.stringify(e)).join('\n') + '\n';
}

// Validate each driver's projection: every `propagatedFrom.from.deviceKey`
// must resolve to another device in the same driver. Catches doc-rot
// when a driver renames or deletes a device between codegen and
// aggregation pull.
function validateIntegrity(driverName, devices) {
  const keys = new Set(devices.map(d => d.key));
  for (const dev of devices) {
    const grid = dev.verificationGrid ?? {};
    for (const [transport, cell] of Object.entries(grid)) {
      const provs = cell.propagatedFrom ?? [];
      for (const p of provs) {
        const k = p?.from?.deviceKey;
        if (!k) {
          die(`${driverName}: device ${dev.key} cell ${transport}: propagatedFrom entry missing from.deviceKey`);
        }
        if (!keys.has(k)) {
          die(
            `${driverName}: device ${dev.key} cell ${transport}: ` +
            `propagatedFrom references unknown deviceKey "${k}" — ` +
            `re-run \`pnpm compile-data\` in the driver and re-pull.`,
          );
        }
      }
    }
  }
}

// Read the aggregated projection and add the manifest `displayName` /
// `manufacturer` for downstream rendering.
function loadDriverDataset(member) {
  const path = join(AGG_DEVICES_DIR, `${member.name}.json`);
  if (!existsSync(path)) {
    die(
      `${member.name}: missing .aggregate/devices/${member.name}.json — ` +
      `run \`npm run docs:pull\` first. Hard-fail: every driver-kind ` +
      `member must publish data/devices.json on its pinned ref.`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed.devices)) {
    die(`${member.name}: data/devices.json missing devices[] array`);
  }
  validateIntegrity(member.name, parsed.devices);
  return parsed;
}

function devSlug(key) {
  return key.toLowerCase().replace(/_/g, '-');
}

// One row of the matrix: a device with its transport-keyed grid.
function buildRow(driver, dev, registryIndex) {
  const transports = Object.keys(dev.transports ?? {});
  const grid = dev.verificationGrid ?? {};
  const cells = {};
  for (const t of TRANSPORT_ORDER) {
    if (!(t in (dev.transports ?? {}))) continue;
    const cell = grid[t] ?? { status: 'unverified' };
    cells[t] = cell;
  }
  const issues = [];
  // Issue numbers live on stored cells via `verifications` (not
  // surfaced into the rich projection's grid yet — only shape we have).
  // The projection's flat `support.transports` map is keyed by transport
  // → status string, not the rich VerificationCell. Until codegen
  // surfaces issue numbers into `verificationGrid`, the matrix renders
  // `expected` provenance and reasons but no issue chips.
  return {
    driver: driver.name,
    family: driver.displayName,
    manufacturer: driver.manufacturer,
    key: dev.key,
    name: dev.name,
    slug: devSlug(dev.key),
    transports,
    cells,
    supportStatus: dev.supportStatus ?? 'unverified',
    multiEngine: Array.isArray(dev.engines) && dev.engines.length > 1,
    registryIndex,
    issues,
  };
}

function buildHardwareIndexHead(description, totalDevices) {
  const url = `${SITE_HOSTNAME}/hardware/`;
  const title = 'Hardware compatibility matrix — thermal-label';
  const meta = (key, name, content) => ['meta', { [key]: name, content }];
  return [
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', url),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'thermal-label'),
    meta('name', 'twitter:card', 'summary'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'thermal-label', url: SITE_HOSTNAME },
      numberOfItems: totalDevices,
    })],
  ];
}

// Static markdown fallback. Per the SEO §1 pattern: rendered server-
// side, hidden by `body.hw-table-hydrated` once CompatibilityMatrix.vue
// mounts. The fallback covers every cell in flat form so crawlers see
// the data; the interactive matrix is the richer view for real users.
//
// Per-device pages only exist for published drivers (build-hardware-
// page.mjs writes them); incoming-driver rows render the model name
// as plain text to avoid dead links the build would refuse.
function renderStaticFallback(rows, totalCells, publishedSet) {
  if (rows.length === 0) return '_No devices in the registry yet._';
  const lines = [
    `_Static fallback — ${rows.length} devices, ${totalCells} (device × transport) cells. The interactive matrix above lets you filter and drills tooltips into propagation provenance._`,
    '',
    '| Driver | Model | Transport | Status |',
    '| --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    for (const t of TRANSPORT_ORDER) {
      const cell = row.cells[t];
      if (!cell) continue;
      const tlabel = TRANSPORT_LABEL[t] ?? t;
      const slabel = STATUS_LABEL[cell.status] ?? cell.status;
      const nameCell = publishedSet.has(row.driver)
        ? `[${escapeHtml(row.name)}](/hardware/${row.driver}/${row.slug})`
        : escapeHtml(row.name);
      lines.push(`| ${row.family} | ${nameCell} | ${tlabel} | ${slabel} |`);
    }
  }
  return lines.join('\n');
}

function renderMatrixPage(matrixData, publishedSet) {
  const description =
    `Per-(device × transport) compatibility matrix across all ${matrixData.driverCount} ` +
    `thermal-label drivers — ${matrixData.deviceCount} devices, ` +
    `${matrixData.cellCount} verification cells, with provenance for every ` +
    `propagated "likely works" claim.`;
  const head = buildHardwareIndexHead(description, matrixData.deviceCount);
  const fallback = renderStaticFallback(matrixData.rows, matrixData.cellCount, publishedSet);

  const frontmatter = [
    '---',
    'title: Hardware compatibility matrix',
    `description: ${escapeYamlValue(description)}`,
    'sidebar: false',
    'aside: false',
    'pageClass: hardware-page',
    emitHeadFrontmatter(head).trimEnd(),
    '---',
    '',
  ].join('\n');

  // Sibling-protocol density expectation, set up-front per the plan's
  // "intro copy should set this expectation honestly" note.
  const intro = [
    '<script setup>',
    "import CompatibilityMatrix from '../.vitepress/components/CompatibilityMatrix.vue';",
    '</script>',
    '',
    '# Hardware compatibility matrix',
    '',
    `Every supported device across **${matrixData.driverCount} drivers** ` +
    `(${matrixData.deviceCount} models, ${matrixData.cellCount} per-transport ` +
    `cells). Cells carry the rung the maintainer or community has reached: ` +
    `**Verified** = directly tested, **Likely works** = inferred from a ` +
    `verified sibling-protocol or cross-transport observation, ` +
    `**Partial** / **Unsupported** = directly observed limits, ` +
    `**Unverified** = no claim recorded yet.`,
    '',
    '<CompatibilityMatrix />',
    '',
    '<div class="hw-static-fallback">',
    '',
    fallback,
    '',
    '</div>',
    '',
    '## How to read this matrix',
    '',
    '- Each row is one device; each cell is one transport on that device. ' +
    'A device with USB and Bluetooth contributes two cells.',
    '- **Verified** is direct observation. Refresh reports against the ' +
    'latest driver release keep that rung honest — see [each device page](#).',
    '- **Likely works** lifts from a related cell — the same protocol on a ' +
    'sibling device, or a different transport on the same device. Hover the ' +
    'badge to see which observation lifted it.',
    '- **Multi-engine** devices (LabelWriter Duo, Twin Turbo) deliberately ' +
    'skip propagation — their cells are direct-only.',
    '- Sibling-protocol propagation operates on *exact* protocol strings, ' +
    'so vendor families light up in narrow clusters (e.g. `lw-450` and ' +
    '`lw-550` are distinct). Established generations fan out reasonably; ' +
    'one verified cell does **not** turn the whole vendor green.',
    '',
    '::: tip Verify your device',
    'A two-minute test report turns a row from **Likely works** into ' +
    '**Verified** for everyone who buys the same model. Open the linked ' +
    'device page and follow the **File a verification report** button.',
    ':::',
    '',
    `<small>Generated ${matrixData.generatedAt} from per-driver ` +
    '`packages/core/data/devices.json` projections. The aggregate dataset ' +
    'lives at `/hardware/_matrix-data.json` if you need to consume it ' +
    'programmatically.</small>',
    '',
  ].join('\n');

  return frontmatter + intro;
}

function main() {
  const drivers = driverMembers(loadDrivers());
  if (drivers.length === 0) die('drivers.json contains no kind=driver members');

  const driverMeta = [];
  const allRows = [];
  let cellCount = 0;
  const statusCounts = { verified: 0, expected: 0, partial: 0, unverified: 0, unsupported: 0 };

  for (const driver of drivers) {
    const dataset = loadDriverDataset(driver);
    const rows = dataset.devices.map((dev, idx) => buildRow(driver, dev, idx));
    for (const row of rows) {
      cellCount += Object.keys(row.cells).length;
      const s = row.supportStatus;
      if (s in statusCounts) statusCounts[s]++;
    }
    driverMeta.push({
      name: driver.name,
      displayName: driver.displayName,
      manufacturer: driver.manufacturer,
      published: driver.published !== false,
      glyph: FAMILY_GLYPH[driver.name] ?? '·',
      deviceCount: rows.length,
    });
    allRows.push(...rows);
    log(`${driver.name}: ${rows.length} devices, ${rows.reduce((acc, r) => acc + Object.keys(r.cells).length, 0)} cells`);
  }

  // Default sort: rolled-up supportStatus desc, tiebreak = registry
  // order (per-driver). Cross-driver: keep drivers in drivers.json
  // order so e.g. labelwriter rows don't get scattered across other
  // drivers' verifieds — the user's mental model is "browse a family,
  // then read its rungs."
  const driverIndex = new Map(drivers.map((d, i) => [d.name, i]));
  allRows.sort((a, b) => {
    const dw =
      (STATUS_SORT_WEIGHT[a.supportStatus] ?? 99) -
      (STATUS_SORT_WEIGHT[b.supportStatus] ?? 99);
    if (dw !== 0) return dw;
    const ddiff = (driverIndex.get(a.driver) ?? 99) - (driverIndex.get(b.driver) ?? 99);
    if (ddiff !== 0) return ddiff;
    return a.registryIndex - b.registryIndex;
  });

  const matrixData = {
    generatedAt: new Date().toISOString(),
    driverCount: drivers.length,
    deviceCount: allRows.length,
    cellCount,
    statusCounts,
    transports: TRANSPORT_ORDER,
    transportLabels: TRANSPORT_LABEL,
    statusLabels: STATUS_LABEL,
    drivers: driverMeta,
    rows: allRows,
  };

  mkdirSync(HW_ROOT, { recursive: true });
  writeFileSync(join(HW_ROOT, '_matrix-data.json'), JSON.stringify(matrixData, null, 2) + '\n');
  log(`wrote _matrix-data.json (${allRows.length} devices, ${cellCount} cells)`);

  const publishedSet = new Set(drivers.filter(d => d.published !== false).map(d => d.name));
  writeFileSync(join(HW_ROOT, 'index.md'), renderMatrixPage(matrixData, publishedSet));
  log('wrote index.md');
}

main();
