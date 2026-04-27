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
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = join(SITE_ROOT, 'docs');
const STAGING_ROOT = join(SITE_ROOT, '.staging');

/**
 * Each entry describes one source repo whose docs/ folder gets pulled in
 * under docs/<dest>/. `requiredFiles` are checked after the copy; missing
 * ones fail the build.
 */
const REPOS = [
  { repo: 'contracts',    dest: 'contracts',    ref: 'main', requiredFiles: ['index.md'] },
  { repo: 'transport',    dest: 'transport',    ref: 'main', requiredFiles: ['index.md'] },
  { repo: 'brother-ql',   dest: 'brother-ql',   ref: 'main', requiredFiles: ['index.md', 'getting-started.md'] },
  { repo: 'labelmanager', dest: 'labelmanager', ref: 'main', requiredFiles: ['index.md', 'getting-started.md'] },
  { repo: 'labelwriter',  dest: 'labelwriter',  ref: 'main', requiredFiles: ['index.md', 'getting-started.md'] },
  { repo: 'cli',          dest: 'cli',          ref: 'main', requiredFiles: ['index.md'] },
];

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
  cpSync(sourceDocs, destDir, { recursive: true });
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

function main() {
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  for (const entry of REPOS) {
    pullOne(entry);
  }
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  log(`pulled ${REPOS.length} repos into docs/`);
}

main();
