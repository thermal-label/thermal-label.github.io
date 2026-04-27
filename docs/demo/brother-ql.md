# Brother QL — live demo

<script setup>
import BrotherQLDemo from '../.vitepress/components/LiveDemo/BrotherQLDemo.vue';
</script>

Pair a Brother QL printer over **WebUSB** and print a label from the browser.
Requires Chromium-class browser, secure context, and a paired device. On
Linux, your user typically needs a **udev** rule for `04F9:*` to access the
device without `sudo`.

<ClientOnly>
  <BrotherQLDemo />
</ClientOnly>

## Tips

- **No printer connected?** The bitmap preview renders before any USB call,
  so you can still see what would print.
- **Editor Lite** mode (green LED on the printer) is a "type a label on the
  device" mode that swaps the USB device into mass-storage mode. The driver
  detects this and asks you to disable Editor Lite.
- **Two-colour printing** (black + red) is supported on the QL-800 series
  with **DK-22251** continuous label tape.

[Full Brother QL docs →](/brother-ql/) ·
[Hardware list →](/brother-ql/hardware) ·
[Troubleshooting →](/brother-ql/troubleshooting)
