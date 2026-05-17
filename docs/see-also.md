---
title: See also
description: Other projects in the thermal-printing space — the prior-art drivers thermal-label builds on, its companion projects, and browser-based printing experiments.
---

# See also

Other projects in the thermal-printing space: the prior-art drivers
thermal-label leaned on while decoding protocols, the companion
projects it pairs with, and a few things people built for the fun of
it. Links are here because they're useful or were cited along the
way — no affiliation implied unless the section says so.

## Companion projects

Part of the same toolkit as thermal-label.

- **[burnmark-io](https://burnmark-io.github.io/)** — the **burnmark**
  label-design stack: a headless `designer-core`, Vue/React bindings,
  `burnmark-cli` for render/validate/CSV batch, and `sheet-templates`
  for Avery-style PDF tiling. Reach for burnmark when you need
  templates and production; thermal-label gives it typed printer
  access. ([GitHub](https://github.com/burnmark-io))
- **[mbtech-nl](https://mbtech-nl.github.io/)** — small shared
  libraries, notably `@mbtech-nl/bitmap`, which `contracts` re-exports
  so bitmap payloads stay consistent end to end.
  ([GitHub](https://github.com/mbtech-nl))

## Prior art — other label-printer drivers

thermal-label's protocol docs cite these throughout. Most are
reverse-engineering efforts in other languages; if TypeScript isn't
your stack, one of them may suit you better.

**DYMO D1 tape** — LabelManager and the LabelWriter Duo tape side:

- **[labelle-org/labelle](https://github.com/labelle-org/labelle)** —
  Python driver for the D1 hardware family; the reference
  implementation of the `ESC A..E` opcode set and the skip-lines
  pattern.
- **[computerlyrik/dymoprint](https://github.com/computerlyrik/dymoprint)**
  — Python predecessor of labelle (deprecated 2023).

**DYMO LetraTag 200B** — the Bluetooth-LE label maker:

- **[ysfchn/dymo-bluetooth](https://github.com/ysfchn/dymo-bluetooth)**
  — Python reverse-engineering of the LetraTag BT protocol: directive
  vocabulary, header format, and the result-code enum.
- **[alexhorn/lt200b](https://github.com/alexhorn/lt200b)** — the
  earlier LT-200B effort; first to document the GATT topology and the
  advertised name prefix.

**Brother QL and P-touch:**

- **[pklaus/brother_ql](https://github.com/pklaus/brother_ql)** — the
  established Python driver for the Brother QL raster protocol, built
  against captured hardware traces.
- **[tylercrumpton/brotherql-webusb](https://github.com/tylercrumpton/brotherql-webusb)**
  — JavaScript / WebUSB port of `brother_ql` for in-browser printing.
- **[fuzeman/brother-label](https://github.com/fuzeman/brother-label)**
  — Python driver covering QL and PT in one device hierarchy.
- **[nbuchwitz/ptouch](https://github.com/nbuchwitz/ptouch)** — active
  LGPL-2.1 Python driver for Brother P-touch; the cross-reference for
  128-pin head pin counts and PT firmware quirks.
- **[hannesweisbach/ptouch-print](https://github.com/hannesweisbach/ptouch-print)**
  — older C driver for the same P-touch family.

One firmware hack also gets a mention in the docs:
**[free-dmo/free-dmo-stm32](https://github.com/free-dmo/free-dmo-stm32)**
replaces a DYMO LabelWriter's STM32 firmware to drop the label-spool
NFC authenticity check — bricking risk, and not endorsed here.

## Browser-based printing, for fun

People keep proving you don't need vendor software — just a browser
and a Web API.

- **[niim.blue](https://niim.blue/)** — a polished Web-Bluetooth app
  for NIIMBOT printers; design a label and print it straight from the
  browser tab.
- **[Phomemo label web server](https://tomaszu.com/posts/phomemo-webserver/phomemo-webserver/)**
  — a tiny self-hosted page: type text, hit print, and the Phomemo
  M110 on your network does the rest.

## Worth a read

- **[WebUSB Label Printer](https://crump.space/projects/webusb-label-printer/)**
  — Tyler Crumpton sets out to label his component bins, decides every
  existing way of printing is too much hassle, and — "like any good
  yak-shaving engineer" — builds `brotherql-webusb` (listed above)
  instead. The bins, he admits at the end, still aren't labelled. The
  whole reason projects like this one exist, in a single post.
