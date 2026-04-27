# Live demos

Pick a printer family below to try the in-browser demo. All demos use **WebUSB**
or a related browser transport — they need a **Chromium-class browser** and a
**secure context** (HTTPS or `localhost`). Linux usually needs a **udev** rule
to grant USB access without `sudo`.

## Pick a family

- [**Brother QL**](/demo/brother-ql) — narrow + wide labels, optional two-colour
  on the QL-800 series.
- [**DYMO LabelManager**](/demo/labelmanager) — D1 tape, single colour.
- [**DYMO LabelWriter**](/demo/labelwriter) — pre-cut die-cut labels;
  550 / 5XL require NFC-locked DYMO media.

## Why three demos and not one

Each printer family has its own media model — tape widths for LabelManager,
roll-fed labels for Brother QL, fixed die-cut labels for LabelWriter — so the
input controls for each demo differ. The shared scaffolding (text editor,
preview canvas, USB pairing button, status panel) is the same across all
three; only the family-specific bits are different.

## Don't have hardware?

Each demo renders the bitmap preview before talking to a printer, so you can
see what would print without anything plugged in. The "send to printer" path
is what needs a real device.
