# thermal-label.github.io — Per-device documentation pages

> Replace the YAML-overlay table with a slim index table plus one
> detail page per device. Each driver's `data/devices.json` (shipped
> in the npm package) is the single source.
>
> All upstream dependencies have shipped:
>
> - `contracts@0.3.1` — `compatibleMediaFor`, `PrintEngineCapabilities`
>   (named `mediaDetection`/`autocut` + open index signature),
>   transport schemas (`namePrefix`, `serviceUuid`, `mdns.serviceType`),
>   `DeviceEntry.{capabilities,hardwareQuirks,support}`,
>   `DeviceSupport.{transports,engines,reports,quirks}`.
> - `@thermal-label/labelwriter-core@0.4.0`,
>   `brother-ql-core@0.4.0`,
>   `labelmanager-core@0.4.0` — all ship `data/devices.json` in the
>   contracts shape.
>
> First step of the implementation: bump this repo's deps from
> `^0.3.0` to `^0.4.0`. The new `data/devices.json` files arrive
> with that bump.

---

## 1. What this plan does

- **Reads `data/devices.json` directly** from each
  `node_modules/@thermal-label/<driver>-core/data/devices.json`.
  Drops the `await import(pkg)` runtime load and the
  `mod.DEVICES` export coupling. Pure file read + `JSON.parse` +
  `schemaVersion` check.
- **Drops the YAML overlay entirely.** Drivers stop shipping
  `docs/hardware-status.yaml`; `build-hardware-page.mjs` stops
  reading it. `support` (status, reports, lastVerified, quirks)
  now lives inline on each device entry.
- **Replaces `pickCapabilities`** (lines 107–113 of
  `build-hardware-page.mjs`) with a schema-aware renderer that
  knows the contracts-level fields and falls through to a
  denylist for driver-specific extras. (The
  `unify-device-registry.md` §4.3 question — allowlist vs
  denylist — is settled by the contracts plan as "structural
  fields are known; extras are denylisted".)
- **Slims the `/hardware/` index table** to the minimum needed
  to scan a long list and pick a row to drill into:
  family · model · transports · status · link. Engines, head
  dots, protocol, PIDs, reports, quirks all move to the detail
  page. The interactive filters survive (family chips, transport
  chips, status, search by name).
- **Emits per-device pages** at
  `docs/hardware/{driver}/{slug}.md`, one per device, rendered
  from the per-device template in §3. Index rows link here.
- **Drops `docs/hardware.md` from each driver as a docs source.**
  Driver READMEs keep a one-line pointer to the docs site for
  context. Protocol prose currently sharing `hardware.md` with
  the table moves to a sibling doc (see §4.4).

This subsumes the docs portions of:

- `labelwriter/plans/implemented/unify-device-registry.md` §4
  (in-repo table generation).
- `labelwriter/plans/backlog/expand-media-registry.md` §8.5
  (`docs/media.md` page). Per-device pages now carry the
  supported-media table inline; a dedicated catalogue-style
  "all media" page can still exist if useful.

---

## 2. Today

`pull-driver-docs.mjs` copies each driver's whole `docs/` tree
into the docs repo, which incidentally brings
`hardware-status.yaml` along. `build-hardware-page.mjs` then
reads `mod.DEVICES` from the npm package and merges in the YAML
overlay to produce a single dense table.

`pickCapabilities` is a hand-maintained allowlist of which
device-level fields show in the table. Every new structural
field added to a driver's descriptor is a separate PR to this
file before it surfaces on the docs site.

The current table is wide and gets denser every time someone
adds a column. With per-device pages, the index doesn't need to
carry every datum — it just needs to help you find a row.

---

## 3. Per-device page template

One template, rendered per device. Pseudo-template (the actual
implementation can be a small JS template literal or a Markdown
generator — whatever fits the existing scripts' style):

```
# {{ device.name }}

[{{ device.support.status }} badge]
[transports: USB · TCP · Bluetooth-SPP]
[Last verified: {{ device.support.lastVerified }}  •  Tested package version: {{ device.support.packageVersion }}]

## Engines
{{ for each engine }}
- {{ role }} — {{ dpi }} dpi, {{ headDots }}-dot head, '{{ protocol }}'
  {{ if mediaCompatibility }} • media: {{ mediaCompatibility.join(', ') }}{{ /if }}
  {{ if capabilities.mediaDetection }} • auto-detects loaded media{{ /if }}
  {{ if capabilities.autocut }} • auto-cut{{ /if }}
  {{ for each driver-side capability key — render via label map }}
  {{ if support.engines[role] }} • {{ statusBadge(support.engines[role]) }}{{ /if }}
{{ /for }}

## Connectivity
{{ for each transport entry — render the transport-specific schema }}
- USB: {{vid}}:{{pid}}
- TCP: port {{port}}{{ if mdns }}, mDNS {{mdns.serviceType}}{{ /if }}
- Serial: default {{defaultBaud}} baud{{ if supportedBauds }} (also: …){{ /if }}
- Bluetooth SPP: name prefix "{{namePrefix}}"
- Bluetooth GATT: service {{serviceUuid}}
{{ /for }}

## Quirks
{{ device.hardwareQuirks (immutable hardware facts) }}
{{ device.support.quirks (editorial — firmware-revision-dependent) }}

## Supported media
| Category | Name | Dimensions | SKUs |
| ... rendered from MEDIA[] filtered by engine.mediaCompatibility ... |

## Verification reports
{{ rendered from device.support.reports[] — issue link, reporter, date, OS, notes }}

[CTA: "Have one of these? File a verification report" → GitHub issue with prefilled title/body]
[CTA: "Found a bug?" → bug template]
```

The supported-media table uses `compatibleMediaFor(engine,
mediaRegistry)` from contracts — filters the driver's media
registry by `targetModels ∩ engine.mediaCompatibility`. For
multi-engine devices, render one table per engine.

The `engine.capabilities.mediaDetection` boolean drives an
"auto-detects loaded media" badge so the reader knows whether
they need to pick manually in the app. Mismatch behavior detail
(Brother hard-rejects, Dymo silent-misprints) lives in the
entry's `hardwareQuirks` prose; the page renders it verbatim,
not through structured rendering.

---

## 4. Aggregator changes

### 4.1 `pull-driver-docs.mjs`

No structural change. The script copies each driver's `docs/`
tree wholesale; once drivers stop shipping
`hardware-status.yaml` it simply stops appearing in the output.
No code change needed in this file.

### 4.2 `build-hardware-page.mjs`

- **Source change.** Replace `loadDevices(pkg)` (which does
  `await import(pkg)` and reads `mod.DEVICES`) with a direct
  read of `node_modules/@thermal-label/<driver>-core/data/devices.json`,
  parsed as the contracts `DeviceRegistry` shape. No runtime
  module load; pure JSON.
- **Drop `loadStatusYaml`, `mergeDriver`'s YAML merge path, and
  the `yaml` dev-dependency.** `support` arrives inline on each
  entry now.
- **Drop `pickCapabilities`** in favour of a schema-aware
  renderer:
  - Structural fields (`engines`, `transports`, `support`,
    `hardwareQuirks`, `capabilities`) have first-class
    rendering paths.
  - `engine.capabilities` named contracts keys (`mediaDetection`,
    `autocut`) render as inline badges next to the engine row
    with built-in labels.
  - Driver-side `engine.capabilities` keys (`twoColor`,
    `genuineMediaRequired`, future driver extensions) render via
    a label map. Two options for where the map lives — pick one
    in implementation:
    - **Driver-side** — each driver's npm package ships a
      `capabilityLabels.json` next to `devices.json`, mapping
      keys to human strings. Aggregator imports per driver.
      Pro: drivers own their vocabulary; promotion to a named
      contracts key is a label-map → built-in move.
    - **Aggregator-side** — the docs repo carries a static
      label map for known driver-side keys. Pro: simpler; one
      file to update. Con: PR to the docs repo every time a
      driver adds a key.
    Recommend driver-side for cleaner ownership.
  - `DeviceEntry.capabilities` (chassis-level — `editorLite`,
    etc.) renders as a separate "Chassis features" row in the
    Connectivity / specs block, using the same label-map
    mechanism.
  - Any other structural field added to the contracts shape
    later is a one-line addition to the schema-aware renderer,
    not a hand-maintained allowlist edit.
- **Validate `schemaVersion`** on each driver's registry; refuse
  unknown versions with a clear error so a future contracts v2
  doesn't get silently mishandled.
- **Slim `_data.json`.** The shape consumed by `HardwareTable.vue`
  drops everything that's now on detail pages. Each row carries
  only what the index table renders + filters on:
  ```
  { key, driver, family, name, transports: ['usb','tcp',…],
    status, slug }
  ```
  Quirks, reports, lastVerified, packageVersion, headDots,
  protocol, pidHex, transportStatus all leave the index. The
  "Read these first" quirks block on the index page goes too —
  quirks now live on the device page where they belong.
- **Emit per-device pages** alongside the index. Slugs derive
  from `device.key` (lowercased, `_` → `-`). Path:
  `docs/hardware/{driver}/{slug}.md`.
- Index rows link to the per-device pages.
- Per-engine support state renders honestly on the detail page
  — the Duo's "label verified, tape untested" case shows two
  badges, not one rolled-up status. The index uses the
  rolled-up `support.status`.
- **Drop `buildPerDriverFragment` and stop emitting
  `_status-fragment.md`.** Nothing will include it once
  driver-repo `docs/hardware.md` is gone.

### 4.3 `HardwareTable.vue`

Updated in lockstep with `_data.json`. Drops columns that
moved to detail pages, adds a "View" link per row to
`/hardware/{driver}/{slug}`. Filter chips stay (family,
transport, status, search-by-name); extra columns and tooltips
go.

### 4.4 GitHub-issue CTA URLs

The "File a verification report" and "Found a bug?" links use
GitHub's `?title=…&body=…` query-param prefill. The aggregator
generates these per device:

- Title: `Verification report: {{ device.name }}`
- Body: prefilled with model name, key, family, transports
  declared, OS placeholder.

The target issue tracker is each driver's own GitHub repo (the
driver owns the verification ledger). The aggregator reads the
repo URL from each driver's `package.json` `repository` field —
implementation must handle both the bare-string form and the
`{ type, url, directory }` object form.

### 4.5 Cleanup of the index page

`buildIndexPage`'s "Read these first" quirks block goes — the
data it reads (`row.quirks`) leaves `_data.json`. Quirks now
live on detail pages. The page chrome (counts, verify-your-
device tip, table mount) stays.

---

## 5. Verification-report flow change

Today: a verifier files an issue against the driver repo, a
maintainer edits `docs/<driver>/hardware-status.yaml` in this
repo, the docs site rebuilds.

After: a verifier files an issue against the driver repo, a
maintainer edits `data/devices/<KEY>.json5` (or equivalent) in
the driver repo, the driver cuts a release, this repo's deps
bump on next build. The verification ledger lives with the code
it verifies.

Trade-off accepted: each verification report waits on a driver
release. The win is a single source of truth — no possibility
of YAML/registry drift, and the report is part of the package
artefact people install.

The lag is bounded: the docs site's CI can `npm install` the
latest matching `^0.X.0` on every build, so a driver
patch-release surfaces on the next docs deploy.

---

## 6. Test plan

- A hand-spot-checked Duo render shows label engine verified,
  tape engine untested, with both rendered as separate rows on
  the detail page; the index shows one rolled-up status.
- A Twin Turbo render shows two engines (`left`, `right`) at
  identical specs, both untested.
- A QL-820NWB render shows three transports (USB / TCP /
  Bluetooth SPP) with the SPP block clearly labelled.
- The aggregator refuses to build when a driver ships
  `schemaVersion: 999` (unknown version), with a clear error.
- An unknown `capabilities` key (driver-specific extension)
  renders without crashing the build, even if it doesn't yet
  have a friendly label.
- Generated CTA URLs open GitHub's issue form with the prefilled
  title and body for the right repo, regardless of whether
  `package.json` `repository` is a string or an object.
- The slim `_data.json` validates against the new
  `HardwareTable.vue` types; `vitepress build` succeeds.

---

## 7. Sequencing

Lands as one PR — the changes are tightly coupled (deps bump,
script rewrite, Vue component, generated outputs all touch
each other):

1. **Bump deps** in `package.json` from `^0.3.0` to `^0.4.0`,
   refresh `pnpm-lock.yaml`. New `data/devices.json` arrives
   in `node_modules`.
2. **Rewrite `build-hardware-page.mjs`** — JSON-source,
   schema-aware renderer, slim `_data.json`, per-device
   emitter, drop YAML + fragment paths, drop the `yaml`
   dev-dep.
3. **Update `HardwareTable.vue`** to consume the slim shape,
   link rows to detail pages.
4. **Delete YAML residue** in this repo: each driver's
   `docs/<driver>/hardware-status.yaml` is brought in by
   `pull-driver-docs.mjs` from the driver repo and is
   ephemeral — it disappears the moment drivers stop shipping
   it. No file to delete here, but a build-time check that
   warns if a driver still ships one would catch drift.

Post-PR cleanup, per-driver (separate small PRs in each driver
repo, not blocking the docs change):

5. Each driver deletes `docs/hardware.md`, `docs/hardware-
   status.yaml`, and `docs/_status-fragment.md` from its source
   tree. Protocol prose currently in `hardware.md` (e.g.
   labelwriter's "450 vs 550 protocol" section, brother-ql's
   raster-command notes) moves into the existing `protocol.md`
   for that driver, or a new `protocol.md` if none exists.
6. `labelmanager/scripts/validate-hardware-status.mjs` deleted —
   the only YAML validator, obsolete with the YAML.
7. `labelmanager/plans/backlog/migrate-to-contracts-shape.md`
   moved to `implemented/` (the work shipped at 0.4.0; the
   file just hasn't been moved).

---

## 8. Out of scope

- Photos / device images. Per-device pages will look better with
  photos but the photos can land incrementally; the page
  template renders fine without them.
- An "all media" catalogue page. Useful but separate — this plan
  focuses on per-device.
- Search across devices. The existing static-site setup doesn't
  index, and adding search is its own plan.
- Telemetry on which device pages get the most traffic.
