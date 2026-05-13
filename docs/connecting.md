---
title: Connecting your printer
description: Org-level connection-mode reference — Linux udev rules, mass-storage decoy PIDs, Editor Lite, and driver-specific gotchas. Generated from each driver's device registry.
---

# Connecting your printer

One-time setup and connection-mode quirks across every supported thermal-label driver. The OS-level prerequisites are the same no matter which family you talk to; the model-specific gotchas (decoy USB modes, hardware mode toggles) are aggregated below from each driver's device registry.

[[toc]]

## Platform overview

Before any thermal-label package can talk to a USB printer, the OS has to **let userspace claim the device**. The defaults differ:

- **Linux** binds `usblp` (and sometimes CUPS / `ipp-usb`) to every USB printer on plug-in. Fix it with a udev rule per vendor — see the next section.
- **Windows** binds the vendor's printer driver (or `usbprint.sys`) to the device, blocking `node-usb`. Replace it with **WinUSB** using [Zadig](https://zadig.akeo.ie/). WebUSB (Chrome / Edge) manages its own driver stack and does not need Zadig.
- **macOS** leaves USB printers accessible to libusb out of the box. The one exception: removing the printer from **System Settings → Printers & Scanners** if you added it there.
- **Android** grants WebUSB / USB Host access per-app, per-device, through its own consent dialog. No driver swap involved.

If you've already done the OS-level setup once, you've done it for every thermal-label driver — the prerequisites depend on the OS, not on which printer family you talk to.

## Linux — udev rules

Linux binds `usblp` (and sometimes CUPS / `ipp-usb`) to every USB printer on plug-in, so userspace gets `LIBUSB_ERROR_BUSY` or `LIBUSB_ERROR_ACCESS`. A udev rule per **vendor ID** is enough — it covers every model in this site's registry today, and any new device the same vendor ships in the future.

| Vendor | VID | Covers | Devices in registry |
| --- | --- | --- | --- |
| Brother | `0x04f9` | Brother QL DK-tape series and PT-* P-touch series | 24 |
| DYMO | `0x0922` | DYMO LabelManager, LabelWriter, and LabelWriter Duo | 27 |

Drop these into `/etc/udev/rules.d/99-thermal-label.rules`:

```
# /etc/udev/rules.d/99-thermal-label.rules
# Brother
SUBSYSTEM=="usb", ATTRS{idVendor}=="04f9", MODE="0666", TAG+="uaccess"
# DYMO
SUBSYSTEM=="usb", ATTRS{idVendor}=="0922", MODE="0666", TAG+="uaccess"
```

`TAG+="uaccess"` is required for **WebUSB** (Chrome / Edge) to detach `usblp` and claim the printer interface — without it the browser pairing dialog will list the device but `claimInterface()` fails silently.

Reload and re-plug the printer:

```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

## Mass-storage / mode-switch stuck states

Several supported printers ship in a **decoy USB mode** on first connect — they enumerate as a USB Mass Storage Class device (often a small flash drive that exposes the vendor's Windows installer) and only switch to the printer-class interface after a host-side mode-switch or a hardware toggle on the chassis.

On Linux, `usb_modeswitch` covers the host-side path automatically when the decoy PID is known. The table below lists every stuck-state PID the registry knows about today; if you spot a model in mass-storage mode on a PID that isn't in this list, please file an issue with the `lsusb` output so the entry can land in `devices.json5`.

| Family | Device | Printer PID | Mass-storage PID | Notes |
| --- | --- | --- | --- | --- |
| brother-ql | PT-P750W | `0x2062` | `0x2065` | — |
| brother-ql | QL-1100 | `0x20a7` | `0x20a9` | Editor Lite |
| brother-ql | QL-1110NWB | `0x20a8` | `0x20aa` | Editor Lite |
| brother-ql | QL-1115NWB | `0x20ab` | `0x20ac` | Editor Lite |
| labelmanager | LabelManager 280 | `0x1006` | `0x1005` | parsed from `hardwareQuirks` |
| labelmanager | LabelManager 420P | `0x1004` | `0x1003` | parsed from `hardwareQuirks` |
| labelmanager | LabelManager PnP | `0x1002` | `0x1001` | parsed from `hardwareQuirks` |
| labelmanager | LabelManager Wireless PnP | `0x1008` | `0x1007` | parsed from `hardwareQuirks` |

::: warning Stuck-state mentions without a captured PID
The following devices mention mass-storage / mode-switch / Editor Lite behaviour in `hardwareQuirks` but don't expose a structured `capabilities.massStoragePid`. The exact decoy PID isn't captured yet — file an issue on the driver repo with `lsusb` output if you see one of these in mass-storage mode:

- **QL-700** (`brother-ql`)
- **QL-710W** (`brother-ql`)
- **QL-800** (`brother-ql`)
- **QL-810W** (`brother-ql`)
- **QL-820NWBc** (`brother-ql`)
:::

## Brother Editor Lite

Brother QL-700 and later ship with an **Editor Lite** mode. When the green LED on the front is lit, the printer enumerates as a USB flash drive that hosts a Windows-only label editor — and ignores every raster print command sent to the printer-class interface.

**Fix:** hold the Editor Lite button (the one marked with the P-touch icon) until the green LED turns off. The printer re-enumerates as a printer-class device, and `brother-ql list` will pick it up. This is a hardware toggle — the driver cannot flip it programmatically.

Models with Editor Lite mode in the registry:

- **QL-1100** — mass-storage PID `0x20a9`
- **QL-1110NWB** — mass-storage PID `0x20aa`
- **QL-1115NWB** — mass-storage PID `0x20ac`
- **QL-700** — _mass-storage PID not yet captured_
- **QL-710W** — _mass-storage PID not yet captured_
- **QL-800** — _mass-storage PID not yet captured_
- **QL-810W** — _mass-storage PID not yet captured_
- **QL-820NWBc** — _mass-storage PID not yet captured_

## Driver-specific notes

_No driver-specific connecting fragments yet. Each driver may ship a `docs/connecting-fragment.md` to surface model-specific gotchas (cutter quirks, NFC label gates, OEM mode-toggle buttons, …) on this page._

<small>Generated 2026-05-13T00:01:59.091Z from `.aggregate/devices/*.json` by `scripts/build-connecting-page.mjs`. To correct a stuck-state PID, edit the corresponding driver's `packages/core/data/devices/<KEY>.json5` and re-run `docs:prep`.</small>
