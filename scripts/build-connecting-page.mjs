#!/usr/bin/env node
// Build the org-level "Connecting your printer" page from aggregated
// per-driver `.aggregate/devices/<driver>.json` files (written by
// scripts/pull-driver-docs.mjs).
//
// Why this script exists: connection-mode quirks (Linux udev VIDs,
// mass-storage decoy PIDs, Editor Lite hardware toggles) are scattered
// across per-driver hardwareQuirks free-text and per-device
// `capabilities.massStoragePid` / `capabilities.editorLite` fields.
// Keeping a single org-level page hand-written drifts the moment a new
// driver or PID lands. This script aggregates whatever the registries
// expose today and surfaces it as one page.
//
// Outputs:
//   - docs/connecting.md
//
// Sources (in priority order):
//   1. Structured device fields:
//        - transports.usb.vid                       — udev VID coverage
//        - capabilities.massStoragePid              — explicit decoy PID
//        - capabilities.editorLite                  — Brother Editor Lite trick
//   2. Free-text `hardwareQuirks` regex:
//        - "under PID `0x...`"                      — labelmanager pattern
//   3. Optional per-driver `docs/<driver>/connecting-fragment.md`
//      pulled into docs/<driver>/ by pull-driver-docs.mjs.
//
// Hard-fails if `.aggregate/devices/` is missing or empty (means the
// pull step hasn't run, or all driver data-set pulls failed — see
// pull-driver-docs.mjs).

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const AGG_DEVICES_DIR = join(SITE_ROOT, '.aggregate', 'devices');
const OUT_PATH = join(DOCS_ROOT, 'connecting.md');

// Display name + udev hint per vendor. Keyed by USB VID (lowercased,
// no `0x` prefix). Anything not in this map gets a "Vendor 0x????"
// fallback so a new VID still renders without code edits, just without
// the vendor name.
const VENDOR_INFO = {
  '04f9': { name: 'Brother',  scope: 'Brother QL DK-tape series and PT-* P-touch series' },
  '0922': { name: 'DYMO',     scope: 'DYMO LabelManager, LabelWriter, and LabelWriter Duo' },
};

// Drivers that emit BLE-only entries seed `0x0000` as a placeholder VID
// in their devices.json. udev rules don't apply to BLE — Web Bluetooth
// and the Node bluetooth stack take care of access on their own — so
// we skip these when building the udev table.
const BLE_PLACEHOLDER_VIDS = new Set(['0x0000']);

function log(msg) { process.stdout.write(`[build-connecting-page] ${msg}\n`); }
function die(msg) { process.stderr.write(`[build-connecting-page] error: ${msg}\n`); process.exit(1); }

function loadAggregates() {
  if (!existsSync(AGG_DEVICES_DIR)) {
    die(`${AGG_DEVICES_DIR} missing — run \`docs:pull\` first`);
  }
  const files = readdirSync(AGG_DEVICES_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    die(`${AGG_DEVICES_DIR} is empty — run \`docs:pull\` first`);
  }
  return files.map(f => {
    const raw = readFileSync(join(AGG_DEVICES_DIR, f), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.driver || !Array.isArray(parsed.devices)) {
      die(`${f}: expected { driver, devices: [...] }`);
    }
    return parsed;
  });
}

// Aggregate every `transports.usb.vid` that appears on any device,
// keyed by VID. Each entry tracks which driver/family it came from so
// the udev table can name the affected families.
function collectVendors(aggregates) {
  const byVid = new Map();
  for (const agg of aggregates) {
    for (const dev of agg.devices) {
      const vid = dev.transports?.usb?.vid;
      if (!vid) continue;
      if (BLE_PLACEHOLDER_VIDS.has(vid)) continue;
      const key = vid.toLowerCase();
      if (!byVid.has(key)) byVid.set(key, { vid: key, drivers: new Set(), deviceCount: 0 });
      const e = byVid.get(key);
      e.drivers.add(agg.driver);
      e.deviceCount++;
    }
  }
  // Sort vendors by the first driver that uses them, for table stability.
  return [...byVid.values()].sort((a, b) => a.vid.localeCompare(b.vid));
}

// Detect a stuck-state PID for a device. Returns `{ pid, source }`
// where source is 'capability' (structured) or 'quirks' (regex on
// hardwareQuirks free text), or null when nothing is known.
//
// Structured: `device.capabilities.massStoragePid` (brother-ql ships
// this on the four Editor-Lite QL models + PT-P750W).
//
// Free-text: labelmanager devices spell out the decoy PID inline as
// `Enumerates as USB Mass Storage Class on first connect under PID
// `0x1005`; needs `usb_modeswitch` ...`. We pick up the first
// backtick-wrapped `0x....` after "under PID ".
function detectStuckPid(dev) {
  const cap = dev.capabilities?.massStoragePid;
  if (cap) return { pid: cap, source: 'capability' };

  const txt = dev.hardwareQuirks ?? '';
  // "under PID `0xNNNN`" or "PID `0xNNNN`" mass-storage context.
  const m = /under PID\s+`(0x[0-9a-fA-F]{4})`/.exec(txt);
  if (m) return { pid: m[1].toLowerCase(), source: 'quirks' };
  return null;
}

// Walk every device and return one row per device that has a
// detectable stuck-state PID. Devices that only have free-text mention
// of mass-storage WITHOUT a matchable PID still produce a row, with
// `pid: null` and a "free-text only" marker, so the maintainer can see
// what they're missing from a structured field.
function collectStuckPidRows(aggregates) {
  const rows = [];
  const unknownMentions = [];
  for (const agg of aggregates) {
    for (const dev of agg.devices) {
      const quirks = dev.hardwareQuirks ?? '';
      const supportQuirks = dev.support?.quirks ?? '';
      const combined = `${quirks}\n${supportQuirks}`;
      const stuckPid = detectStuckPid(dev);
      // Negation guard: labelmanager spells "No mass-storage decoy"
      // on devices that present the printer interface directly. Don't
      // flag those as stuck-state mentions just because the phrase
      // appears in the text.
      const hasNegation =
        /no mass[- ]storage decoy/i.test(combined) ||
        /no .{0,40}editor[- ]lite/i.test(combined);
      const positiveMention =
        /mass[- ]storage/i.test(combined) ||
        /editor.lite/i.test(combined) ||
        /mode[- ]switch/i.test(combined);
      const mentionsStuck =
        dev.capabilities?.editorLite === true ||
        !!dev.capabilities?.massStoragePid ||
        (positiveMention && !hasNegation);
      if (!mentionsStuck) continue;
      if (stuckPid) {
        rows.push({
          driver: agg.driver,
          deviceKey: dev.key,
          deviceName: dev.name,
          family: dev.family,
          printerVid: dev.transports?.usb?.vid ?? null,
          printerPid: dev.transports?.usb?.pid ?? null,
          stuckPid: stuckPid.pid,
          source: stuckPid.source,
          editorLite: dev.capabilities?.editorLite === true,
        });
      } else {
        unknownMentions.push({
          driver: agg.driver,
          deviceKey: dev.key,
          deviceName: dev.name,
        });
      }
    }
  }
  rows.sort((a, b) =>
    a.driver.localeCompare(b.driver) || a.deviceName.localeCompare(b.deviceName),
  );
  unknownMentions.sort((a, b) =>
    a.driver.localeCompare(b.driver) || a.deviceName.localeCompare(b.deviceName),
  );
  return { rows, unknownMentions };
}

// Read an optional `docs/<driver>/connecting-fragment.md` for each
// driver. The pull script copies it into place if the driver ships
// one; missing files are not an error.
function collectFragments(aggregates) {
  const out = [];
  for (const agg of aggregates) {
    const path = join(DOCS_ROOT, agg.driver, 'connecting-fragment.md');
    if (!existsSync(path)) continue;
    out.push({ driver: agg.driver, content: readFileSync(path, 'utf8').trim() });
  }
  return out;
}

function vendorLabel(vid) {
  const key = vid.replace(/^0x/, '').toLowerCase();
  const info = VENDOR_INFO[key];
  if (info) return info.name;
  return `Vendor 0x${key}`;
}

function vendorScope(vid, drivers) {
  const key = vid.replace(/^0x/, '').toLowerCase();
  const info = VENDOR_INFO[key];
  if (info) return info.scope;
  return drivers.join(', ');
}

function renderUdevSection(vendors) {
  const lines = [];
  lines.push('## Linux — udev rules');
  lines.push('');
  lines.push(
    'Linux binds `usblp` (and sometimes CUPS / `ipp-usb`) to every USB ' +
    'printer on plug-in, so userspace gets `LIBUSB_ERROR_BUSY` or ' +
    '`LIBUSB_ERROR_ACCESS`. A udev rule per **vendor ID** is enough — ' +
    'it covers every model in this site\'s registry today, and any new ' +
    'device the same vendor ships in the future.',
  );

  lines.push('');
  lines.push('| Vendor | VID | Covers | Devices in registry |');
  lines.push('| --- | --- | --- | --- |');
  for (const v of vendors) {
    const name = vendorLabel(v.vid);
    const scope = vendorScope(v.vid, [...v.drivers].sort());
    lines.push(`| ${name} | \`${v.vid}\` | ${scope} | ${v.deviceCount} |`);
  }

  lines.push('');
  lines.push('Drop these into `/etc/udev/rules.d/99-thermal-label.rules`:');
  lines.push('');
  lines.push('```');
  lines.push('# /etc/udev/rules.d/99-thermal-label.rules');
  for (const v of vendors) {
    const name = vendorLabel(v.vid);
    const bare = v.vid.replace(/^0x/, '');
    lines.push(`# ${name}`);
    lines.push(`SUBSYSTEM=="usb", ATTRS{idVendor}=="${bare}", MODE="0666", TAG+="uaccess"`);
  }
  lines.push('```');
  lines.push('');
  lines.push(
    '`TAG+="uaccess"` is required for **WebUSB** (Chrome / Edge) to ' +
    'detach `usblp` and claim the printer interface — without it the ' +
    'browser pairing dialog will list the device but `claimInterface()` ' +
    'fails silently.',
  );
  lines.push('');
  lines.push('Reload and re-plug the printer:');
  lines.push('');
  lines.push('```bash');
  lines.push('sudo udevadm control --reload-rules && sudo udevadm trigger');
  lines.push('```');
  return lines.join('\n');
}

function renderPlatformOverview() {
  return [
    '## Platform overview',
    '',
    'Before any thermal-label package can talk to a USB printer, the OS ' +
    'has to **let userspace claim the device**. The defaults differ:',
    '',
    '- **Linux** binds `usblp` (and sometimes CUPS / `ipp-usb`) to every ' +
    'USB printer on plug-in. Fix it with a udev rule per vendor — see ' +
    'the next section.',
    '- **Windows** binds the vendor\'s printer driver (or `usbprint.sys`) ' +
    'to the device, blocking `node-usb`. Replace it with **WinUSB** using ' +
    '[Zadig](https://zadig.akeo.ie/). WebUSB (Chrome / Edge) manages its ' +
    'own driver stack and does not need Zadig.',
    '- **macOS** leaves USB printers accessible to libusb out of the box. ' +
    'The one exception: removing the printer from **System Settings → ' +
    'Printers & Scanners** if you added it there.',
    '- **Android** grants WebUSB / USB Host access per-app, per-device, ' +
    'through its own consent dialog. No driver swap involved.',
    '',
    'If you\'ve already done the OS-level setup once, you\'ve done it for ' +
    'every thermal-label driver — the prerequisites depend on the OS, not ' +
    'on which printer family you talk to.',
  ].join('\n');
}

function renderStuckStateSection(stuck, unknown) {
  const lines = [];
  lines.push('## Mass-storage / mode-switch stuck states');
  lines.push('');
  lines.push(
    'Several supported printers ship in a **decoy USB mode** on first ' +
    'connect — they enumerate as a USB Mass Storage Class device (often ' +
    'a small flash drive that exposes the vendor\'s Windows installer) ' +
    'and only switch to the printer-class interface after a host-side ' +
    'mode-switch or a hardware toggle on the chassis.',
  );
  lines.push('');
  lines.push(
    'On Linux, `usb_modeswitch` covers the host-side path automatically ' +
    'when the decoy PID is known. The table below lists every stuck-state ' +
    'PID the registry knows about today; if you spot a model in mass-storage ' +
    'mode on a PID that isn\'t in this list, please file an issue with the ' +
    '`lsusb` output so the entry can land in `devices.json5`.',
  );
  lines.push('');

  if (stuck.length === 0) {
    lines.push('_No stuck-state PIDs in the registry yet._');
  } else {
    lines.push('| Family | Device | Printer PID | Mass-storage PID | Notes |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const r of stuck) {
      const fam = r.family ?? r.driver;
      const ppid = r.printerPid ? `\`${r.printerPid}\`` : '—';
      const spid = `\`${r.stuckPid}\``;
      const notes = [];
      if (r.editorLite) notes.push('Editor Lite');
      if (r.source === 'quirks') notes.push('parsed from `hardwareQuirks`');
      lines.push(`| ${fam} | ${r.deviceName} | ${ppid} | ${spid} | ${notes.join('; ') || '—'} |`);
    }
  }

  if (unknown.length > 0) {
    lines.push('');
    lines.push('::: warning Stuck-state mentions without a captured PID');
    lines.push(
      'The following devices mention mass-storage / mode-switch / Editor ' +
      'Lite behaviour in `hardwareQuirks` but don\'t expose a structured ' +
      '`capabilities.massStoragePid`. The exact decoy PID isn\'t captured ' +
      'yet — file an issue on the driver repo with `lsusb` output if you ' +
      'see one of these in mass-storage mode:',
    );
    lines.push('');
    for (const u of unknown) {
      lines.push(`- **${u.deviceName}** (\`${u.driver}\`)`);
    }
    lines.push(':::');
  }

  return lines.join('\n');
}

function collectEditorLiteDevices(aggregates) {
  const out = [];
  for (const agg of aggregates) {
    for (const dev of agg.devices) {
      if (dev.capabilities?.editorLite !== true) continue;
      out.push({
        driver: agg.driver,
        deviceName: dev.name,
        massStoragePid: dev.capabilities?.massStoragePid ?? null,
      });
    }
  }
  out.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
  return out;
}

function renderEditorLiteSection(editorLiteDevices) {
  const lines = [];
  lines.push('## Brother Editor Lite');
  lines.push('');
  lines.push(
    'Brother QL-700 and later ship with an **Editor Lite** mode. When ' +
    'the green LED on the front is lit, the printer enumerates as a USB ' +
    'flash drive that hosts a Windows-only label editor — and ignores ' +
    'every raster print command sent to the printer-class interface.',
  );
  lines.push('');
  lines.push(
    '**Fix:** hold the Editor Lite button (the one marked with the ' +
    'P-touch icon) until the green LED turns off. The printer ' +
    're-enumerates as a printer-class device, and `brother-ql list` will ' +
    'pick it up. This is a hardware toggle — the driver cannot flip it ' +
    'programmatically.',
  );
  lines.push('');
  if (editorLiteDevices.length > 0) {
    lines.push('Models with Editor Lite mode in the registry:');
    lines.push('');
    for (const r of editorLiteDevices) {
      const pid = r.massStoragePid
        ? `mass-storage PID \`${r.massStoragePid}\``
        : '_mass-storage PID not yet captured_';
      lines.push(`- **${r.deviceName}** — ${pid}`);
    }
  }
  return lines.join('\n');
}

function renderDriverFragments(fragments) {
  if (fragments.length === 0) {
    return [
      '## Driver-specific notes',
      '',
      '_No driver-specific connecting fragments yet. Each driver may ship ' +
      'a `docs/connecting-fragment.md` to surface model-specific gotchas ' +
      '(cutter quirks, NFC label gates, OEM mode-toggle buttons, …) on ' +
      'this page._',
    ].join('\n');
  }
  const lines = ['## Driver-specific notes', ''];
  for (const f of fragments) {
    lines.push(`### ${f.driver}`);
    lines.push('');
    lines.push(f.content);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderPage({ vendors, stuck, unknownMentions, editorLiteDevices, fragments, generatedAt }) {
  const sections = [];
  sections.push([
    '---',
    'title: Connecting your printer',
    'description: Org-level connection-mode reference — Linux udev rules, mass-storage decoy PIDs, Editor Lite, and driver-specific gotchas. Generated from each driver\'s device registry.',
    '---',
    '',
    '# Connecting your printer',
    '',
    'One-time setup and connection-mode quirks across every supported ' +
    'thermal-label driver. The OS-level prerequisites are the same no ' +
    'matter which family you talk to; the model-specific gotchas (decoy ' +
    'USB modes, hardware mode toggles) are aggregated below from each ' +
    'driver\'s device registry.',
    '',
    '[[toc]]',
  ].join('\n'));

  sections.push(renderPlatformOverview());
  sections.push(renderUdevSection(vendors));
  sections.push(renderStuckStateSection(stuck, unknownMentions));
  sections.push(renderEditorLiteSection(editorLiteDevices));
  sections.push(renderDriverFragments(fragments));

  sections.push(
    `<small>Generated ${generatedAt} from \`.aggregate/devices/*.json\` ` +
    'by `scripts/build-connecting-page.mjs`. To correct a stuck-state ' +
    'PID, edit the corresponding driver\'s `packages/core/data/devices/<KEY>.json5` ' +
    'and re-run `docs:prep`.</small>',
  );

  return sections.join('\n\n') + '\n';
}

function main() {
  const aggregates = loadAggregates();
  const vendors = collectVendors(aggregates);
  const { rows: stuck, unknownMentions } = collectStuckPidRows(aggregates);
  const editorLiteDevices = collectEditorLiteDevices(aggregates);
  const fragments = collectFragments(aggregates);
  const generatedAt = new Date().toISOString();

  const md = renderPage({ vendors, stuck, unknownMentions, editorLiteDevices, fragments, generatedAt });
  writeFileSync(OUT_PATH, md);

  log(
    `wrote docs/connecting.md (${aggregates.length} drivers, ${vendors.length} vendors)`,
  );
  log(
    `mass-storage PIDs: ${stuck.length} captured` +
    (unknownMentions.length > 0 ? `, ${unknownMentions.length} mentioned without structured PID` : ''),
  );
  if (fragments.length > 0) {
    log(`included ${fragments.length} per-driver connecting fragment${fragments.length === 1 ? '' : 's'}`);
  }
}

main();
