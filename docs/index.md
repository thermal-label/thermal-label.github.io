---
layout: home

hero:
  name: thermal-label
  text: TypeScript drivers for thermal printers
  tagline: Contracts, transports, and device families — embed printing in Node or Chromium without a vendor SDK.
  actions:
    - theme: brand
      text: Introduction
      link: /guide/introduction
    - theme: alt
      text: GitHub org
      link: https://github.com/thermal-label

features:
  - title: One contract surface
    details: "@thermal-label/contracts defines Transport, PrinterAdapter, PrinterDiscovery, media, status, and errors — types only, safe in Node and browsers."
  - title: Four transports
    details: "Node: USB (libusb) and TCP (port 9100). Browser: WebUSB and Web Bluetooth — same pull-based API, subpath imports keep native addons out of web bundles."
  - title: Real device families
    details: Brother QL, DYMO LabelWriter, and DYMO LabelManager ship as core + node + web (+ cli) packages with matching discovery and print flows.
---

## Who this is for

If you maintain a **warehouse app**, a **SaaS shipping** integration, a **kiosk**, or an internal tool that must talk to a label printer **from TypeScript**, you are in the right place. The code is MIT-licensed, split into packages you can depend on selectively, and designed so **hardware details stay inside driver packages** while your product code stays boring.

If you need **templates, barcodes, CSV batches, and sheet PDFs**, pair these drivers with **[burnmark-io](https://burnmark-io.github.io/)** — same printer ecosystem, different layer. The unified **`thermal-label-cli`** here stays intentionally small: list printers, read status, quick text/image prints for diagnostics and scripts.

## Quick links

- [Architecture](/guide/architecture) — how contracts, transport, and drivers stack.
- [Drivers](/guide/drivers) — Brother QL, LabelWriter, LabelManager.
- [CLI](/guide/cli) — `thermal-label` command reference mindset.
- [Integrating](/guide/integrating) — patterns for apps and bundlers.
- [Related organizations](/related-orgs) — burnmark-io and mbtech-nl.
