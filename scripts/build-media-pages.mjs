#!/usr/bin/env node
// Build per-driver media pages from each driver's compiled media
// catalogue (`packages/core/data/media.json`, or `data/media.json` for
// d1-core). One page per member whose drivers.json entry declares a
// `mediaDataFile` — the rest are skipped on purpose (labelmanager
// consumes d1-core's shared D1 catalogue and gets no dedicated page).
//
// Pipeline position: docs:pull pulls every declared media catalogue
// into `.aggregate/media/<name>.json`. This script reads those files
// plus the device aggregates (for tape-system / dpi / head-size intro
// copy) and writes `docs/<name>/media.md`.
//
// Slot-include: when a member declares `mediaFragment` in drivers.json
// (today only brother-ql, pointing at `docs/media-pinmap-fragment.md`)
// the generator splices the hand-authored fragment in *after* the
// generic tables. That keeps the SVG pin-map / SW table / status-byte
// notes intact while the registry-driven catalog leads the page.
//
// Hard-fails on:
//   - missing `.aggregate/media/<name>.json` for a member with a
//     declared `mediaDataFile` (means docs:pull was skipped)
//   - structurally malformed media files (no array we recognise)
//
// Run order: docs:pull → docs:media → vitepress build.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDrivers } from './lib/load-drivers.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const AGG_MEDIA_DIR = join(SITE_ROOT, '.aggregate', 'media');
const AGG_DEVICES_DIR = join(SITE_ROOT, '.aggregate', 'devices');

function log(msg) { process.stdout.write(`[build-media-pages] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-media-pages] error: ${msg}\n`); process.exit(1); }

// Per-driver intro copy that doesn't fit cleanly under "derive from
// device aggregate" — taxonomy hints, source of the catalogue, etc.
// Keep one paragraph per driver, deliberately short. Anything richer
// belongs on the driver's `index.md` landing.
const INTRO_BLURB = {
  'brother-ql':
    'Brother\'s DK roll family (QL series) and the TZe / HSe tape family (PT-P / PT-E series). DK rolls are die-cut or continuous paper / film; TZe is laminated tape; HSe is heat-shrink tubing. `targetModels` gates which substrate family each engine accepts — narrow QL chassis carry `dk`, the QL-1xxx wide chassis add `dk-wide`, and the PT lineup carries `tze`, `hse-2to1`, and `hse-3to1`.',
  'labelwriter':
    'DYMO LabelWriter paper consumables — die-cut and continuous rolls. D1 tape entries (LabelWriter 450 Duo) are merged in from the shared `@thermal-label/d1-core` catalogue at runtime; see the [d1-core media catalogue](/d1-core/media) for the tape side.',
  letratag:
    'DYMO LetraTag cassettes — 12 mm paper / plastic / metallic / iron-on tape, one ink colour per cassette. SKUs cover both the US (`91XXX`) and EU (`S07XXXXX`) part numbers for the same physical tape.',
  niimbot:
    'NIIMBOT roll catalogue, keyed on RFID barcode. There is no published vendor SKU list — entries here are sourced from community OSS projects (niimprint, NiimBlue, niimbot-bridge) and from accepted hardware-verification reports. `barcodes: []` means the entry is dimensions-only; the first report that captures a real RFID payload promotes the row.',
  marklife:
    'Marklife continuous thermal sticker stock plus gap / die-cut stock. `targetModels` reflects an internal head-size class — `narrow-tape` (~0.5 inch), `mobile-2in`, `desktop-3in`, `industrial-4in`.',
  labelife:
    'labelife (Aimo / Quyin) continuous thermal rolls and RFID-tagged cassettes. There is no exhaustive published catalogue; entries grow reactively as users file verification reports. `targetModels` carries an internal substrate taxonomy (`hh-50`, `hh-80`, `desk-80`, `desk-100`, `desk-wide`, `rfid-cassette`).',
  'cat-printer':
    'Cat-printer chassis (Phomemo M02 family and NaitLee-supported clones) print only on continuous direct-thermal sticker stock. `targetModels` reflects head width — `mini-50` (384 dot), `mini-58` (432 dot), `mini-80` (576 dot).',
  'd1-core':
    'Shared D1 cassette catalogue consumed by both the [LabelManager](/labelmanager/) driver and the [LabelWriter Duo](/labelwriter/) tape side. Entries cover the three mechanical width tiers — 12 mm (`d1`), 19 mm (`d1-wide`), 24 mm (`d1-24`) — plus DYMO\'s Rhino™ industrial cartridges, which mechanically fit D1 chassis (no warranty / official endorsement; substrate wear varies).',
};

// Friendly label for the `type` field on each row.
const TYPE_LABEL = {
  'die-cut':    'die-cut',
  continuous:   'continuous',
  tape:         'tape cassette',
  'rfid-tag':   'RFID cassette',
};

// Friendly label for the `category` field on each row, when set.
const CATEGORY_LABEL = {
  address:           'Address',
  shipping:          'Shipping',
  'multi-purpose':   'Multi-purpose',
  filing:            'Filing',
  audiovisual:       'A/V',
  cartridge:         'Cartridge',
  continuous:        'Continuous',
};

const MEDIA_COLOR_HEX = {
  black:  '#1f1f1f',
  white:  '#ffffff',
  blue:   '#1e6cd6',
  red:    '#d93636',
  green:  '#2e8540',
  orange: '#f39820',
  yellow: '#f5dd2c',
  gold:   '#d4af37',
  silver: '#c0c0c0',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeYamlValue(v) {
  return String(v).replace(/"/g, '\\"');
}

// Parse the pulled `.json` for a member. The compiled shapes diverge
// historically:
//   - most drivers:   { schemaVersion, driver, media: [...] }
//   - d1-core:        { schemaVersion, media: [...] }       (no `driver`)
//   - letratag:       [ ... ]                               (bare array)
// All three resolve to the same { entries: [...] } shape here, and any
// other shape hard-fails the build.
function loadMedia(name) {
  const path = join(AGG_MEDIA_DIR, `${name}.json`);
  if (!existsSync(path)) {
    die(
      `${name}: media catalogue not at ${path} — ` +
      `expected pull-driver-docs.mjs to copy it from the source repo. ` +
      `Did docs:pull run? Is drivers.json's mediaDataFile correct?`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`${name}: malformed media JSON at ${path}: ${err.message}`);
  }
  if (Array.isArray(parsed)) return { entries: parsed };
  if (parsed && Array.isArray(parsed.media)) return { entries: parsed.media };
  die(
    `${name}: media JSON at ${path} is neither an array nor an object with a 'media' array — ` +
    `cannot generate page (registry schema drift?).`,
  );
}

function loadDevices(name) {
  const path = join(AGG_DEVICES_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(j.devices) ? j.devices : null;
  } catch {
    return null;
  }
}

// Derive a short factual snippet from the device aggregate — print
// resolutions across the lineup, head sizes, transports. Returns null
// for protocol-core members (no devices). Slotted into the per-driver
// intro under the hand-curated blurb.
function deriveIntroFacts(devices) {
  if (!devices || devices.length === 0) return null;
  const dpis = new Set();
  const heads = new Set();
  const protocols = new Set();
  for (const dev of devices) {
    for (const e of dev.engines || []) {
      if (e.dpi != null) dpis.add(e.dpi);
      if (e.headDots != null) heads.add(e.headDots);
      if (e.protocol) protocols.add(e.protocol);
    }
  }
  const parts = [];
  if (dpis.size > 0) {
    parts.push(`**Resolution:** ${[...dpis].sort((a, b) => a - b).join(' / ')} dpi`);
  }
  if (heads.size > 0) {
    parts.push(`**Head width:** ${[...heads].sort((a, b) => a - b).join(' / ')} dots`);
  }
  if (protocols.size > 0) {
    const list = [...protocols].sort();
    parts.push(`**Wire protocol${list.length === 1 ? '' : 's'}:** ${list.map(p => '`' + p + '`').join(', ')}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

function renderTypeCell(m) {
  if (!m.type) return '—';
  return TYPE_LABEL[m.type] ?? m.type;
}

function renderCategoryCell(m) {
  const c = m.category;
  if (!c) return '—';
  return CATEGORY_LABEL[c] ?? c;
}

function renderWidthCell(m) {
  if (m.widthMm != null && m.heightMm != null) {
    return `${m.widthMm} × ${m.heightMm} mm`;
  }
  if (m.widthMm != null) return `${m.widthMm} mm`;
  return '—';
}

function renderPaletteCell(m) {
  // Multi-ink media — brother-ql DK-22251 today. Render each colour as
  // a swatch dot so the two-colour roll reads at a glance. Palette
  // entries are `{ name, rgb }` objects in the brother-ql shape; bare
  // strings would be tolerated too.
  if (Array.isArray(m.palette) && m.palette.length > 0) {
    return m.palette
      .map(entry => {
        const name = typeof entry === 'string' ? entry : entry?.name;
        const rgb = typeof entry === 'object' && Array.isArray(entry?.rgb) ? entry.rgb : null;
        const hex = MEDIA_COLOR_HEX[name]
          ?? (rgb ? '#' + rgb.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('') : null);
        if (!hex) return escapeHtml(name ?? '?');
        return `<span class="media-swatch-dot" style="--swatch-bg:${hex};" title="${escapeHtml(name ?? '')}"></span>`;
      })
      .join(' ');
  }
  // Single-ink tape (D1, LetraTag, LW Duo) — text-on-background pair.
  const bg = m.background;
  const fg = m.text;
  if (bg && fg) {
    const fgHex = MEDIA_COLOR_HEX[fg];
    const bgHex = bg === 'clear' ? null : MEDIA_COLOR_HEX[bg];
    if (fgHex) {
      if (bg === 'clear') {
        return `<span class="media-swatch media-swatch--clear" style="--swatch-fg:${fgHex};">${escapeHtml(fg)} on clear</span>`;
      }
      if (bgHex) {
        return `<span class="media-swatch" style="--swatch-bg:${bgHex};--swatch-fg:${fgHex};">${escapeHtml(fg)} on ${escapeHtml(bg)}</span>`;
      }
    }
    return `${escapeHtml(fg)} on ${escapeHtml(bg)}`;
  }
  return '—';
}

function renderTargetModelsCell(m) {
  if (!Array.isArray(m.targetModels) || m.targetModels.length === 0) return '—';
  return m.targetModels.map(t => '`' + t + '`').join(', ');
}

function renderIdCell(m) {
  if (m.id != null) return '`' + m.id + '`';
  if (m.key != null) return '`' + m.key + '`';
  return '—';
}

function renderSkusCell(m) {
  if (!Array.isArray(m.skus) || m.skus.length === 0) return '—';
  // Cap at 3 SKUs in the table; the full list shows up on the
  // hardware per-device "Supported media" tables. The picker UX
  // already exposes the full SKU list elsewhere; the media page is
  // a catalogue overview, not a procurement listing.
  if (m.skus.length <= 3) return m.skus.map(s => '`' + s + '`').join(', ');
  return m.skus.slice(0, 3).map(s => '`' + s + '`').join(', ') + ` _(+${m.skus.length - 3} more)_`;
}

// Decide which optional columns to include based on whether *any* entry
// in the catalogue carries the field. Saves emitting an all-dashes
// column for drivers (e.g. cat-printer, labelife) that don't carry
// `palette` or `category`.
function detectColumns(entries) {
  const hasPalette = entries.some(m =>
    (Array.isArray(m.palette) && m.palette.length > 0) || (m.background && m.text),
  );
  const hasCategory = entries.some(m => m.category);
  const hasTargetModels = entries.some(m => Array.isArray(m.targetModels) && m.targetModels.length > 0);
  const hasSkus = entries.some(m => Array.isArray(m.skus) && m.skus.length > 0);
  return { hasPalette, hasCategory, hasTargetModels, hasSkus };
}

function renderMainTable(entries, cols) {
  if (entries.length === 0) return '_No entries in the registry._';
  const header = ['ID', 'Name', 'Type'];
  if (cols.hasCategory) header.push('Category');
  header.push('Width');
  if (cols.hasPalette) header.push('Palette');
  if (cols.hasTargetModels) header.push('Targets');
  if (cols.hasSkus) header.push('SKUs');

  const sep = header.map(() => '---');
  const lines = [
    '| ' + header.join(' | ') + ' |',
    '| ' + sep.join(' | ') + ' |',
  ];

  for (const m of entries) {
    const row = [
      renderIdCell(m),
      escapeHtml(m.name ?? m.id ?? m.key ?? '—'),
      renderTypeCell(m),
    ];
    if (cols.hasCategory) row.push(renderCategoryCell(m));
    row.push(renderWidthCell(m));
    if (cols.hasPalette) row.push(renderPaletteCell(m));
    if (cols.hasTargetModels) row.push(renderTargetModelsCell(m));
    if (cols.hasSkus) row.push(renderSkusCell(m));
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return lines.join('\n');
}

// Group rows by `targetModels` set (joined). Useful for drivers where
// the gate carries genuine meaning (head-size class for marklife /
// labelife / niimbot, chassis tier for brother-ql / d1-core).
function renderGroupedByTarget(entries) {
  const groups = new Map();
  for (const m of entries) {
    const tm = Array.isArray(m.targetModels) ? m.targetModels.slice().sort() : [];
    const key = tm.length === 0 ? '_ungated_' : tm.join(', ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  if (groups.size <= 1) return null;
  const lines = [];
  for (const key of [...groups.keys()].sort()) {
    const rows = groups.get(key);
    const label = key === '_ungated_' ? 'Ungated (matches any model)' : key.split(', ').map(t => '`' + t + '`').join(', ');
    lines.push(`- **${label}** — ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`);
  }
  return lines.join('\n');
}

// Demote markdown headings by one level. Used when slotting a hand-
// authored fragment under the generated H1 — the fragment's own H1
// becomes an H2, etc. ATX-only (`#`-style); fragments today use this
// style throughout. Setext (underline) headings would slip through;
// not currently used in any fragment.
function demoteHeadings(md) {
  return md.replace(/^(#{1,5}) /gm, (_, h) => '#' + h + ' ');
}

function loadFragment(name, mediaFragment) {
  if (!mediaFragment) return null;
  // The fragment lives in the driver repo's docs/ tree, which gets
  // pulled into thermal-label.github.io/docs/<name>/ wholesale. So
  // its post-pull path is predictable: strip the leading `docs/`.
  const rel = mediaFragment.replace(/^docs\//, '');
  const fragPath = join(DOCS_ROOT, name, rel);
  if (!existsSync(fragPath)) {
    die(
      `${name}: mediaFragment declared as ${mediaFragment} but ${fragPath} is missing after docs:pull. ` +
      `Either the fragment doesn't exist in the source repo or the path is wrong.`,
    );
  }
  return readFileSync(fragPath, 'utf8');
}

function renderPage(member, mediaResult, devices) {
  const { entries } = mediaResult;
  const blurb = INTRO_BLURB[member.name];
  const facts = deriveIntroFacts(devices);
  const cols = detectColumns(entries);
  const grouped = renderGroupedByTarget(entries);
  const fragment = loadFragment(member.name, member.mediaFragment);

  const displayName = member.displayName ?? member.name;
  const title = member.kind === 'driver' ? `${displayName} — Media catalogue` : `${displayName} — Media`;
  const description = `Media catalogue for ${displayName} — every entry in the registry that ships with @thermal-label/${member.name === 'd1-core' ? 'd1-core' : member.name + '-core'}.`;

  const sections = [];
  sections.push(`# ${displayName} — Media`);

  if (blurb) {
    sections.push(blurb);
  } else {
    sections.push(`Registry of every media entry shipped by \`@thermal-label/${member.name}-core\`.`);
  }

  if (facts) sections.push(facts);

  sections.push(`**${entries.length}** ${entries.length === 1 ? 'entry' : 'entries'} in the registry.`);

  sections.push('## Catalogue');
  sections.push(renderMainTable(entries, cols));

  if (grouped) {
    sections.push('## By target-model gate');
    sections.push(
      'The `targetModels` field on each entry is the substrate gate — engines that declare a matching `mediaCompatibility` tag accept the entry. Counts per gate:',
    );
    sections.push(grouped);
  }

  // Slot the hand-authored fragment after the generic tables. For
  // brother-ql today the fragment carries the SW pin map + status-byte
  // observations, which are reference material rather than catalogue
  // navigation — readers come to the page for "what rolls does this
  // driver know about", then drop into the pin-map for low-level work.
  // Placing the fragment after the generic tables matches that flow.
  if (fragment) {
    sections.push(demoteHeadings(fragment).trim());
  }

  const frontmatter = [
    '---',
    `title: ${escapeYamlValue(title)}`,
    `description: ${escapeYamlValue(description)}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + sections.join('\n\n') + '\n';
}

function main() {
  const members = loadDrivers();
  let wrote = 0;
  for (const m of members) {
    if (!m.mediaDataFile) continue;
    const mediaResult = loadMedia(m.name);
    const devices = loadDevices(m.name);
    // `published: false` drivers (e.g. cat-printer, niimbot today) are
    // skipped by pull-driver-docs.mjs's REPOS filter, so docs/<name>/
    // may not exist yet. Create it so the matrix and media pages still
    // generate; the empty driver landing is harmless and lets the
    // pre-publish work proceed.
    const destDir = join(DOCS_ROOT, m.name);
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, 'media.md');
    writeFileSync(destPath, renderPage(m, mediaResult, devices));
    log(`${m.name}: ${mediaResult.entries.length} media entries, wrote docs/${m.name}/media.md`);
    wrote++;
  }
  log(`wrote ${wrote} media page${wrote === 1 ? '' : 's'}`);
}

main();
