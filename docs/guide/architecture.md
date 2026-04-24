# Architecture

The ecosystem is layered so **application code** changes rarely when you add a printer family or a new transport.

## Layer 1 — `@thermal-label/contracts`

Pure **TypeScript types** describing:

- **`Transport`** — bidirectional byte channel (`read`, `write`, `close`).
- **`PrinterAdapter`** — high-level printer: `print`, `createPreview`, `getStatus`, `close`.
- **`PrinterDiscovery`** — enumerate and open printers for a driver family.
- **`DeviceDescriptor`**, **`MediaDescriptor`**, **`PrinterStatus`**, **`PrintOptions`**, **`PreviewOptions`**, **`PreviewResult`** — structured media and preview planes.
- **Errors** — `TransportError`, `TransportTimeoutError`, `DeviceNotFoundError`, `UnsupportedOperationError`, `MediaNotSpecifiedError`, … for programmatic handling instead of string matching.

Bitmap-related types (`LabelBitmap`, `RawImageData`) **re-export** from `@mbtech-nl/bitmap` so consumers import once.

## Layer 2 — `@thermal-label/transport`

Runtime implementations of `Transport`:

| Class | Runtime | Role |
| --- | --- | --- |
| `UsbTransport` | Node | libusb, interface 0, bulk IN/OUT; optional kernel driver detach on Linux |
| `TcpTransport` | Node | Raw TCP (JetDirect-style, default port 9100) with partial-read buffering |
| `WebUsbTransport` | Browser | `navigator.usb` picker and `USBDevice` wrapper |
| `WebBluetoothTransport` | Browser | GATT write/notify with configurable MTU |

**Subpath imports** matter: `@thermal-label/transport/node` vs `/web` so bundlers never see the optional `usb` native peer dependency unless you are on Node.

Discovery helpers (`matchDevice`, `buildUsbFilters`, `buildBluetoothRequestOptions`, `discoverAll`) live at the **root** entry and are safe in either environment.

## Layer 3 — Device driver monorepos

Each family publishes **`core`**, **`node`**, **`web`**, and often **`cli`** packages:

- **Brother QL** — USB + TCP on Node; WebUSB in browser; media registry in core.
- **DYMO LabelWriter** — USB + TCP on Node; WebUSB in browser; hardware notes for NFC-locked models documented upstream.
- **DYMO LabelManager** — Node HID and **browser WebHID** for D1 tape printers.

Cores hold **protocol encoding** and **device registries**; runtimes wrap **transports** and expose ergonomic `openPrinter` / `requestPrinter` APIs.

## Layer 4 — `thermal-label-cli`

A single **global CLI** that **auto-detects installed driver packages** and exposes `list`, `status`, and `print text` / `print image`. It is the fastest way to prove cabling, permissions, and driver exports — not the place for template design.

## Mental model for your app

1. Pick **driver packages** (`*-node` and/or `*--web`).
2. Use **`PrinterDiscovery`** from those packages (or `discoverAll` with a curated list).
3. Call **`PrinterAdapter`** methods; handle **`PrinterStatus.errors`** as structured data.
4. For previews, render **`PreviewResult`** planes in your UI; respect the `assumed` flag when media is unknown.

When you outgrow quick text rendering, **emit PNGs** (or integrate **burnmark**) and feed **`print()`** image data — the adapter does not care how pixels were produced.
