# Drivers

Each driver is a **monorepo** of npm packages. Install **only** the surfaces you ship.

## Brother QL — `@thermal-label/brother-ql-*`

**TypeScript-first** Brother QL suite:

- **`brother-ql-core`** — protocol, device registry, media registry (browser + Node).
- **`brother-ql-node`** — USB (libusb) and **TCP** transport with full printer API.
- **`brother-ql-web`** — **WebUSB** in Chromium-class browsers.
- **`brother-ql-cli`** — `brother-ql` binary for list/print/status.

**Platforms:** Node **≥ 24** for Node packages; browser paths need **secure context** (`https` or `localhost`) and WebUSB-capable Chromium. Linux USB usually needs a **udev** rule.

Hardware tables and caveats live in the upstream project site linked from the GitHub README.

## DYMO LabelWriter — `@thermal-label/labelwriter-*`

Direct thermal LabelWriter support:

- **`labelwriter-core`**, **`labelwriter-node`** (USB + TCP), **`labelwriter-web`** (WebUSB), **`labelwriter-cli`**.

**Important:** LabelWriter **550 / 5XL** enforce an **NFC label lock** — only genuine DYMO media will print. That is a **hardware** restriction, not something a driver can bypass. Read the upstream hardware guide before buying hardware for a integration.

## DYMO LabelManager — `@thermal-label/labelmanager-*`

**D1 tape** LabelManager devices:

- **`labelmanager-core`**, **`labelmanager-node`** (HID on Node), **`labelmanager-web`** (**WebHID** in supported browsers), **`labelmanager-cli`**.

**Platforms:** Node **≥ 24**; WebHID requires compatible Chromium and secure context. Linux often needs **udev** and sometimes **usb_modeswitch** for reliable USB.

## Shared contracts and transport

All new work aligns with:

- [`@thermal-label/contracts`](https://github.com/thermal-label/contracts) — interface definitions.
- [`@thermal-label/transport`](https://github.com/thermal-label/transport) — USB, TCP, WebUSB, Web Bluetooth classes.

Driver READMEs on GitHub are the **source of truth** for install snippets, import paths, and device lists.

## Attribution

Projects are **not affiliated** with Brother, Dymo, or Seiko Epson. Trademarks belong to their owners.
