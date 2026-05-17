#!/usr/bin/env node
// Pull each source repo's `docs/` folder into `docs/<repo>/` so VitePress can
// build one unified site from many repositories.
//
// Resolution per repo:
//   1. env override: TL_DOCS_<UPPER_REPO>=<path-or-ref>
//      - if the value points at an existing directory, copy from there
//      - otherwise treat it as a git ref and clone that ref
//   2. if a sibling checkout exists at ../<repo>/docs, copy from there
//      (zero-config local dev — no clones needed when the workspace is laid
//      out as it is on the maintainer's machine)
//   3. shallow clone of origin/<DEFAULT_REF> (currently 'main' for all)
//
// On failure (missing docs/index.md, clone error, etc) the script exits 1
// with a clear message. The build cannot ship with broken slices.

import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDrivers, driverMembers } from './lib/load-drivers.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const STAGING_ROOT = join(SITE_ROOT, '.staging');
// Aggregated per-driver `data/devices.json` files land here. Read by
// scripts/build-matrix-page.mjs; never served directly by VitePress.
const AGG_ROOT = join(SITE_ROOT, '.aggregate');
const AGG_DEVICES_DIR = join(AGG_ROOT, 'devices');
// Per-driver media catalogue (compiled JSON form of `media.json5`). Read
// by scripts/build-media-pages.mjs; never served directly by VitePress.
// Members that don't ship a media catalogue (e.g. labelmanager, which
// consumes d1-core's shared D1 catalogue) simply omit `mediaDataFile`
// in drivers.json and are skipped here.
const AGG_MEDIA_DIR = join(AGG_ROOT, 'media');

// Source: drivers.json (single source of truth for the suite). Every
// member's docs/ tree gets pulled into docs/<name>/, except driver-kind
// members marked `published: false` — those are incoming drivers with
// no shipped npm package yet. The matrix builder still consumes their
// data/devices.json (see scripts/build-matrix-page.mjs); the docs
// chrome (per-driver landing, sidebar, getting-started) lights up only
// once the driver lands its first publishable release.
const REPOS = loadDrivers()
  .filter(m => !(m.kind === 'driver' && m.published === false))
  .map(m => ({
    repo: m.name,
    dest: m.name,
    ref: m.ref,
    kind: m.kind,
    requiredFiles: m.requiredFiles ?? ['index.md'],
  }));

const GITHUB_ORG = 'thermal-label';

function envKey(repo) {
  return `TL_DOCS_${repo.toUpperCase().replace(/-/g, '_')}`;
}

function log(msg) {
  process.stdout.write(`[pull-driver-docs] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[pull-driver-docs] error: ${msg}\n`);
  process.exit(1);
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function clearDest(destDir) {
  rmSync(destDir, { recursive: true, force: true });
}

function copyDocsTree(sourceDocs, destDir) {
  if (!isDir(sourceDocs)) {
    fail(`source docs/ not found at ${sourceDocs}`);
  }
  // Filter out PDFs — vendor reference PDFs (DYMO Tech Refs, Brother
  // raster manuals) sit in driver repos as drafting references only.
  // They are not ours to redistribute, so the docs site never publishes
  // them. Driver repos by convention keep `docs/` markdown-only; this
  // is a guard rather than a routine code path.
  cpSync(sourceDocs, destDir, {
    recursive: true,
    filter: src => !src.toLowerCase().endsWith('.pdf'),
  });
}

function shallowClone(repo, ref) {
  const url = `https://github.com/${GITHUB_ORG}/${repo}.git`;
  mkdirSync(STAGING_ROOT, { recursive: true });
  const stage = mkdtempSync(join(STAGING_ROOT, `${repo}-`));
  try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, url, stage], { stdio: 'inherit' });
  } catch (err) {
    fail(`git clone failed for ${repo}@${ref}: ${err.message}`);
  }
  return stage;
}

function resolveSource({ repo, ref }) {
  const override = process.env[envKey(repo)];
  if (override) {
    if (isDir(override)) {
      log(`${repo}: env override → ${override}`);
      return { kind: 'local', path: join(override, 'docs') };
    }
    log(`${repo}: env override → clone @ ${override}`);
    return { kind: 'clone', ref: override };
  }

  const sibling = resolve(SITE_ROOT, '..', repo);
  if (isDir(sibling)) {
    log(`${repo}: sibling checkout → ${sibling}`);
    return { kind: 'local', path: join(sibling, 'docs') };
  }

  log(`${repo}: clone @ ${ref}`);
  return { kind: 'clone', ref };
}

function pullOne(entry) {
  const { dest, requiredFiles, optional } = entry;
  const destDir = join(DOCS_ROOT, dest);
  const source = resolveSource(entry);

  clearDest(destDir);

  let sourceDocs;
  let cleanup;
  if (source.kind === 'local') {
    sourceDocs = source.path;
  } else {
    const stage = shallowClone(entry.repo, source.ref);
    sourceDocs = join(stage, 'docs');
    cleanup = () => rmSync(stage, { recursive: true, force: true });
  }

  if (!isDir(sourceDocs)) {
    if (optional) {
      log(`${entry.repo}: no docs/ in source — skipping (marked optional)`);
      cleanup?.();
      return;
    }
    cleanup?.();
    fail(`source docs/ not found at ${sourceDocs}`);
  }

  copyDocsTree(sourceDocs, destDir);
  cleanup?.();

  for (const required of requiredFiles) {
    if (!existsSync(join(destDir, required))) {
      fail(`${entry.repo}: missing required file docs/${required} after pull`);
    }
  }

  // Trim VitePress leftovers — drivers used to ship their own .vitepress/.
  // After Phase 3 of the docs consolidation no driver should still have one,
  // but guard against drift.
  const vitepressLeak = join(destDir, '.vitepress');
  if (existsSync(vitepressLeak)) {
    log(`${entry.repo}: removing stray docs/.vitepress/ from pulled tree`);
    rmSync(vitepressLeak, { recursive: true, force: true });
  }

  // Relocate per-repo public/ assets into the docs site's public/<repo>/.
  // VitePress only treats the top-level docs/public/ as the asset root, so
  // assets shipped at docs/<repo>/public/foo.svg need to land at
  // docs/public/<repo>/foo.svg. Source markdown references them as
  // `/<repo>/foo.svg`.
  const publicLeak = join(destDir, 'public');
  if (existsSync(publicLeak)) {
    const publicDest = join(DOCS_ROOT, 'public', dest);
    rmSync(publicDest, { recursive: true, force: true });
    cpSync(publicLeak, publicDest, { recursive: true });
    rmSync(publicLeak, { recursive: true, force: true });
    log(`${entry.repo}: relocated public/ → docs/public/${dest}/`);
  }
}

// `devices.json` (the rich projection emitted by each driver's
// `compile-data` codegen — `verificationGrid`, `supportStatus`, …) and
// `media.json` (the compiled media catalogue) are **gitignored in the
// driver repos** — they are generated artifacts, never committed, so a
// git clone of the repo does not carry them. They ship instead inside
// the published `-core` npm package (declared in its `files`), which the
// docs site already depends on at a pinned version. That installed
// package is therefore the source of truth.
//
// `repoRelPath` is where the file sits in a repo / sibling checkout;
// `pkgRelPath` is where it sits inside the installed npm package (the
// `packages/core/` monorepo layer collapses to the package root).
// Returns `{ path, source }` or null.
function resolveGeneratedDataFile(member, repoRelPath, pkgRelPath) {
  // 1. Explicit env override pointing at a local checkout — lets the
  //    maintainer preview freshly-compiled data without a publish.
  const override = process.env[envKey(member.name)];
  if (override && isDir(override)) {
    const p = join(override, repoRelPath);
    if (existsSync(p)) return { path: p, source: `override ${override}` };
  }
  // 2. The installed npm package. The only source that resolves on a
  //    lone CI checkout, and it keeps a local `docs:build` faithful to CI.
  const pkg = member.pkg ?? `@thermal-label/${member.name}`;
  const fromPkg = join(SITE_ROOT, 'node_modules', pkg, pkgRelPath);
  if (existsSync(fromPkg)) return { path: fromPkg, source: `npm ${pkg}` };
  // 3. Sibling checkout — covers an incoming `published: false` driver
  //    with no npm release yet (or a published version that predates
  //    shipping the data). Never reachable on a lone CI runner.
  const sib = join(resolve(SITE_ROOT, '..', member.name), repoRelPath);
  if (existsSync(sib)) return { path: sib, source: 'sibling checkout' };
  return null;
}

// The compatibility matrix reads every driver's devices.json; a missing
// one is a hard fail, in line with the "transport assumed-correct" axiom
// (broken upstream is a release bug, not a runtime nuance).
function pullDeviceData(member) {
  const destPath = join(AGG_DEVICES_DIR, `${member.name}.json`);
  const found = resolveGeneratedDataFile(
    member,
    join('packages', 'core', 'data', 'devices.json'),
    join('data', 'devices.json'),
  );
  if (!found) {
    fail(
      `${member.name}: devices.json not found. The published ${member.pkg} ` +
      `must ship data/devices.json — add it to that package's \`files\` and ` +
      `release, then \`npm install\` here to pick it up. (For an unpublished ` +
      `driver, \`pnpm compile-data\` in its sibling checkout.)`,
    );
  }
  copyFileSync(found.path, destPath);
  log(`${member.name}: devices.json (${found.source}) → .aggregate/devices/${member.name}.json`);
}

// Pull each member's compiled media catalogue into
// `.aggregate/media/<name>.json`. drivers.json declares the repo-relative
// path as `mediaDataFile` (most drivers `packages/core/data/media.json`,
// d1-core just `data/media.json`); inside the npm package both collapse
// to `data/media.json`. Members without a `mediaDataFile` are skipped —
// labelmanager has no catalogue of its own and consumes d1-core's shared
// D1 entries, so docs/labelmanager/media.md is intentionally not built.
function pullMediaData(member) {
  if (!member.mediaDataFile) return false;
  const destPath = join(AGG_MEDIA_DIR, `${member.name}.json`);
  const found = resolveGeneratedDataFile(
    member,
    member.mediaDataFile,
    member.mediaDataFile.replace(/^packages\/core\//, ''),
  );
  if (!found) {
    fail(
      `${member.name}: mediaDataFile "${member.mediaDataFile}" not found. The ` +
      `published package must ship it — add it to that package's \`files\` and ` +
      `release, then \`npm install\` here. (Or \`pnpm compile-data\` in the sibling.)`,
    );
  }
  copyFileSync(found.path, destPath);
  log(`${member.name}: media.json (${found.source}) → .aggregate/media/${member.name}.json`);
  return true;
}

function main() {
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  rmSync(AGG_DEVICES_DIR, { recursive: true, force: true });
  rmSync(AGG_MEDIA_DIR, { recursive: true, force: true });
  mkdirSync(AGG_DEVICES_DIR, { recursive: true });
  mkdirSync(AGG_MEDIA_DIR, { recursive: true });
  for (const entry of REPOS) {
    pullOne(entry);
  }
  const members = loadDrivers();
  for (const driver of driverMembers(members)) {
    pullDeviceData(driver);
  }
  let mediaCount = 0;
  for (const m of members) {
    if (pullMediaData(m)) mediaCount++;
  }
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  log(`pulled ${REPOS.length} repos into docs/, ${driverMembers(members).length} driver data sets + ${mediaCount} media catalogues into .aggregate/`);
}

main();
