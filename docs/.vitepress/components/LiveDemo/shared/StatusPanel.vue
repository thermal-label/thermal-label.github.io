<script setup lang="ts">
import { computed } from 'vue';

type StatusType = 'idle' | 'ok' | 'error';

const props = defineProps<{
  connected: boolean;
  printerName: string;
  isConnecting: boolean;
  statusMessage: string;
  statusType: StatusType;
}>();

defineEmits<{
  disconnect: [];
}>();

const stateClass = computed(() => {
  if (props.connected) return 'dot-connected';
  if (props.isConnecting) return 'dot-connecting';
  return 'dot-idle';
});

const stateLabel = computed(() => {
  if (props.isConnecting) return 'Connecting…';
  if (props.connected) return props.printerName || 'Connected';
  return 'No printer connected';
});

const statusClass = computed(() => ({
  'status-ok': props.statusType === 'ok',
  'status-error': props.statusType === 'error',
}));
</script>

<template>
  <div class="actions">
    <div class="printer-state">
      <span class="state-dot" :class="stateClass" />
      <span class="state-label">{{ stateLabel }}</span>
      <button v-if="connected" class="btn-disconnect" @click="$emit('disconnect')">
        Disconnect
      </button>
    </div>

    <slot />

    <p v-if="statusMessage" class="status-msg" :class="statusClass">{{ statusMessage }}</p>

    <slot name="footer" />
  </div>
</template>

<style scoped>
.actions {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.printer-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.4rem;
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s;
}

.dot-idle {
  background: var(--vp-c-text-3);
}

.dot-connecting {
  background: #f0a500;
  animation: pulse 1s infinite;
}

.dot-connected {
  background: #4caf50;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.state-label {
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  flex: 1;
}

.btn-disconnect {
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0;
  text-decoration: underline;
}

.btn-disconnect:hover {
  color: var(--vp-c-text-1);
}

.status-msg {
  font-size: 0.85rem;
  margin: 0;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}

.status-ok {
  color: #4caf50;
}

.status-error {
  color: var(--vp-c-danger-1, #f44);
}
</style>
