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
import { loadAllMembers, SITE_ROOT } from './lib/load-drivers.mjs';

function fail(msg) {
  process.stderr.write(`[verify-suite-config] error: ${msg}\n`);
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`[verify-suite-config] ${msg}\n`);
}

// Verify against the *full* manifest, disabled entries included — a
// `enabled: false` driver keeps its drivers.json entry and package.json
// dep on purpose, and both must still pass shape + alignment checks.
const members = loadAllMembers();

// Uniqueness.
const seen = new Set();
for (const m of members) {
  if (seen.has(m.name)) fail(`duplicate member name: ${m.name}`);
  seen.add(m.name);
}

const drivers = members.filter(m => m.kind === 'driver');
// `enabled: false` drivers are excluded from the build entirely, so they
// are not subject to the published-dep cross-check below — but they are
// still shape-checked, and their retained -core dep is allowlisted.
const disabledDrivers = drivers.filter(d => d.enabled === false);
const publishedDrivers = drivers.filter(d => d.published !== false && d.enabled !== false);
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

// Protocol-core members (kind=protocol-core) expose a *-core npm name too
// (e.g. @thermal-label/d1-core) and may appear in package.json deps as a
// local override target. Allow them through the stray check.
const protocolCorePkgs = new Set(
  members.filter(m => m.kind === 'protocol-core').map(m => `@thermal-label/${m.name}`),
);
// An `enabled: false` driver's -core dep may or may not still be in
// package.json — not-yet-published ones are dropped (their `file:` path
// won't resolve on CI), a published-but-hidden one may keep it.
// Allowlist their pkgs either way so the stray check never trips on a
// disabled entry.
const disabledPkgs = new Set(disabledDrivers.map(d => d.pkg));
const stray = declaredCorePkgs.filter(
  k => !publishedPkgs.has(k) && !protocolCorePkgs.has(k) && !disabledPkgs.has(k),
);
if (stray.length > 0) {
  fail(
    `package.json has @thermal-label/*-core deps with no published driver entry: ${stray.join(', ')}\n` +
    `add the corresponding drivers.json entry (or unmark "published": false) or drop the dep.`,
  );
}

log(
  `ok — ${members.length} members (${drivers.length} drivers, ` +
  `${publishedDrivers.length} published, ${disabledDrivers.length} disabled), ` +
  `package.json deps aligned.`,
);
