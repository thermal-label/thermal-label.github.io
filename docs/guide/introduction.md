# Introduction

**thermal-label** is an organization of open-source **TypeScript** packages for talking to consumer and small-business **thermal label** hardware. The goal is simple: give application developers a **stable, typed surface** (`PrinterAdapter`, `PrinterDiscovery`, `Transport`) and move every vendor-specific byte sequence into **replaceable driver packages**.

## Why another printing stack?

Vendor tools are often GUI-first, poorly versioned, or tied to a single runtime. Here everything is **packages on npm**, CI-tested, and split so you can depend on **only** what you ship:

- A headless server can take **`@thermal-label/*-node`** plus `UsbTransport` / `TcpTransport`.
- A React or Vue app in **Chromium** can take **`-web`** packages with `WebUsbTransport` or `WebBluetoothTransport` (and LabelManager’s **WebHID** path) without pulling Node native modules into the bundle.
- A support engineer can install **`thermal-label-cli`** plus the relevant driver package and reproduce a customer issue from the shell.

## Design values

**Types at the boundary.** `@thermal-label/contracts` is intentionally **types and interfaces only** — zero runtime beyond a type re-export from `@mbtech-nl/bitmap` so bitmap payloads are consistent across design tools and drivers.

**One transport story.** `@thermal-label/transport` implements the `Transport` interface four ways (USB, TCP, WebUSB, Web Bluetooth). Drivers do not re-implement framing; they write to a `Transport` and parse replies.

**Discover, then open.** `PrinterDiscovery` lists `DiscoveredPrinter` entries; `openPrinter()` applies filters (family, serial, transport). `discoverAll()` aggregates multiple drivers without one failure blocking another.

**Honest scope.** The shared CLI is for **hardware validation and quick prints**. Rich label composition lives in **burnmark** — the READMEs draw that line on purpose so expectations stay clear.

## Where to read next

- [Architecture](/guide/architecture) for package boundaries and import paths.
- [Drivers](/guide/drivers) for device-specific notes (Node ≥24, secure contexts, Linux udev).
- [Integrating](/guide/integrating) for embedding checklists.

Trademarks (DYMO, Brother, …) belong to their owners; these projects are **not** affiliated with manufacturers.
