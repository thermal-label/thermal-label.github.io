# DYMO LabelWriter — live demo

<script setup>
import LabelWriterDemo from '../.vitepress/components/LiveDemo/LabelWriterDemo.vue';
</script>

Pair a DYMO LabelWriter over **WebUSB** and print a label from the browser.
Requires Chromium-class browser, secure context, and a paired device. On
Linux, your user typically needs a **udev** rule for `0922:*` to access the
device without `sudo`.

<ClientOnly>
  <LabelWriterDemo />
</ClientOnly>

## Tips

- **LabelWriter 550 / 5XL** require **NFC-locked DYMO media** — only
  genuine DYMO labels print. This is a hardware lock; no driver can bypass
  it.
- **LabelWriter 450 and earlier** accept third-party labels.
- **No printer?** The preview renders without a device — useful for
  verifying label size and layout.

[Full LabelWriter docs →](/labelwriter/) ·
[Hardware list →](/labelwriter/hardware)
