# SEO steps 1–3 — progress & decision log

Working from `plans/seo-and-aggregator-scaling.md` §1–3 (the SEO
quick-wins). §4 onward (drivers.json, self-describing protocol URLs,
new-driver wiring, single-site guard) stays untouched in the parent
plan and is out of scope here.

## Status

| Step | State |
| --- | --- |
| §1 Static markdown table | ✅ done |
| §2 Sitemap + robots.txt | ✅ done |
| §3 Rich-snippet meta tags | ✅ done |
| §4 `drivers.json` single source of truth | ✅ done (landed alongside plan 02 matrix work) |
| Build verification | ✅ done — `npm run docs:build` clean, sitemap has 281 URLs (54 per-device + matrix index + wishlist), robots.txt + JSON-LD Product/CollectionPage validate |

## Decisions

- **Manufacturer mapping lives on the existing `DRIVERS` array in
  `scripts/build-hardware-page.mjs`** instead of waiting for `drivers.json`
  (parent plan §4). One-line per driver, migrates trivially when §4 lands.
- **`og:image` for per-driver landing pages picks the first device's icon
  from the registry's natural order** rather than introducing a per-driver
  hero asset. Brother QL's first device is a PT-series, so its og:image is
  `device-brother-pt.svg` — acceptable since that driver covers both
  lineups. Refine to a curated per-driver hero in §4 if it matters.
- **Hardware index uses `twitter:card=summary` (not
  `summary_large_image`)** because the page has no representative image —
  emitting `summary_large_image` without an image would render an empty
  card. Per-device + per-driver pages keep `summary_large_image`.
- **`head:` frontmatter is JSON-encoded per entry** (`- ["meta", {...}]`).
  YAML accepts JSON inline, and JSON sidesteps quoting headaches around
  `:` in OG property names and the `"`-heavy JSON-LD payload.
- **`HardwareTable.vue` toggles `body.hw-table-hydrated`** rather than a
  scoped wrapper class. Single CSS rule covers it; on unmount the class
  comes off so revisiting `/hardware/` re-runs the dance cleanly.

## Progress log

- 2026-05-06 — implemented §1 (static fallback table renders 54 rows;
  body-class hydration toggle + CSS rule), §2 (`sitemap` config +
  `head` link tag + `docs/public/robots.txt`), §3 (OG + Twitter + JSON-LD
  on per-device, per-driver landing, hardware index). Full
  `npm run docs:build` succeeds; `dist/sitemap.xml` lists 280 URLs
  including all 54 per-device hardware pages; `dist/robots.txt` exposes
  the sitemap; sample device page emits `Product` JSON-LD with
  `manufacturer`, `category`, `image`.
- 2026-05-07 — landed §4 (`drivers.json` + JSON schema +
  `verify-suite-config` script) alongside plan 02. All 8 driver-kind
  members in the manifest; 5 incoming drivers (cat-printer, labelife,
  letratag, marklife, niimbot) carry `published: false` so the matrix
  reads their `data/devices.json` without requiring an unreleased npm
  package. `pull-driver-docs.mjs:REPOS`, `build-hardware-page.mjs:DRIVERS`,
  and `.vitepress/config.ts` nav are derived from `drivers.json`; the
  `editLink` PULLED list is inlined inside the pattern function (VitePress
  serializes it for the client bundle so module-scope closures don't
  survive). `build-matrix-page.mjs` writes `/hardware/index.md` and the
  bundled `HardwareTable` index is retired from the build path. Hand-
  authored `/hardware/wishlist` ships markdown-only with two CTAs and
  TODO callouts deferring the contact-channel + tier-1 SKU list to the
  maintainer. Build clean, sitemap 281 URLs.

  Carry-over decisions:
  - **`@thermal-label/contracts` is linked via npm `overrides` →
    `file:../contracts`** so the docs site can import contracts types
    directly. Equivalent to the plan's `pnpm.overrides → link:../contracts`.
    **Pre-deploy gate:** publish contracts and swap the override for a
    real version pin, otherwise CI on the docs repo and any contributor
    checkout breaks. Same constraint as every driver carrying this
    override.
  - **`PROTOCOL_DOC_URLS`** still lives in `build-hardware-page.mjs` —
    parent plan §5 (self-describing protocol docs URLs) is independent
    work and out of scope for the matrix PR.
  - **README banners (plan 02 §4)** are deferred — 8 small driver-repo
    PRs, separate work from the docs-site PR.

