---
layout: home

hero:
  name: thermal-label
  text: TypeScript drivers for thermal printers
  tagline: 54 supported devices across Brother QL and DYMO. Six transports. Reverse-engineered wire-protocol references. MIT-licensed, no vendor SDK.
  actions:
    - theme: brand
      text: Browse 54 devices
      link: /hardware/
    - theme: alt
      text: Introduction
      link: /guide/introduction
    - theme: alt
      text: Live demos
      link: /demo/
    - theme: alt
      text: GitHub org
      link: https://github.com/thermal-label

features:
  - icon: 🖨️
    title: 54 devices, one table
    details: Brother QL DK-tape, Brother PT-P/PT-E TZe tape, DYMO LabelManager D1 tape, DYMO LabelWriter die-cut. Filter by family, transport, and verification status.
    link: /hardware/
    linkText: Open hardware coverage
  - icon: 🔌
    title: Six transport classes
    details: "Node: USB (libusb), TCP 9100, Serial. Browser: WebUSB, Web Serial, Web Bluetooth GATT. Same pull-based Transport interface, subpath imports keep native addons out of web bundles."
    link: /transport/
    linkText: Transport reference
  - icon: 📜
    title: Wire-protocol references
    details: Brother QL raster, Brother PT raster, DYMO D1 tape, LW 450 raster, LW 550 raster, LabelWriter Duo tape — opcodes, status frames, compression, all documented.
    link: /guide/architecture
    linkText: Architecture overview
  - icon: 🧪
    title: Live in-browser demos
    details: Pair a printer over WebUSB or Web Bluetooth from the docs site itself. Render the bitmap preview without hardware; only "send" needs a real device.
    link: /demo/
    linkText: Try the demos
  - icon: ⌨️
    title: thermal-label-cli
    details: List printers, read status frames, push quick text or image jobs from the shell. Intentionally small — diagnostics and scripts, not a layout engine.
    link: /cli/
    linkText: CLI overview
  - icon: ✅
    title: Verify your printer
    details: A two-minute checklist turns an "untested" row into a "verified" one. Reports land in the registry and help everyone who buys the same model.
    link: https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/verifying-hardware.md
    linkText: Verification guide
---

## 🖨️ Hardware coverage at a glance

The contracts-shape `DEVICES` registry across the three driver packages currently lists **54 printers**. Each row links to a per-device page with transports, engines, supported media, and verification reports.

| Family | Devices | Tape / label model | Transports |
|---|---:|---|---|
| 🟦 [**Brother QL**](/brother-ql/hardware) | 24 | DK rolls (QL series) and TZe / HSe tape (PT-P, PT-E) | USB, TCP, Bluetooth SPP, Bluetooth GATT |
| 🟧 [**DYMO LabelManager**](/labelmanager/hardware) | 8 | D1 tape, single colour | USB, Bluetooth GATT |
| 🟥 [**DYMO LabelWriter**](/labelwriter/hardware) | 22 | Pre-cut die-cut labels (550/5XL require NFC-locked DYMO media) | USB, Web Bluetooth on selected models |

→ [**Browse all 54 devices in the interactive table**](/hardware/)

## 📜 Wire-protocol references

If you are reverse-engineering, porting to another language, or auditing a payload, the protocol pages document opcodes, status frames, and compression in one place:

- [**Brother QL raster**](/brother-ql/protocol/ql) — DK-tape QL series, including two-colour QL-800 / QL-810W / QL-820NWB.
- [**Brother PT raster**](/brother-ql/protocol/pt) — PT-P / PT-E P-touch lineup, 128-pin and 560-pin heads, TZe + HSe.
- [**DYMO D1 tape**](/labelmanager/protocol) — LabelManager command stream over USB and BLE.
- [**LabelWriter LW 450 raster**](/labelwriter/protocol/lw-450) — classic LW 4xx generation.
- [**LabelWriter LW 550 raster**](/labelwriter/protocol/lw-550) — current LW 5xx generation, including NFC media gate.
- [**LabelWriter Duo tape**](/labelwriter/protocol/duo-tape) — the second interface on the LW 450 Duo.

## 📦 Pick a driver

- [**@thermal-label/brother-ql-***](/brother-ql/) — `core` + `node` + `web` + hardware + protocol + verification checklist.
- [**@thermal-label/labelmanager-***](/labelmanager/) — D1 tape lineup, USB and Web Bluetooth.
- [**@thermal-label/labelwriter-***](/labelwriter/) — die-cut LabelWriter family, including the Duo composite device.
- [**@thermal-label/contracts**](/contracts/) — the type-only surface (`Transport`, `PrinterAdapter`, `PrinterDiscovery`, media, status, errors) every driver targets.
- [**@thermal-label/transport**](/transport/) — six concrete transport classes behind one interface.
- [**thermal-label-cli**](/cli/) — `thermal-label` command for discovery, status, and quick prints.

## Who this is for

If you maintain a **warehouse app**, a **SaaS shipping** integration, a **kiosk**, or an internal tool that must talk to a label printer **from TypeScript**, you are in the right place. The code is MIT-licensed, split into packages you can depend on selectively, and designed so **hardware details stay inside driver packages** while your product code stays boring.

If you need **templates, barcodes, CSV batches, and sheet PDFs**, pair these drivers with **[burnmark-io](https://burnmark-io.github.io/)** — same printer ecosystem, different layer. The unified `thermal-label-cli` here stays intentionally small: list printers, read status, quick text/image prints for diagnostics and scripts.

## 🤝 Companion and prior-art projects

- **[burnmark-io](https://burnmark-io.github.io/)** — burnmark label design stack (headless designer, Vue/React bindings, CLI, Avery sheet templates). Pair with thermal-label when you need typed printer access inside a designer product.
- **[mbtech-nl](https://mbtech-nl.github.io/)** — small shared libraries, notably `@mbtech-nl/bitmap` (re-exported by contracts so bitmap payloads stay consistent).
- **[pklaus/brother_ql](https://github.com/pklaus/brother_ql)** — the established Python implementation of the Brother QL raster protocol.
- **[tylercrumpton/brotherql-webusb](https://github.com/tylercrumpton/brotherql-webusb)** — JavaScript / WebUSB port of `brother_ql`.
- **[labelle-org/labelle](https://github.com/labelle-org/labelle)** — Python implementation of the DYMO LabelManager protocol.

→ More on the [related organizations](/related-orgs) page.
