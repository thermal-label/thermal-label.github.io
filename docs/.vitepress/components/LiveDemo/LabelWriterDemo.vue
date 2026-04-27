<script setup lang="ts">
import {
  MEDIA,
  renderText,
  type Density,
  type LabelBitmap,
  type LabelWriterMedia,
  type RawImageData,
} from '@thermal-label/labelwriter-core';
import type { WebLabelWriterPrinter } from '@thermal-label/labelwriter-web';
import { ref, watch } from 'vue';
import BitmapPreview from './shared/BitmapPreview.vue';
import DevicePairButton from './shared/DevicePairButton.vue';
import StatusPanel from './shared/StatusPanel.vue';
import TextEditor from './shared/TextEditor.vue';
import { useUsbPairing } from './shared/useUsbPairing';

const PRINT_MEDIA: LabelWriterMedia = MEDIA.ADDRESS_STANDARD;

function getPixel(bitmap: LabelBitmap, x: number, y: number): boolean {
  const stride = Math.ceil(bitmap.widthPx / 8);
  return (((bitmap.data[y * stride + Math.floor(x / 8)] ?? 0) >> (7 - (x % 8))) & 1) === 1;
}

function bitmapToRawImage(bitmap: LabelBitmap, inverted: boolean): RawImageData {
  const { widthPx, heightPx } = bitmap;
  const data = new Uint8Array(widthPx * heightPx * 4);
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const bit = getPixel(bitmap, x, y);
      const isInk = inverted ? !bit : bit;
      const offset = (y * widthPx + x) * 4;
      const value = isInk ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width: widthPx, height: heightPx, data };
}

const text = ref('Hello, world!');
const density = ref<Density>('normal');
const invert = ref(false);
const previewBitmap = ref<LabelBitmap | null>(null);
const nfcLock = ref(false);

const pairing = useUsbPairing<WebLabelWriterPrinter>({
  importPrinter: async () => {
    const { requestPrinter } = await import('@thermal-label/labelwriter-web');
    return requestPrinter();
  },
  getPrinterName: p => p.device.name,
  onConnect: p => {
    nfcLock.value = p.device.nfcLock;
  },
  onDisconnect: () => {
    nfcLock.value = false;
  },
});

function updatePreview(): void {
  const trimmed = text.value.trim();
  if (!trimmed) {
    previewBitmap.value = null;
    return;
  }
  try {
    previewBitmap.value = renderText(trimmed, { invert: invert.value });
  } catch {
    previewBitmap.value = null;
  }
}

watch([text, invert], updatePreview, { immediate: true });

async function printLabel(): Promise<void> {
  const trimmed = text.value.trim();
  if (!trimmed) {
    pairing.statusType.value = 'error';
    pairing.statusMessage.value = 'Enter label text first.';
    return;
  }
  await pairing.runPrint(async () => {
    const bitmap = renderText(trimmed, { invert: invert.value });
    const image = bitmapToRawImage(bitmap, invert.value);
    await pairing.printer.value!.print(image, PRINT_MEDIA, { density: density.value });
  });
}
</script>

<template>
  <section class="live-demo">
    <div class="preview-wrap">
      <div class="label-wrap" :class="{ inverted: invert }">
        <BitmapPreview
          :bitmap="previewBitmap"
          :target-height="16"
          :pixel-scale="4"
          :invert="invert"
        />
      </div>
      <p class="preview-hint">Live preview · updates as you type</p>
    </div>

    <div class="controls">
      <TextEditor
        :text="text"
        :invert="invert"
        :show-invert="false"
        @update:text="text = $event"
      />

      <div class="control-row">
        <label class="control">
          <span class="control-label">Density</span>
          <select v-model="density" class="select-input">
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>

        <label class="control control-checkbox">
          <input v-model="invert" type="checkbox" />
          <span class="control-label">Invert</span>
        </label>
      </div>
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
        <DevicePairButton
          v-if="!pairing.printer.value"
          :is-connecting="pairing.isConnecting.value"
          @connect="pairing.connect"
        />
        <button
          class="btn btn-print"
          :disabled="!pairing.printer.value || pairing.isConnecting.value || pairing.isPrinting.value || !text.trim()"
          @click="printLabel"
        >
          {{ pairing.isPrinting.value ? 'Printing…' : '▶ Print label' }}
        </button>
      </div>

      <div v-if="nfcLock" class="nfc-notice">
        <strong>⚠ 550 series detected:</strong>
        This printer requires genuine Dymo-certified label rolls with an NFC chip. Non-certified
        labels will trigger a paper-out error at the hardware level.
      </div>

      <template #footer>
        <p v-if="!pairing.printer.value" class="webusb-note">
          Printing requires <strong>Chrome</strong> or <strong>Edge</strong> with WebUSB. The
          preview works in any browser.
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
}

.label-wrap {
  background: #fff;
  border: 1px solid #d0ccc0;
  border-radius: 6px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  padding: 10px 16px;
}

.label-wrap.inverted {
  background: #111;
  border-color: #444;
}

.preview-hint {
  color: var(--vp-c-text-3);
  font-size: 0.78rem;
  margin: 0.4rem 0 0;
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

.control-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.control-checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  padding-bottom: 0.1rem;
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
  transform: none !important;
}

.btn-print:not(:disabled):hover {
  opacity: 0.88;
}

.btn-print:not(:disabled):active {
  transform: scale(0.97);
}

.nfc-notice {
  background: var(--vp-c-warning-soft);
  border: 1px solid var(--vp-c-warning-2);
  border-radius: 8px;
  color: var(--vp-c-warning-1);
  font-size: 0.85rem;
  padding: 0.6rem 0.85rem;
}

.webusb-note {
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  margin: 0;
}
</style>
