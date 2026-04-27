<script setup lang="ts">
import { getPixel, scaleBitmap, type LabelBitmap } from '@mbtech-nl/bitmap';
import { onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    bitmap: LabelBitmap | null;
    targetHeight?: number;
    pixelScale?: number;
    invert?: boolean;
    fallbackWidth?: number;
  }>(),
  {
    pixelScale: 4,
    invert: false,
    fallbackWidth: 200,
  },
);

const canvas = ref<HTMLCanvasElement | null>(null);

function paintEmpty(): void {
  if (!canvas.value) return;
  const height = (props.targetHeight ?? 16) * props.pixelScale;
  canvas.value.width = props.fallbackWidth;
  canvas.value.height = height;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = props.invert ? '#111' : '#fff';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
}

function draw(): void {
  if (!canvas.value) return;
  if (!props.bitmap) {
    paintEmpty();
    return;
  }

  const fitted = props.targetHeight
    ? scaleBitmap(props.bitmap, props.targetHeight)
    : props.bitmap;

  canvas.value.width = fitted.widthPx * props.pixelScale;
  canvas.value.height = fitted.heightPx * props.pixelScale;

  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = props.invert ? '#111' : '#fff';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.fillStyle = props.invert ? '#fff' : '#111';

  for (let y = 0; y < fitted.heightPx; y += 1) {
    for (let x = 0; x < fitted.widthPx; x += 1) {
      if (getPixel(fitted, x, y)) {
        ctx.fillRect(x * props.pixelScale, y * props.pixelScale, props.pixelScale, props.pixelScale);
      }
    }
  }
}

onMounted(draw);
watch(() => [props.bitmap, props.targetHeight, props.pixelScale, props.invert], draw, {
  deep: false,
});
</script>

<template>
  <canvas ref="canvas" class="preview-canvas" />
</template>

<style scoped>
.preview-canvas {
  display: block;
  image-rendering: pixelated;
}
</style>
