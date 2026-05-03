<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface Option {
  value: string;
  label: string;
  count?: number;
}

const props = defineProps<{
  label: string;
  options: Option[];
  selected: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'toggle', value: string): void;
  (e: 'clear'): void;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const buttonLabel = computed(() => {
  const n = props.selected.size;
  if (n === 0) return props.label;
  if (n === 1) {
    const v = [...props.selected][0];
    const opt = props.options.find(o => o.value === v);
    return `${props.label}: ${opt?.label ?? v}`;
  }
  return `${props.label}: ${n} selected`;
});

function close() { open.value = false; }
function toggleOpen() { open.value = !open.value; }

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return;
  if (root.value && !root.value.contains(e.target as Node)) close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    close();
    (root.value?.querySelector('.msd-button') as HTMLElement | null)?.focus();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="msd" :class="{ 'msd-open': open, 'msd-active': selected.size > 0 }">
    <button
      type="button"
      class="msd-button"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <span class="msd-label">{{ buttonLabel }}</span>
      <span v-if="selected.size > 0" class="msd-badge">{{ selected.size }}</span>
      <span class="msd-caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="msd-popover" role="listbox" :aria-label="label">
      <label
        v-for="opt in options"
        :key="opt.value"
        class="msd-option"
        :class="{ 'msd-option-checked': selected.has(opt.value) }"
      >
        <input
          type="checkbox"
          :checked="selected.has(opt.value)"
          @change="emit('toggle', opt.value)"
        />
        <span class="msd-option-label">{{ opt.label }}</span>
        <span v-if="opt.count != null" class="msd-option-count">{{ opt.count }}</span>
      </label>
      <button
        v-if="selected.size > 0"
        type="button"
        class="msd-clear"
        @click="emit('clear')"
      >Clear {{ label.toLowerCase() }}</button>
    </div>
  </div>
</template>

<style scoped>
.msd {
  position: relative;
  display: inline-flex;
}

.msd-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 120ms, background 120ms;
}

.msd-button:hover {
  border-color: var(--vp-c-brand-2);
}

.msd-active .msd-button {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.msd-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}

.msd-caret {
  font-size: 0.7rem;
  opacity: 0.7;
  transition: transform 120ms;
}

.msd-open .msd-caret {
  transform: rotate(180deg);
}

.msd-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 200px;
  padding: 0.35rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.msd-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.45rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--vp-c-text-1);
}

.msd-option:hover {
  background: var(--vp-c-bg-soft);
}

.msd-option input[type="checkbox"] {
  accent-color: var(--vp-c-brand-1);
  cursor: pointer;
  margin: 0;
}

.msd-option-label {
  flex: 1;
}

.msd-option-count {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
}

.msd-option-checked {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.msd-clear {
  margin-top: 0.35rem;
  padding: 0.25rem 0.45rem;
  border: none;
  border-top: 1px solid var(--vp-c-divider);
  background: none;
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  text-align: left;
  border-radius: 0;
}

.msd-clear:hover {
  color: var(--vp-c-brand-1);
}
</style>
