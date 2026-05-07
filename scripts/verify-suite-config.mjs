#!/usr/bin/env node
// Sanity check drivers.json against package.json before a build.
//
// Rules:
//   - Every kind=driver entry has displayName + manufacturer + pkg.
//   - Each driver-kind member's `pkg` appears in package.json:dependencies
//     (so build-hardware-page.mjs can `import` it from node_modules).
//   - Conversely, every @thermal-label/*-core dep in package.json is
//     declared as a kind=driver member in drivers.json (catches drift
//     in the other direction).
//   - All `name` values are unique.
//
// Run via `npm run verify-suite-config`. Hard-fail with a useful diff.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDrivers, SITE_ROOT } from './lib/load-drivers.mjs';

function fail(msg) {
  process.stderr.write(`[verify-suite-config] error: ${msg}\n`);
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`[verify-suite-config] ${msg}\n`);
}

const members = loadDrivers();

// Uniqueness.
const seen = new Set();
for (const m of members) {
  if (seen.has(m.name)) fail(`duplicate member name: ${m.name}`);
  seen.add(m.name);
}

const drivers = members.filter(m => m.kind === 'driver');
const publishedDrivers = drivers.filter(d => d.published !== false);
for (const d of drivers) {
  if (!d.displayName) fail(`driver ${d.name}: missing displayName`);
  if (!d.manufacturer) fail(`driver ${d.name}: missing manufacturer`);
  if (!d.pkg) fail(`driver ${d.name}: missing pkg`);
  if (!/^@thermal-label\/[\w-]+-core$/.test(d.pkg)) {
    fail(`driver ${d.name}: pkg ${d.pkg} does not match @thermal-label/*-core`);
  }
}

const pkgJson = JSON.parse(readFileSync(join(SITE_ROOT, 'package.json'), 'utf8'));
const deps = pkgJson.dependencies ?? {};
const declaredCorePkgs = Object.keys(deps).filter(k => /^@thermal-label\/[\w-]+-core$/.test(k));

// Strict alignment is only enforced for `published: true` drivers — those
// whose -core package has a release the docs site can `import()` from
// node_modules. `published: false` drivers (incoming, not yet on npm)
// stay in drivers.json so the matrix can read their data/devices.json
// from a sibling checkout, but skip the dep cross-check.
const publishedPkgs = new Set(publishedDrivers.map(d => d.pkg));
const missing = [];
for (const d of publishedDrivers) {
  if (!(d.pkg in deps)) missing.push(d.pkg);
}
if (missing.length > 0) {
  fail(
    `package.json missing dependencies for published driver-kind members: ${missing.join(', ')}\n` +
    `add them to "dependencies" or mark the drivers.json entry "published": false.`,
  );
}

const stray = declaredCorePkgs.filter(k => !publishedPkgs.has(k));
if (stray.length > 0) {
  fail(
    `package.json has @thermal-label/*-core deps with no published driver entry: ${stray.join(', ')}\n` +
    `add the corresponding drivers.json entry (or unmark "published": false) or drop the dep.`,
  );
}

log(`ok — ${members.length} members (${drivers.length} drivers, ${publishedDrivers.length} published), package.json deps aligned.`);
