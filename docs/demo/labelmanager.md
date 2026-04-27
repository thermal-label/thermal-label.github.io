# DYMO LabelManager — live demo

<script setup>
import LabelManagerDemo from '../.vitepress/components/LiveDemo/LabelManagerDemo.vue';
</script>

Pair a DYMO LabelManager (D1 tape) over **WebUSB** and print a label from
the browser. Requires Chromium-class browser, secure context, and a paired
device. On Linux, your user typically needs a **udev** rule for `0922:*`
and may need `usb_modeswitch` for first-run configuration.

<ClientOnly>
  <LabelManagerDemo />
</ClientOnly>

## Tips

- **D1 tape only.** D2/4xx tape cassettes use a different protocol family
  and aren't supported.
- **No printer?** The preview renders without a device — useful for
  verifying tape width and rendering before ordering hardware.

[Full LabelManager docs →](/labelmanager/) ·
[Hardware list →](/labelmanager/hardware)
