<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  findMedia,
  MEDIA,
  renderText,
  rotateBitmap,
  type LabelBitmap,
  type RawImageData,
} from '@thermal-label/brother-ql-core';
import type { WebBrotherQLPrinter } from '@thermal-label/brother-ql-web';
import BitmapPreview from './shared/BitmapPreview.vue';
import DevicePairButton from './shared/DevicePairButton.vue';
import StatusPanel from './shared/StatusPanel.vue';
import TextEditor from './shared/TextEditor.vue';
import { useUsbPairing } from './shared/useUsbPairing';

function bitmapToRawImage(bitmap: LabelBitmap): RawImageData {
  const { widthPx, heightPx, data } = bitmap;
  const stride = Math.ceil(widthPx / 8);
  const out = new Uint8Array(widthPx * heightPx * 4);
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const bit = ((data[y * stride + Math.floor(x / 8)]! >> (7 - (x % 8))) & 1) === 1;
      const offset = (y * widthPx + x) * 4;
      const value = bit ? 0 : 255;
      out[offset] = value;
      out[offset + 1] = value;
      out[offset + 2] = value;
      out[offset + 3] = 255;
    }
  }
  return { width: widthPx, height: heightPx, data: out };
}

const mediaOptions = Object.values(MEDIA).filter(m => m.type === 'continuous');
const selectedMediaId = ref<number>(259);
const media = computed(() => findMedia(selectedMediaId.value) ?? mediaOptions[0]!);

const text = ref('Hello QL');
const invert = ref(false);

const previewBitmap = ref<LabelBitmap | null>(null);

const isWebUSBAvailable = ref(false);
onMounted(() => {
  isWebUSBAvailable.value = typeof navigator !== 'undefined' && 'usb' in navigator;
});

const pairing = useUsbPairing<WebBrotherQLPrinter>({
  importPrinter: async () => {
    const { requestPrinter } = await import('@thermal-label/brother-ql-web');
    return requestPrinter();
  },
  getPrinterName: p => p.device.name,
});

function updatePreview(): void {
  try {
    previewBitmap.value = renderText(text.value || ' ', {
      invert: invert.value,
      scaleX: 1,
      scaleY: 1,
    });
  } catch {
    previewBitmap.value = null;
  }
}

watch([text, invert, selectedMediaId], updatePreview, { immediate: true });

async function printLabel(): Promise<void> {
  await pairing.runPrint(async () => {
    const bitmap = rotateBitmap(
      renderText(text.value, { invert: invert.value, scaleX: 1, scaleY: 1 }),
      90,
    );
    await pairing.printer.value!.print(bitmapToRawImage(bitmap), media.value);
  });
}
</script>

<template>
  <section class="live-demo">
    <div class="preview-wrap">
      <div class="tape-label" :class="{ inverted: invert }">
        <BitmapPreview :bitmap="previewBitmap" :target-height="24" :pixel-scale="2" :invert="invert" />
      </div>
      <p class="preview-hint">Live preview · updates as you type</p>
    </div>

    <div class="controls">
      <label class="control">
        <span class="control-label">Media</span>
        <select v-model="selectedMediaId" class="select-input">
          <option v-for="m in mediaOptions" :key="m.id" :value="m.id">
            {{ m.name }} ({{ m.widthMm }}mm)
          </option>
        </select>
      </label>

      <TextEditor
        :text="text"
        :invert="invert"
        @update:text="text = $event"
        @update:invert="invert = $event"
      />
    </div>

    <StatusPanel
      :connected="!!pairing.printer.value"
      :printer-name="pairing.printerName.value"
      :is-connecting="pairing.isConnecting.value"
      :status-message="pairing.statusMessage.value"
      :status-type="pairing.statusType.value"
      @disconnect="pairing.disconnect"
    >
      <div class="action-buttons">
        <template v-if="isWebUSBAvailable">
          <DevicePairButton
            v-if="!pairing.printer.value"
            :is-connecting="pairing.isConnecting.value"
            @connect="pairing.connect"
          />
          <button
            class="btn btn-print"
            :disabled="!pairing.printer.value || pairing.isPrinting.value"
            @click="printLabel"
          >
            {{ pairing.isPrinting.value ? 'Printing…' : '▶ Print label' }}
          </button>
        </template>
        <template v-else>
          <p class="webusb-note">
            Printing requires <strong>Chrome</strong> or <strong>Edge</strong> with WebUSB. The
            preview works in any browser.
          </p>
        </template>
      </div>

      <template #footer>
        <p v-if="isWebUSBAvailable && !pairing.printer.value" class="editor-lite-note">
          If your printer is not detected, check that
          <a href="/brother-ql/hardware#editor-lite-mode">Editor Lite mode is disabled</a>.
        </p>
      </template>
    </StatusPanel>
  </section>
</template>

<style scoped>
.live-demo {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  margin: 1.5rem 0;
}

.preview-wrap {
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 1.25rem 1.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tape-label {
  background: #fff;
  border: 1px solid #d0ccc0;
  border-radius: 4px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  padding: 6px 10px;
}

.tape-label.inverted {
  background: #111;
  border-color: #444;
}

.preview-hint {
  color: var(--vp-c-text-3);
  font-size: 0.78rem;
  margin: 0.2rem 0 0;
  text-align: center;
}

.controls {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-divider);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.control-label {
  color: var(--vp-c-text-2);
  font-size: 0.82rem;
  font-weight: 500;
}

.select-input {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-size: 0.95rem;
  padding: 0.45rem 0.6rem;
  transition: border-color 0.15s;
}

.select-input:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}

.action-buttons {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn-print {
  background: #4caf50;
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.55rem 1.2rem;
  transition:
    opacity 0.15s,
    transform 0.1s;
}

.btn-print:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.btn-print:not(:disabled):hover {
  opacity: 0.88;
}

.btn-print:not(:disabled):active {
  transform: scale(0.97);
}

.webusb-note,
.editor-lite-note {
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  margin: 0;
}
</style>
