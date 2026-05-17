#!/usr/bin/env node
// Pull each harness app's released static bundle into
// docs/public/harness/<driver>/ so VitePress serves it at /harness/<driver>/.
//
// Unlike per-repo docs (scripts/pull-driver-docs.mjs), a harness app is not
// a docs/ tree on a branch — it is a built SPA shipped as a `.zip` asset on
// a GitHub Release of the `thermal-label/harness` monorepo. Each app tags
// independently as `harness-<driver>-v*`; that tag's release-build workflow
// zips the app's `dist/` and attaches it.
//
// Per driver flagged `harness: true` in drivers.json, source resolution is:
//   1. env override TL_HARNESS_<DRIVER>:
//        - an existing directory -> copy that built dist/ verbatim
//          (local preview of an unreleased harness build)
//        - any other string -> treat it as an exact release tag to download
//   2. default -> find the newest `harness-<driver>-v*` release on
//      thermal-label/harness, download its zip asset, extract it.
//
// A driver with no release yet is SKIPPED with a warning: harness apps roll
// out one at a time and the docs build must not break while a bundle is
// still pending. Set TL_HARNESS_STRICT=1 to turn skips into hard failures
// (use once every flagged driver has shipped a release). A release that
// *exists* but is malformed (no zip asset, corrupt zip, no index.html) is
// always a hard failure regardless of strict mode.
//
// GitHub API calls (listing releases) use GITHUB_TOKEN / GH_TOKEN when set,
// purely to lift the unauthenticated 60-req/h rate limit. The asset itself
// downloads from the public `browser_download_url` with no auth header.

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDrivers } from './lib/load-drivers.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, '..');
// VitePress copies docs/public/* to the dist root, so a bundle extracted to
// docs/public/harness/<driver>/ is served at /harness/<driver>/. The
// hand-authored docs/harness/index.md landing builds to /harness/ alongside.
const HARNESS_PUBLIC_ROOT = join(SITE_ROOT, 'docs', 'public', 'harness');

const HARNESS_REPO = 'thermal-label/harness';
const API_BASE = 'https://api.github.com';
const USER_AGENT = 'thermal-label-docs/pull-harness-bundles';

const STRICT = process.env.TL_HARNESS_STRICT === '1';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function log(msg) {
  process.stdout.write(`[pull-harness-bundles] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[pull-harness-bundles] WARN ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[pull-harness-bundles] error: ${msg}\n`);
  process.exit(1);
}

// A bundle that can't be *obtained* (no release yet, GitHub unreachable):
// skip unless strict — the docs site still builds, the /harness/<driver>/
// URL just 404s until the harness app ships. A bundle that IS there but
// broken is handled separately and always fails hard.
function skipOrFail(driver, msg) {
  if (STRICT) fail(`${driver}: ${msg}`);
  warn(`${driver}: ${msg} — skipping (set TL_HARNESS_STRICT=1 to fail)`);
}

function envKey(name) {
  return `TL_HARNESS_${name.toUpperCase().replace(/-/g, '_')}`;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function githubJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Compare two dotted version strings (e.g. '0.6.0' vs '0.6.1'). Numeric
// segments compare numerically; the harness ships plain x.y.z tags so this
// stays deliberately simple — a trailing pre-release segment sorts lower.
function compareVersions(a, b) {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb;
      continue;
    }
    const sa = pa[i] ?? '';
    const sb = pb[i] ?? '';
    if (sa !== sb) return sa < sb ? -1 : 1;
  }
  return 0;
}

// Each harness release carries exactly one zip (the app's dist/). Match it
// by the conventional `harness-<driver>-` prefix, but fall back to any lone
// .zip so the puller survives a release whose asset was named differently.
function pickZipAsset(name, release) {
  const zips = (release.assets ?? []).filter(a =>
    a.name.toLowerCase().endsWith('.zip'),
  );
  if (zips.length === 0) return null;
  return zips.find(a => a.name.startsWith(`harness-${name}-`)) ?? zips[0];
}

function extractZip(zipPath, destDir) {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', destDir], {
      stdio: 'inherit',
    });
  } catch (err) {
    fail(
      `unzip failed for ${zipPath}: ${err.message} — ` +
        `is the \`unzip\` binary installed on this runner?`,
    );
  }
  // The release workflow zips from inside dist/ (`cd dist && zip -r .`), so
  // index.html sits at the archive root. Its absence means the asset is not
  // a built harness app — fatal, the bundle would 404 on the docs site.
  if (!existsSync(join(destDir, 'index.html'))) {
    fail(
      `extracted bundle at ${destDir} has no index.html — ` +
        `the release zip is not a built harness app`,
    );
  }
}

async function downloadReleaseObject(name, release, destDir) {
  const asset = pickZipAsset(name, release);
  if (!asset) {
    // A release that exists but ships no bundle is a real defect in the
    // harness release workflow — always fatal, never a soft skip.
    fail(`${name}: release ${release.tag_name} has no .zip asset`);
  }
  const stage = mkdtempSync(join(tmpdir(), `harness-${name}-`));
  const zipPath = join(stage, asset.name);
  try {
    // Public repo: the browser_download_url is fetchable without auth, and
    // skipping the Authorization header sidesteps the cross-origin redirect
    // to GitHub's asset CDN entirely.
    const res = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!res.ok) {
      fail(`${name}: download of ${asset.name} -> ${res.status} ${res.statusText}`);
    }
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    extractZip(zipPath, destDir);
    log(
      `${name}: ${release.tag_name} -> docs/public/harness/${name}/ (${asset.name})`,
    );
    return true;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

async function downloadReleaseByTag(name, tag, destDir) {
  let release;
  try {
    release = await githubJson(
      `${API_BASE}/repos/${HARNESS_REPO}/releases/tags/${encodeURIComponent(tag)}`,
    );
  } catch (err) {
    // An explicit env-pinned tag that doesn't resolve is operator error —
    // fail hard even in non-strict mode so the typo surfaces immediately.
    fail(`${name}: release tag ${tag} not found on ${HARNESS_REPO} (${err.message})`);
  }
  return downloadReleaseObject(name, release, destDir);
}

async function pullOne(driver) {
  const destDir = join(HARNESS_PUBLIC_ROOT, driver.name);
  const tagPrefix = `harness-${driver.name}-v`;
  const override = process.env[envKey(driver.name)];

  if (override) {
    if (isDir(override)) {
      log(`${driver.name}: env override -> local dist ${override}`);
      if (!existsSync(join(override, 'index.html'))) {
        fail(`${driver.name}: TL_HARNESS override dir ${override} has no index.html`);
      }
      rmSync(destDir, { recursive: true, force: true });
      cpSync(override, destDir, { recursive: true });
      return true;
    }
    log(`${driver.name}: env override -> release tag ${override}`);
    return downloadReleaseByTag(driver.name, override, destDir);
  }

  // Default: newest `harness-<driver>-v*` release. The /releases list is
  // roughly newest-first already, but sort explicitly by version so a
  // back-dated re-tag can't win.
  let releases;
  try {
    releases = await githubJson(
      `${API_BASE}/repos/${HARNESS_REPO}/releases?per_page=100`,
    );
  } catch (err) {
    skipOrFail(driver.name, `could not list ${HARNESS_REPO} releases (${err.message})`);
    return false;
  }
  const matches = releases
    .filter(
      r => !r.draft && typeof r.tag_name === 'string' && r.tag_name.startsWith(tagPrefix),
    )
    .sort((a, b) =>
      compareVersions(b.tag_name.slice(tagPrefix.length), a.tag_name.slice(tagPrefix.length)),
    );
  if (matches.length === 0) {
    skipOrFail(driver.name, `no \`${tagPrefix}*\` release on ${HARNESS_REPO} yet`);
    return false;
  }
  return downloadReleaseObject(driver.name, matches[0], destDir);
}

async function main() {
  const harnessDrivers = loadDrivers().filter(
    m => m.kind === 'driver' && m.harness === true,
  );

  // Clear the whole harness public subtree up front so a driver that loses
  // its `harness` flag (or its release) doesn't leave a stale bundle behind.
  rmSync(HARNESS_PUBLIC_ROOT, { recursive: true, force: true });
  mkdirSync(HARNESS_PUBLIC_ROOT, { recursive: true });

  if (harnessDrivers.length === 0) {
    log('no drivers flagged `harness: true` in drivers.json — nothing to pull');
    return;
  }
  if (!TOKEN) {
    warn('no GITHUB_TOKEN / GH_TOKEN in env — using unauthenticated GitHub API (60 req/h)');
  }

  let pulled = 0;
  for (const driver of harnessDrivers) {
    if (await pullOne(driver)) pulled++;
  }
  log(
    `pulled ${pulled}/${harnessDrivers.length} harness bundle(s) into docs/public/harness/`,
  );
}

main().catch(err => fail(err.stack || String(err)));
