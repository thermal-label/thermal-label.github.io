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

The [compatibility matrix](./) tracks every device thermal-label can
address. Two things move it forward: verifying a printer you already
own, and donating one the maintainer can't get hold of.

## Report a printer you own

If your printer appears anywhere in the matrix, a two-minute report is
the highest-leverage thing you can contribute.

1. Open the device's page — the link is on the model name in its
   matrix row.
2. Click **File a verification report →** at the top of that page. The
   form opens in the right driver's issue tracker with the device
   details pre-filled.
3. Print something and say what happened — OS, what worked, what
   didn't. That is the whole report; observable behaviour is the unit
   of evidence, with no checklist or harness to run.

A report turns that row from **Likely works** into **Verified** for
everyone who owns the same model. Hit a regression instead? The
**Report a bug →** button on the same page files it the same way.

## Donate a printer the maintainer can't reach

Some families have no **Verified** cell anywhere because the maintainer
owns no unit and has no test path. One donated device unblocks both
verification and protocol reverse-engineering for everything that
shares its protocol — so a single unit can lift a whole cluster of the
matrix.

The [matrix](./) is the live gap list: any row without a **Verified**
cell — especially in a family where no sibling is verified either — is
a candidate. If you own one and could lend or donate it, that closes a
gap a report alone can't.

<!-- TODO: replace hardware@thermal-label.example with the real burner inbox -->
To offer one, email
[hardware@thermal-label.example](mailto:hardware@thermal-label.example)
with the model and your rough location.

::: warning No postal address on this site
The maintainer is a solo developer working from home. Shipping is
arranged privately by email once a donation is agreed — please don't
send unsolicited hardware.
:::
