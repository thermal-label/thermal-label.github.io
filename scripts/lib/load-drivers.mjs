// Tiny helper used by every aggregator script + .vitepress/config.ts to
// read drivers.json. Kept dependency-free — JSON parse + a couple of
// shape assertions, nothing fancier. drivers.schema.json is the
// authoritative shape; the verify-suite-config script enforces it.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = resolve(SCRIPT_DIR, '..', '..');
export const DRIVERS_JSON_PATH = join(SITE_ROOT, 'drivers.json');

// Every member in drivers.json, including entries flagged `enabled:
// false`. Only verify-suite-config needs this — it must still police a
// disabled driver's (deliberately retained) package.json dep. All
// build steps go through loadDrivers() below.
export function loadAllMembers() {
  const raw = readFileSync(DRIVERS_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.members)) {
    throw new Error('drivers.json: expected { members: [...] }');
  }
  return parsed.members;
}

// Members the docs build acts on. Entries flagged `enabled: false` are
// kept in drivers.json (config preserved for a later re-enable) but
// dropped from every build step — docs pull, hardware pages, media
// catalogues, compatibility matrix, site nav.
export function loadDrivers() {
  return loadAllMembers().filter(m => m.enabled !== false);
}

export function driverMembers(members) {
  return members.filter(m => m.kind === 'driver');
}

// Drivers whose -core package is published and depended-on. Used by the
// per-device-page builder, which `import()`s each driver from
// node_modules. Drivers with `published: false` still appear in
// drivers.json (so the matrix sees their data/devices.json) but skip
// the per-device-page step until the package ships.
export function publishedDriverMembers(members) {
  return driverMembers(members).filter(m => m.published !== false);
}
