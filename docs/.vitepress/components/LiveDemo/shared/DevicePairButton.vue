<script setup lang="ts">
withDefaults(
  defineProps<{
    isConnecting: boolean;
    label?: string;
    connectingLabel?: string;
  }>(),
  {
    label: '🔌 Connect printer',
    connectingLabel: 'Waiting for browser…',
  },
);

defineEmits<{
  connect: [];
}>();
</script>

<template>
  <button class="btn btn-connect" :disabled="isConnecting" @click="$emit('connect')">
    {{ isConnecting ? connectingLabel : label }}
  </button>
</template>

<style scoped>
.btn-connect {
  background: var(--vp-c-brand-1);
  border: none;
  border-radius: 8px;
  color: var(--vp-c-white);
  cursor: pointer;
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.55rem 1.2rem;
  transition:
    opacity 0.15s,
    transform 0.1s;
}

.btn-connect:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none !important;
}

.btn-connect:not(:disabled):hover {
  opacity: 0.88;
}

.btn-connect:not(:disabled):active {
  transform: scale(0.97);
}
</style>
