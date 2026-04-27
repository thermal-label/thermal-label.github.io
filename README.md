# thermal-label.github.io

Unified VitePress site at <https://thermal-label.github.io>. Pulls
per-repo `docs/` folders out of every project in the org and stitches
them into one navigable site.

## How a build comes together

```
              ┌──────────────────────────┐
contracts/    │                          │
transport/    │  scripts/pull-driver-    │      docs/<repo>/
brother-ql/   │  docs.mjs                │  ──► (per-repo content)
labelmanager/ │  (clones each repo's     │
labelwriter/  │  docs/ folder)           │
cli/          │                          │
              └──────────────────────────┘

@thermal-label/<driver>-core (npm DEVICES)
                  +                                  docs/hardware/
docs/<driver>/hardware-status.yaml ──► build-      ──► (unified table)
                                       hardware-      docs/<driver>/_status-fragment.md
                                       page.mjs       (per-driver narrow table)

                docs/  ──► vitepress build  ──► docs/.vitepress/dist/
```

`docs:prep` runs the two scripts in order. `docs:dev` and `docs:build`
both call `docs:prep` first, so anything in `docs/<repo>/` is rebuilt
on every dev start and every CI run — never edit those folders by
hand, the next prep wipes them.

## Repo layout

```
docs/
  index.md                  homepage
  guide/, hardware/         site-owned content
  <repo>/                   ← pulled from each source repo (gitignored)
  public/                   asset root (per-repo public/ gets relocated here)
  .vitepress/
    config.ts               nav, sidebar, ignored deadlinks
    components/
      HardwareTable.vue     reads docs/hardware/_data.json
      LiveDemo/
        BrotherQLDemo.vue   thin composer
        LabelManagerDemo.vue
        LabelWriterDemo.vue
        shared/             StatusPanel, BitmapPreview, TextEditor,
                            DevicePairButton, useUsbPairing
scripts/
  pull-driver-docs.mjs      clones/copies docs/ from each source repo
  build-hardware-page.mjs   merges DEVICES + hardware-status.yaml
.github/workflows/
  deploy.yml                Pages build & deploy
```

## Commands

| Command          | What it does |
|------------------|--------------|
| `npm run docs:dev`    | prep + `vitepress dev` (live reload) |
| `npm run docs:build`  | prep + `vitepress build` (CI does this) |
| `npm run docs:pull`   | only the per-repo pull |
| `npm run docs:hardware` | only the hardware-page build |
| `npm run docs:preview`  | serve the last built site |

## Local dev

`pull-driver-docs.mjs` resolves each source repo in this order:

1. **env override** — `TL_DOCS_<UPPER_REPO>` set to either a directory
   path (copy from there) or a git ref (clone that ref).
2. **sibling checkout** — if `../<repo>/` exists next to this one,
   copies from `../<repo>/docs/`. This is the zero-config path on
   the maintainer machine where every repo is checked out side by
   side.
3. **shallow clone** of `origin/main` from
   `https://github.com/thermal-label/<repo>.git`.

So locally you basically never wait on git: drivers live next door,
the script picks them up. To preview a not-yet-merged driver branch
without committing:

```bash
TL_DOCS_BROTHER_QL=feature/whatever npm run docs:dev
```

## CI / deploy

`.github/workflows/deploy.yml` runs on:

- push to `main`
- `repository_dispatch` of type `docs-update` (source repos fire this
  from their release workflows; payload `{ repo, ref }` pins that
  one repo to the given ref for the build)
- manual `workflow_dispatch`

It uses **Node 24** (driver packages declare `engines.node: ">=24"`)
and **`npm ci`** against `package-lock.json`. Both lockfiles in the
repo:

- `package-lock.json` — **canonical**, used by CI. Keep in sync
  whenever you bump `package.json`.
- `pnpm-lock.yaml` — incidental, generated when you run `pnpm
  install` locally. Untracked. Ignore it.

## When you bump driver versions

After the drivers cut a new minor/major:

1. `npm install` (regenerates `package-lock.json` against
   `package.json`).
2. `npm run docs:build` to confirm nothing broke.
3. Commit `package.json` + `package-lock.json` together.

If you push only `package.json`, the Pages workflow's `npm ci` will
abort with `EUSAGE`. (Same trap exists in cli/drivers — those use
`pnpm install --frozen-lockfile`.)

## When CI fails on `pull-driver-docs`

Almost always means a source repo has the new content locally but
hasn't been pushed. The CI's shallow clone of `origin/main` doesn't
see what's in your local checkout — push the source repo and rerun.

## Source repos, where to edit what

| Edit this here | When you want to change… |
|---|---|
| `docs/index.md`, `docs/guide/`, `docs/hardware/index.md` chrome | Site-owned chrome (homepage, guide, hardware page wrapper) |
| `docs/.vitepress/config.ts` | Nav, sidebar, theme, deadlink rules |
| `docs/.vitepress/components/LiveDemo/` | The interactive printer demos (USB hardware required) |
| **A source repo's `docs/`** | Per-package content — getting started, hardware table, API reference, etc. The pull script will pick it up next build. |
| **A source repo's `docs/hardware-status.yaml`** | Verification reports — they feed the unified hardware page. |

## Related repos

- `thermal-label/.github` — org meta, maintainer runbook,
  `CONTRIBUTING/hardware-status-schema.md`, plans/
- `thermal-label/contracts`, `transport` — base contracts pulled in
- `thermal-label/{brother-ql,labelmanager,labelwriter}` — each ships
  a `<driver>-core`, `-web`, `-node` package; the docs site consumes
  the `-core` and `-web` packages directly for the LiveDemos
- `thermal-label/cli` — published `thermal-label` command line
