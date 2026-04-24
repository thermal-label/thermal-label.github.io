# thermal-label CLI

**`thermal-label-cli`** is the unified command-line front-end. It discovers printers across **every installed driver package** and exposes a small command set: **`list`**, **`status`**, **`print text`**, **`print image`**.

## Philosophy

The CLI is **diagnostic-first**:

- Prove USB permissions, **udev** rules, and TCP connectivity.
- Smoke-test **media detection** and **error** reporting.
- Script one-off prints in CI or servers.

It **does not** compete with full label design tools. For **templates**, **barcodes**, **CSV batches**, and **multi-up PDF** export, upstream documentation points to **`burnmark-cli`** — same drivers, richer workflow.

## Installing

Install the CLI **globally** plus **only** the driver packages you need:

```bash
npm install -g thermal-label-cli @thermal-label/brother-ql-node
```

| Printer family | Driver package |
| --- | --- |
| Brother QL | `@thermal-label/brother-ql-node` |
| DYMO LabelWriter | `@thermal-label/labelwriter-node` |
| DYMO LabelManager | `@thermal-label/labelmanager-node` |

Drivers are **optional peers** — install side by side as needed.

## Commands (mental model)

- **`thermal-label list`** — printers across all drivers; add `--drivers` to see which npm packages are present and whether they export `PrinterDiscovery`.
- **`thermal-label status`** — readiness, detected **media**, structured **errors**; supports `--host` for TCP.
- **`thermal-label print text "<text>"`** — quick rasterized text using the shared bitmap font (simple by design).
- **`thermal-label print image file.png`** — PNG/JPEG with threshold / optional dither / rotation.

When **multiple** printers are visible and you did not pass `--printer` or `--serial`, the CLI **prints the list and exits non-zero** — deliberate for scripts (no interactive prompt).

## Text vs image rendering

`print text` uses **`@mbtech-nl/bitmap`**’s pixel font — good for sanity checks, not branding. For real typography or logos, render externally and use **`print image`**.

## See also

- [Integrating](/guide/integrating) for programmatic equivalents.
- [burnmark-io](https://burnmark-io.github.io/) for production-oriented CLIs and apps.
