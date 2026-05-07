# SEO & aggregator scaling

The `thermal-label.github.io` site is the suite's only public-facing
discovery surface — one site, one search index, one sitemap. Two
tensions to resolve before the next batch of drivers lands:

1. The Hardware catalog (the largest discovery surface in the suite)
   is rendered inside `<ClientOnly>` and is invisible to crawlers. The
   per-device static pages are crawlable, but the index page that
   should rank on browse-style queries (`"every supported labelwriter"`,
   `"thermal label printer typescript"`) ships as an empty shell.
2. Adding a driver today touches four hard-coded lists across two
   scripts plus `package.json` plus per-driver knowledge baked into
   `PROTOCOL_DOC_URLS` and `DRIVER_OVERVIEWS`. With five more drivers
   landing (`labelife`, `niimbot`, `cat-printer`, `tspl-core`,
   `escpos-core`) the friction compounds.

## Architecture decision — single-site

All driver-side docs flow through this aggregator. Driver repos keep
`docs/` as the **source of truth** so working in any single repo is
self-contained (`pnpm docs:dev` in `labelife` still authors locally),
but **no driver repo publishes its own GitHub Pages**. Only
`thermal-label.github.io` is live.

Consequences:

- One canonical URL space — no risk of dead deep-links between
  fragmented sub-sites.
- One sitemap covering every page in the suite.
- One VitePress local search indexing every driver's content.
- One place that gets the SEO/meta-tag treatment.

Sub-repo `docs/` directories stay markdown-only (no
`.vitepress/`, no `gh-pages` workflow). This is mostly already the
case — step 8 below verifies and guards.

## Scope

- ✅ Make the hardware catalog crawlable — static markdown table +
  Vue progressive enhancement (option 3).
- ✅ Sitemap.xml emitted by VitePress.
- ✅ Rich-snippet meta tags — OpenGraph + JSON-LD on per-device pages.
- ✅ `drivers.json` as single source of truth for "what's in the
  suite" — consumed by both build scripts and the VitePress config.
- ✅ Self-describing protocol docs URLs — move `PROTOCOL_DOC_URLS` map
  into per-driver engine data.
- ✅ Wire the missing drivers (`labelife`, `niimbot`, `cat-printer`,
  `tspl-core`, `escpos-core`) as they land.
- ❌ Out of scope: redesigning the Vue HardwareTable UX, swapping
  VitePress, moving the site to a different SSG, server-side rendering
  the Vue component itself.

## Steps

### 1. Static markdown table — SEO + no-JS fallback

`build-hardware-page.mjs:renderIndexPage` currently emits:

```md
<ClientOnly>
  <HardwareTable />
</ClientOnly>
```

Change to render a static markdown table generated from the same
`indexRows` that already feed `_data.json`. Layout sketch:

```md
<HardwareTable />

<div class="hw-static-fallback">

| Family | Model | Transports | Status |
| --- | --- | --- | --- |
| 🟦 Brother QL | [QL-820NWB](/hardware/brother-ql/ql-820nwb) | USB · TCP · BT SPP | ✅ verified |
| ... | ... | ... | ... |

</div>
```

`HardwareTable.vue`:

- Drop the `<ClientOnly>` wrapper around the component invocation in
  `index.md`.
- On `onMounted`, set a class on `document.body` (or on a sibling
  wrapper) that hides `.hw-static-fallback`. Theme CSS adds:
  `body.hw-table-hydrated .hw-static-fallback { display: none; }`.
- The component already imports `_data.json` at module scope and uses
  no DOM APIs in `setup()` — its first DOM access is inside `onMounted`,
  which only fires on the client. SSR-safe by inspection.

Why this shape and not "just remove `<ClientOnly>`":

- Any change in `_data.json` shape during hydration would surface as a
  hydration mismatch error in the browser console. The "static
  markdown + Vue replaces" approach sidesteps that — there's nothing
  to mismatch because the Vue component renders into a separate slot.
- The static markdown is the canonical SEO content. Crawlers (Google,
  Bing, social-card unfurl bots, archive.org) all see a populated
  table on first paint.
- No-JS users get a clickable, readable table — no functionality
  beyond browser default sort, but every device is reachable.

Acceptance:

- `dist/hardware/index.html` contains a `<table>` with N rows where N
  matches `data.counts.total`. Each row has a working link to the
  per-device page.
- Disabling JS in the browser still shows the table.
- Enabling JS, on first paint there's no flash-of-static-then-dynamic;
  CSS ordering puts the Vue mount point before the fallback so the
  static table is below the fold momentarily but doesn't reflow once
  hidden.

### 2. Sitemap

Add to `.vitepress/config.ts`:

```ts
sitemap: { hostname: 'https://thermal-label.github.io' },
```

VitePress emits `dist/sitemap.xml` listing every page in the build,
including all 54 (and growing) per-device hardware pages, every
per-driver page, every protocol reference, every guide.

Companion changes:

- `docs/public/robots.txt` referencing the sitemap.
- `head` link tag: `<link rel="sitemap" type="application/xml" href="/sitemap.xml">`.

Acceptance:

- `dist/sitemap.xml` exists and validates against the sitemaps schema.
- A spot-check of 10 URLs in the sitemap resolves to 200 in the built
  site.
- `robots.txt` accessible at `/robots.txt`.

### 3. Rich-snippet meta tags

Per-device page frontmatter currently sets `title` + `description`.
VitePress emits `<title>` and `<meta name="description">` from these,
which is the basics. Extend to the rich-snippet set:

- OpenGraph: `og:title`, `og:description`, `og:url`, `og:type=article`,
  `og:image` (per-family hero icon — already in `docs/public/icons/`).
- Twitter Card: `twitter:card=summary_large_image`.
- JSON-LD `Product` schema with `name`, `description`,
  `manufacturer.name`, optional `image`.

  Manufacturer name is known per driver — each driver repo scopes to
  one vendor. Encode it in `drivers.json` (§4) under a
  `manufacturer` field on each `kind: driver` member:

  | Driver | Manufacturer |
  | --- | --- |
  | `brother-ql` | `Brother` |
  | `labelmanager` | `DYMO` |
  | `labelwriter` | `DYMO` |
  | `niimbot` | `NIIMBOT` |
  | `labelife` | `Various OEMs` (Aimo / Quyin / etc., shared chassis lineage) |
  | `cat-printer` | `Various OEMs` (GB0x / Phomemo / Peripage / etc.) |

  For OEM-mixed drivers (`labelife`, `cat-printer`) the manufacturer
  is `"Various OEMs"` at the driver level, with per-device override
  available later via an optional `manufacturer` field on
  `DeviceEntry` once it lands in contracts. Until then the bulk
  string is honest enough — the per-device page name itself carries
  the OEM brand (e.g. `Aimo M3-Pro`, `Phomemo M02`).

`renderDevicePage` injects via VitePress's frontmatter `head` array:

```yaml
head:
  - [meta, { property: og:title, content: "..." }]
  - [meta, { property: og:description, content: "..." }]
  - [meta, { property: og:url, content: "https://thermal-label.github.io/hardware/..." }]
  - [meta, { property: og:type, content: article }]
  - [meta, { name: twitter:card, content: summary_large_image }]
  - [script, { type: application/ld+json }, '{ "@context": "https://schema.org", "@type": "Product", ... }']
```

Per-driver landing pages and the hardware index get the same treatment
(minus `Product` schema — they get `CollectionPage`).

Acceptance:

- One per-device page passes Google's [Rich Results Test](https://search.google.com/test/rich-results)
  with zero errors and detects the `Product` snippet.
- Sharing one per-device URL in Slack / Discord shows a card with
  title, description, and family icon — not a bare URL.

### 4. `drivers.json` — single source of truth

Create `drivers.json` at repo root with one entry per suite member.
Shape:

```jsonc
{
  "$schema": "./drivers.schema.json",
  "members": [
    {
      "name": "contracts",
      "kind": "shared",
      "repo": "thermal-label/contracts",
      "ref": "main",
      "requiredFiles": ["index.md"]
    },
    {
      "name": "tspl-core",
      "kind": "protocol-core",
      "repo": "thermal-label/tspl-core",
      "ref": "main",
      "requiredFiles": ["index.md"]
    },
    {
      "name": "escpos-core",
      "kind": "protocol-core",
      "repo": "thermal-label/escpos-core",
      "ref": "main",
      "requiredFiles": ["index.md"]
    },
    {
      "name": "transport",
      "kind": "shared",
      "repo": "thermal-label/transport",
      "ref": "main",
      "requiredFiles": ["index.md"]
    },
    {
      "name": "cli",
      "kind": "tool",
      "repo": "thermal-label/cli",
      "ref": "main",
      "requiredFiles": ["index.md"]
    },
    {
      "name": "brother-ql",
      "kind": "driver",
      "repo": "thermal-label/brother-ql",
      "ref": "main",
      "displayName": "Brother QL",
      "manufacturer": "Brother",
      "pkg": "@thermal-label/brother-ql-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    },
    {
      "name": "labelmanager",
      "kind": "driver",
      "repo": "thermal-label/labelmanager",
      "ref": "main",
      "displayName": "DYMO LabelManager",
      "manufacturer": "DYMO",
      "pkg": "@thermal-label/labelmanager-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    },
    {
      "name": "labelwriter",
      "kind": "driver",
      "repo": "thermal-label/labelwriter",
      "ref": "main",
      "displayName": "DYMO LabelWriter",
      "manufacturer": "DYMO",
      "pkg": "@thermal-label/labelwriter-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    },
    {
      "name": "labelife",
      "kind": "driver",
      "repo": "thermal-label/labelife",
      "ref": "main",
      "displayName": "labelife (Aimo / Quyin)",
      "manufacturer": "Various OEMs",
      "pkg": "@thermal-label/labelife-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    },
    {
      "name": "niimbot",
      "kind": "driver",
      "repo": "thermal-label/niimbot",
      "ref": "main",
      "displayName": "NIIMBOT",
      "manufacturer": "NIIMBOT",
      "pkg": "@thermal-label/niimbot-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    },
    {
      "name": "cat-printer",
      "kind": "driver",
      "repo": "thermal-label/cat-printer",
      "ref": "main",
      "displayName": "Cat printer",
      "manufacturer": "Various OEMs",
      "pkg": "@thermal-label/cat-printer-core",
      "requiredFiles": ["index.md", "getting-started.md"]
    }
  ]
}
```

`kind` values:

| Kind | Aggregator behaviour |
| --- | --- |
| `shared` | Pulled into `docs/<name>/`. No hardware. No `pkg` field needed. |
| `protocol-core` | Same as `shared`. Will eventually get a "Protocol cores" nav section. |
| `tool` | Same as `shared`. |
| `driver` | Pulled into `docs/<name>/`. `pkg` imported at build time for `DEVICES` registry. Generates per-device pages. Appears in hardware table. |

Both build scripts and `.vitepress/config.ts` read from `drivers.json`:

- `pull-driver-docs.mjs:REPOS` → derived from `members`.
- `build-hardware-page.mjs:DRIVERS` → derived from `members.filter(m => m.kind === 'driver')`.
- `.vitepress/config.ts:nav.Packages` → derived from `members`.
- `.vitepress/config.ts:editLink.PULLED` → derived from `members`.

`package.json` `dependencies` still need to list each driver-kind
member's `pkg`. A pre-build sanity script asserts the
`drivers.json:driver-kind:pkg` set equals the `package.json:dependencies`
keys filtered to `@thermal-label/*-core`.

Acceptance:

- Adding a new driver = one entry in `drivers.json` + one line in
  `package.json:dependencies` + one entry in `DRIVER_OVERVIEWS` + one
  sidebar block in `.vitepress/config.ts`. No edits anywhere else.
- A `pnpm verify-suite-config` script (run in CI) catches drift between
  `drivers.json` and `package.json`.

### 5. Self-describing protocol docs URLs

`PROTOCOL_DOC_URLS` in `build-hardware-page.mjs` is a hard-coded map
from `${family}:${protocol}` to docs path. This breaks the
self-describing principle that's load-bearing for everything else: the
aggregator should read driver data, not carry knowledge about driver
internals.

Move into per-engine data:

- Add `docsPath?: string | null` to `EngineSpec` in
  `@thermal-label/contracts`.
  - String → linked to that path.
  - `null` → intentionally unlinked (renders bare `<code>` badge).
  - Missing → renders bare `<code>` badge with a build-time warning.
    (Currently `die`s; loosen because new engines should be able to
    ship before their docs page is written, just noisily.)
- Each driver's `data/devices/<KEY>.json5` now declares `docsPath` per
  engine entry.
- `renderProtocolBadge(family, protocol)` becomes
  `renderProtocolBadge(engine)` — reads `engine.docsPath` directly.
- Drop `PROTOCOL_DOC_URLS` from `build-hardware-page.mjs`.

Migration ordering:

1. Land contracts change with `docsPath` optional.
2. For each driver, add `docsPath` to its engine entries (one PR per
   driver, no behaviour change yet — aggregator still reads the map).
3. Once all drivers ship the field, switch the aggregator to read
   `engine.docsPath` and delete the map.

Acceptance:

- `build-hardware-page.mjs` has no protocol URL knowledge.
- `git grep PROTOCOL_DOC_URLS` returns nothing.
- Each driver's per-device data explicitly declares its protocol docs
  paths.

### 6. Driver overview self-describing — defer

`DRIVER_OVERVIEWS` in `build-hardware-page.mjs` carries per-driver
tagline + canonical page list + protocol section + callout. Same
self-describing argument: this lives in two places (driver's README
and the aggregator). Could be moved to an `OVERVIEW` export from each
`-core` package.

Defer. The map only changes when a driver's tagline shifts (rare), and
the page-list is already filtered against the actually-pulled tree, so
adding/removing pages is automatic. Reasonable to revisit after step 4
ships and we see how often `DRIVER_OVERVIEWS` actually drifts.

### 7. Wire the missing drivers

After step 4 lands the cost-per-driver becomes:

| Repo | Aggregator action |
| --- | --- |
| `tspl-core` | One `drivers.json` entry, `kind: protocol-core`. No `pkg`. Sidebar entry. |
| `escpos-core` | Same. |
| `labelife` | One `drivers.json` entry, `kind: driver`. Add `@thermal-label/labelife-core` to `package.json`. `DRIVER_OVERVIEWS` entry. Sidebar block. |
| `niimbot` | Same as labelife. |
| `cat-printer` | Same as labelife. |

Each lands in lockstep with the corresponding driver's first
publishable release. Driver repos publish first (npm + main branch
docs), then the aggregator PR adds them.

### 8. Single-site enforcement

Verify no driver repo silently publishes its own GitHub Pages:

- For each `kind: driver` member in `drivers.json`, grep the upstream
  repo's `.github/workflows/*.yml` for `actions/deploy-pages` or
  `actions/upload-pages-artifact` or `peaceiris/actions-gh-pages`.
- If found: remove from the driver repo (single-site decision).
- Add a CI check to the docs repo that runs on every aggregator build:
  for each driver-kind member, fail if the upstream `gh-pages` branch
  exists or if a Pages-deploy workflow exists.

Probably nothing has it today — the suite was set up with the
aggregator from day one. Half-hour task to confirm + add the guard.

## Sequence

| Order | Step | Effort | Independence |
| --- | --- | --- | --- |
| 1 | Static markdown table (§1) | half day | independent |
| 2 | Sitemap (§2) | one hour | independent |
| 3 | Rich-snippets (§3) | half day | independent |
| 4 | `drivers.json` + script refactor (§4) | half day | independent |
| 5 | Self-describing protocol URLs (§5) | one day, spans 1 contracts release + N driver releases | depends on §4 landing first to keep aggregator changes coherent |
| 6 | Wire each new driver (§7) | one PR per driver | depends on §4 |
| 7 | Single-site guard (§8) | half hour | independent |

Steps 1-3 are pure SEO wins, ship them first as one PR. Step 4 is the
biggest lift but unblocks §5-7. Defer §6 (driver overview migration).

## Risks / open questions

- **Hydration mismatch when Vue mounts on top of static markdown.**
  The Vue component renders into a different DOM subtree than the
  static fallback (`.hw-table-root` vs `.hw-static-fallback`), so
  there's no overlap to mismatch. But VitePress's hydration model can
  be subtle — verify with a `pnpm docs:build && pnpm docs:preview`
  pass before committing.
- **No-JS UX expectations.** Static fallback is a flat sortable-by-
  default-only table. No filter chips, no live count. Acceptable
  trade-off — no-JS users are rare, but crawlers are everywhere, and
  the static table serves both.
- **JSON-LD `manufacturer` granularity.** Driver-level `manufacturer`
  in `drivers.json` is correct for single-vendor drivers
  (`brother-ql`, `labelmanager`, `labelwriter`, `niimbot`) but coarse
  for OEM-mixed drivers (`labelife`, `cat-printer`) where the actual
  manufacturer per device varies (Aimo vs. Quyin, Phomemo vs.
  Peripage). Acceptable trade-off for now — the per-device page
  `name` carries the actual OEM brand. Refine later by adding optional
  `manufacturer` to `DeviceEntry` so per-device data can override.
- **Sitemap URL canonicalisation.** Spot-check VitePress emits clean
  URLs (`/hardware/labelwriter/lw-450` not
  `/hardware/labelwriter/lw-450.html`). `cleanUrls: true` is already
  set, should be fine, but verify.
- **`drivers.json` validation.** Scripts read JSON with no runtime
  schema check. Either Zod-validate at script entry or a CI step that
  validates against `drivers.schema.json`. Lean toward the schema-file
  + CI approach — keeps scripts dependency-free.
- **Legacy `pkg` versions in `package.json` could drift from
  `drivers.json` `pkg` field.** Step 4 includes the `verify-suite-config`
  script to catch this.

## Notes

- Steps 1-3 (SEO) pay off immediately and independently of the rest.
- Steps 4-5 (self-describing) pay off most when the next 5 drivers
  land. Without these, every new driver costs 4-5 file edits across
  the aggregator. With these, it's two lines.
- The single-site decision (§8 + the architecture intro) is a stance,
  not a code change — most of the value is in writing it down so it
  doesn't drift later.
