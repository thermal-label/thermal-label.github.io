---
title: Hardware wishlist
description: How to help thermal-label cover more printers — by reporting a printer you already own, or by donating one of the gaps on the wishlist.
sidebar: false
aside: false
pageClass: hardware-page
head:
  - ["meta",{"property":"og:title","content":"Hardware wishlist — thermal-label"}]
  - ["meta",{"property":"og:description","content":"How to help thermal-label cover more printers — by reporting a printer you already own, or by donating one of the gaps on the wishlist."}]
  - ["meta",{"property":"og:url","content":"https://thermal-label.github.io/hardware/wishlist"}]
  - ["meta",{"property":"og:type","content":"website"}]
  - ["meta",{"property":"og:site_name","content":"thermal-label"}]
  - ["meta",{"name":"twitter:card","content":"summary"}]
  - ["meta",{"name":"twitter:title","content":"Hardware wishlist — thermal-label"}]
  - ["meta",{"name":"twitter:description","content":"How to help thermal-label cover more printers — by reporting a printer you already own, or by donating one of the gaps on the wishlist."}]
  - ["script",{"type":"application/ld+json"},"{\"@context\":\"https://schema.org\",\"@type\":\"CollectionPage\",\"name\":\"Hardware wishlist — thermal-label\",\"description\":\"How to help thermal-label cover more printers — by reporting a printer you already own, or by donating one of the gaps on the wishlist.\",\"url\":\"https://thermal-label.github.io/hardware/wishlist\",\"isPartOf\":{\"@type\":\"WebSite\",\"name\":\"thermal-label\",\"url\":\"https://thermal-label.github.io\"}}"]
---

# Hardware wishlist

The [compatibility matrix](./) lists every device thermal-label can
currently address. A row turns from **Likely works** into **Verified**
when somebody runs a print and reports back, and a brand-new device
shows up at all when somebody helps decode its protocol.

This page lists the two ways you can help, and the printers the
maintainer is most interested in seeing land next.

## Have one of these? File a report

If you already own a printer that appears anywhere in the matrix, a
two-minute report is the highest-leverage thing you can contribute.

- **Open the device's page** from the matrix. The link sits on the
  model name in every row.
- **Click "File a verification report →"** at the top of that page —
  the form lands in the right driver's issue tracker with the device
  metadata pre-filled.
- **Just try printing and tell us what happened.** The form prompts
  for OS, what worked, what didn't, and steps to reproduce; that's it.
  No T1–T7 checklist, no special harness — observable behaviour is
  the unit of evidence.

::: tip Bug reports are welcome too
Found a regression? Same flow — the **Report a bug →** button on the
device page files into the same driver repo with a different template.
:::

## Want to donate? Help close a gap

Some devices in the matrix have no `Verified` cell anywhere because
the maintainer doesn't own one and has no test path. A donated unit
unblocks both verification and protocol-level reverse-engineering for
the whole family the device belongs to.

> **TODO — contact channel.** A dedicated alias / GitHub Discussions
> thread / pinned issue is being decided. Until that lands, contact
> the maintainer via the GitHub profile linked from
> [github.com/thermal-label](https://github.com/thermal-label).
> See the [open question in plan 02](https://github.com/thermal-label/thermal-label.github.io/blob/main/plans/seo-and-aggregator-scaling.md)
> for the current state of that decision.

::: warning No shipping address on the public site
The maintainer is a solo developer working from a home address.
Address details are exchanged privately once a donation is on the
table — please open a contact thread first instead of mailing
unsolicited hardware.
:::

### Tier 1 — high-impact gaps

The smallest set of printers that would close the largest matrix
gaps. Each one represents a generation or vendor with no `Verified`
cell today.

> **TODO — confirm SKUs.** The plan's working list (`LT-200B`,
> `D110`, `P12`, `GB03`, one `tspl-l3` model) is the bare-honesty
> floor; specific SKUs to be pinned by the maintainer before this page
> publishes its first ranked list. Treat the entries below as
> placeholders.

- *DYMO LetraTag LT-200B* — only Bluetooth-LE DYMO in the suite; the
  matrix's single LetraTag row is `Unverified` end-to-end.
- *NIIMBOT D110* — most-shipped NIIMBOT consumer model; would lift
  expected-state across the wider D-series.
- *NIIMBOT B-series (e.g. B21 Pro)* — different protocol generation
  from the D-series; one `Verified` cell would lift roughly half the
  niimbot driver's matrix.
- *Marklife P12* — typical handheld TSPL clone; verified data here
  unblocks the larger TSPL group.
- *Phomemo / GB03 / cat-printer* — one `Verified` row gives the
  cat-printer driver a foothold; the family's protocol is shared, so
  sibling lifts are large.
- *Aimo / Quyin (tspl-l3 clone)* — represents the OEM-mixed group of
  small-format TSPL clones grouped under the labelife driver.

### Tier 2 / Tier 3 — narrower fits

Devices that would be welcome but extend coverage rather than unblock
it.

> **TODO — populate.** Tier-2 / tier-3 lists are deferred until the
> tier-1 SKUs are pinned. Lean intent: a single ranked list with no
> artificial section gaps.

## Why this matters

Coverage on the [matrix](./) is the suite's
single most-asked question. The honest answer is "it depends on which
exact SKU" — and the matrix is the long version of that answer. Every
report and every donation makes the next person's "does it work?"
question shorter to answer.
