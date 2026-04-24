# Integrating into your TypeScript app

This page is a **checklist** for engineers wiring printers into products — not a substitute for each package’s README, which stays authoritative for version pins and breaking changes.

## 1. Choose runtime packages

- **Node service / desktop backend** — install `*-node` packages plus `@thermal-label/transport/node`. Add the native **`usb`** peer when using `UsbTransport`.
- **Browser app (Chromium)** — install `*-web` packages plus `@thermal-label/transport/web`. Never import `/node` subpaths from browser bundles.
- **Isomorphic helper code** — depend on **`@thermal-label/contracts`** only; inject adapters from platform-specific entrypoints.

## 2. Discovery and selection

Use each driver’s **`PrinterDiscovery`** export, or aggregate with **`discoverAll([...])`** from `@thermal-label/transport` so one failing driver does not block others.

Persist a stable identifier (family + serial + transport) in your UI model so reconnections are deterministic.

## 3. Status and media

Always surface **`PrinterStatus.errors`** to users — structured `{ code, message }` fields are meant for branching.

Treat **`detectedMedia`** as the source of truth for width/length; contracts intentionally avoid redundant scalar fields.

## 4. Previews vs prints

`createPreview()` returns **`PreviewResult`** with **colour planes** and an **`assumed`** flag when media was guessed. Composite planes in canvas or your renderer; warn when `assumed` is true.

`print()` accepts **`RawImageData`**; one label per call — batching is a loop at the caller so drivers can manage job framing internally.

## 5. Density and capabilities

`PrintOptions.density` is a **string** validated per driver (`UnsupportedOperationError` when unknown). Two-colour behaviour is **driver-defined** behind `colorCapable` on media descriptors.

## 6. Linux and permissions

Expect to document **udev** rules for USB and, for some devices, **modeswitch** quirks. For TCP, document firewall expectations (outbound 9100).

## 7. When you need design, not bytes

As soon as users need **WYSIWYG**, **barcodes**, or **CSV-driven batches**, integrate **[burnmark-io](https://burnmark-io.github.io/)** or generate PNG/PDF upstream and keep **`PrinterAdapter.print()`** as the final hop.

## Source links

- [contracts](https://github.com/thermal-label/contracts)
- [transport](https://github.com/thermal-label/transport)
- [cli](https://github.com/thermal-label/cli)
