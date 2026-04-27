# Adding a driver

Want to add support for a printer family that isn't already in the ecosystem?
The full walkthrough lives in the [contributor guide on the `.github` repo][full]
— this page is a one-screen orientation.

[full]: https://github.com/thermal-label/.github/blob/main/CONTRIBUTING/adding-a-driver.md

## What you'd be building

Every driver follows the same layered split. Three published packages:

```
@thermal-label/<name>-core    Pure protocol layer. No I/O. Encodes job bytes, parses status.
@thermal-label/<name>-node    Node integration. Composes core + @thermal-label/transport/node.
@thermal-label/<name>-web     Browser integration. Composes core + @thermal-label/transport/web.
```

Plus a `docs/` folder the org docs site picks up automatically — no per-repo
VitePress config required.

## What you get for free

- **`@thermal-label/contracts`** gives you `Transport`, `PrinterAdapter`,
  `PrinterDiscovery`, `MediaDescriptor`, `PrinterStatus`, structured errors,
  and `pickRotation()` for orientation logic.
- **`@thermal-label/transport`** gives you ready-to-use `UsbTransport`,
  `TcpTransport` (Node) and `WebUsbTransport`, `WebBluetoothTransport`,
  `WebSerialTransport` (browser). You don't reimplement USB plumbing.
- **`thermal-label-cli`** auto-discovers your driver via a singleton
  `discovery: PrinterDiscovery` export — no CLI change required after publish.
- **The docs site** mounts your `docs/` under `/<repo>/` and picks up
  `pnpm docs:api` typedoc output too. Just commit the markdown.

## Conformance contract

A driver is "thermal-label-shaped" when:

1. `core` only depends on `@thermal-label/contracts` and your protocol logic.
2. `node` exports a `PrinterAdapter` class plus a singleton `discovery: PrinterDiscovery`.
3. `web` exports a similar adapter using the appropriate browser transport;
   browser packages do not implement `PrinterDiscovery` (pairing is user-gesture only).
4. The adapter returns a `PrinterStatus` with `ready`, `mediaLoaded`, `errors[]`,
   and optional `detectedMedia`.
5. Driver-specific media types extend `MediaDescriptor`; orientation goes
   through `pickRotation()`.

## Existing drivers as worked examples

Read these in parallel before starting:

- [`thermal-label/brother-ql`](https://github.com/thermal-label/brother-ql) — the most elaborate example (multi-color, two-plane preview, large media registry).
- [`thermal-label/labelmanager`](https://github.com/thermal-label/labelmanager) — the smallest example (D1 tape, single-color).
- [`thermal-label/labelwriter`](https://github.com/thermal-label/labelwriter) — middle ground (status bytes, NFC-locked media on 550-series).

The shared playbook these three were built against is captured in
[`plans/implemented/driver-retrofit.md`][retrofit] in the org `.github` repo.

[retrofit]: https://github.com/thermal-label/.github/blob/main/plans/implemented/driver-retrofit.md

## Read next

The [full contributor guide][full] expands every section above into a concrete
walkthrough with skeleton code. Pre-1.0, it is still a stub being grown — open
issues on `.github` if you find gaps while writing your driver, and we'll fold
the answers back into the guide.
