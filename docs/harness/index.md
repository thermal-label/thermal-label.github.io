---
title: Hardware harness
description: Browser-based hardware-verification apps for the thermal-label drivers — pair a printer, run a diagnostic print, and file a verification report, no install required.
sidebar: false
aside: false
head:
  - ["meta",{"property":"og:title","content":"Hardware harness — thermal-label"}]
  - ["meta",{"property":"og:description","content":"Browser-based hardware-verification apps for the thermal-label drivers — pair a printer, run a diagnostic print, and file a verification report, no install required."}]
  - ["meta",{"property":"og:url","content":"https://thermal-label.github.io/harness/"}]
  - ["meta",{"property":"og:type","content":"website"}]
  - ["meta",{"property":"og:site_name","content":"thermal-label"}]
  - ["meta",{"name":"twitter:card","content":"summary"}]
  - ["meta",{"name":"twitter:title","content":"Hardware harness — thermal-label"}]
  - ["meta",{"name":"twitter:description","content":"Browser-based hardware-verification apps for the thermal-label drivers — pair a printer, run a diagnostic print, and file a verification report."}]
---

# Hardware harness

The hardware harness is a set of small **browser apps — one per printer
family — that check a real printer against its driver**. Each one pairs
the printer over WebUSB or Web Bluetooth, runs an identity probe and a
single diagnostic print, and hands you a pre-filled verification report.
No install, no SDK, no command line — it runs in a browser tab.

## Open a harness

| Printer family | Harness | Connects over |
| --- | --- | --- |
| Brother QL / PT | [**Brother QL harness**](https://thermal-label.github.io/harness/brother-ql/) | USB (WebUSB) |
| DYMO LabelManager | [**LabelManager harness**](https://thermal-label.github.io/harness/labelmanager/) | USB (WebUSB) |
| DYMO LabelWriter | [**LabelWriter harness**](https://thermal-label.github.io/harness/labelwriter/) | USB (WebUSB) |
| DYMO LetraTag | [**LetraTag harness**](https://thermal-label.github.io/harness/letratag/) | Bluetooth (Web Bluetooth) |

Each harness needs a **Chromium-class browser** — Chrome, Edge, or
similar. WebUSB and Web Bluetooth are not available in Firefox or
Safari.

## Why it exists

Every row in the [compatibility matrix](/hardware/) is a claim, and a
claim is only as good as the evidence behind it. The maintainer can't
own every printer — most cells start as **Likely works**, inferred from
a verified sibling rather than directly tested.

The harness closes that gap. Anyone with the hardware can run it and
file a report, which turns a **Likely works** cell into **Verified** for
everyone who buys the same model. It is the shortest path from "I have
this printer" to a data point the next person can trust.

## How to use it

1. Open the harness for your printer family from the table above.
2. Connect the printer, click **Pair**, and pick it from the browser's
   device chooser.
3. Run the **identity probe** — it confirms the harness is talking to
   the model you expect.
4. Run the **diagnostic print** — one small label that exercises the
   driver's encoder end to end.
5. **Submit the report** — the harness opens a pre-filled GitHub issue
   on the driver repo with the device, the result, and room for your
   notes. Review it and file.

The flow is observation-only: one diagnostic label out, status back. It
never touches firmware or printer settings.

## Printer won't connect?

WebUSB and Web Bluetooth can only reach a printer the operating system
has handed to the browser. On Windows that usually means installing a
WinUSB driver with **Zadig**; on Linux it means a **udev rule**. Both
are walked through on the [connecting your printer](/connecting) page.
