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
| Build verification | ✅ done — `npm run docs:build` clean, sitemap has 280 URLs (54 per-device), robots.txt + JSON-LD Product validate |

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

