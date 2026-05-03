# Connecting your printer

Before any thermal-label package can talk to a USB printer, the operating
system has to **let userspace claim the device**. By default Windows binds
its own printer driver, Linux binds `usblp` (and sometimes CUPS or
`ipp-usb`), and only macOS and Android leave the device free out of the
box. This page is the canonical place for those one-time prerequisites.

If you've already done this for one thermal-label package, you've done
it for all of them — the steps depend on the OS, not on the driver
package.

[[toc]]

## Windows — replace the driver with WinUSB (Zadig)

Windows binds the vendor's printer driver (or its own usbprint.sys) to
the device, which blocks `node-usb` and most non-CUPS userspace stacks
from opening it. Replace the driver with **WinUSB** using
[Zadig](https://zadig.akeo.ie/):

1. Plug the printer in and download Zadig.
2. **Options → List All Devices**, then pick the printer from the
   dropdown (e.g. `QL-700`, `LabelManager PnP`, `LabelWriter 450`).
3. Pick **WinUSB** as the target driver and click **Replace Driver**.
4. Re-run your discovery call (`brother-ql list`, `dymo-cli list`, etc.)
   — the printer should now appear.

::: tip WebUSB doesn't need Zadig
Chrome and Edge manage WebUSB through their own driver stack. If you
only ever use the `-web` packages from a browser, you can skip Zadig.
Zadig is needed for **Node.js** (and the CLI) on Windows.
:::

::: warning One driver at a time
Replacing the driver with WinUSB means the vendor's GUI tool (DYMO
Connect, Brother P-touch Editor, …) can no longer see the printer until
you reinstall the original driver from Device Manager. Most people don't
need both at once, but it's worth knowing before you run Zadig.
:::

## Linux — release the kernel claim on the printer

On Linux the kernel's `usblp` module (and sometimes CUPS or `ipp-usb`)
grabs the printer interface as soon as it's plugged in, which makes
`libusb_open()` return `LIBUSB_ERROR_BUSY` or `LIBUSB_ERROR_ACCESS`.
There are two ways to fix this — pick one.

### Option A — one-shot unbind

Useful for trying things out, CI runners, or a single short session.
Releases the claim until the next reboot or replug.

```bash
# Unload the kernel printer module (releases /dev/lp0 / /dev/usb/lp0).
sudo modprobe -r usblp
```

If you don't want to remove the module globally, you can unbind just the
one device by writing its USB path to `/sys/bus/usb/drivers/usblp/unbind`
— but `modprobe -r` is simpler when you have a single printer plugged
in.

You'll also want non-root access. The simplest one-shot is to chmod the
device node, e.g. `sudo chmod 666 /dev/bus/usb/<bus>/<dev>` (find
`<bus>`/`<dev>` with `lsusb`). It resets on replug; for a permanent fix
use Option B.

### Option B — persistent udev rule (recommended)

For development boxes and anything you'll plug in more than once. Create
a rule for the printer's USB vendor ID:

```
# /etc/udev/rules.d/99-thermal-label.rules
# Brother (QL series, PT-* P-touch)
SUBSYSTEM=="usb", ATTRS{idVendor}=="04f9", MODE="0666", TAG+="uaccess"
# DYMO (LabelManager, LabelWriter)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0922", MODE="0666", TAG+="uaccess"
```

`TAG+="uaccess"` is required for **WebUSB** (Chrome/Edge) to detach
`usblp` and claim the interface. Without it, the browser pairing dialog
will list the printer but opening it fails silently.

Reload and re-plug the printer:

```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

If `usblp` keeps re-claiming the device on plug-in (so userspace still
loses the race), blacklist the module:

```bash
echo "blacklist usblp" | sudo tee /etc/modprobe.d/usblp-blacklist.conf
sudo modprobe -r usblp
```

::: tip CUPS / ipp-usb conflicts
Some Brother models advertise an IPP-over-USB interface that `ipp-usb`
grabs the moment it sees the device. If discovery still fails after the
udev rule, check `systemctl status ipp-usb` — disable it for the
printer's VID, or stop the service while you test.
:::

## macOS — usually nothing

macOS leaves USB printers accessible to libusb out of the box. The one
exception: if you've added the printer in **System Settings → Printers &
Scanners**, the system print spooler may hold an exclusive claim. Remove
it from that pane and replug.

## Android — usually nothing

Android grants WebUSB / USB Host access on a per-app, per-device basis
through its own consent dialog. There's no driver swap or udev rule
involved; the browser will prompt you the first time you call
`requestDevice()`.

## App-specific extras

### labelmanager — PnP quirks

::: info Coming soon
Some LabelManager devices (notably the **LabelManager PnP**) re-enumerate
in unusual ways and need extra handling beyond the OS-level setup
above. This section will be filled in once the specifics are nailed
down.
:::

For the standard udev rule on Linux, the labelmanager-node package also
ships a `generateUdevRules()` helper that emits the same content as
Option B above, scoped to the DYMO VID — see
[Getting started → Linux setup](/labelmanager/getting-started) for the
generated path.
