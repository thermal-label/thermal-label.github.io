<script setup lang="ts">
withDefaults(
  defineProps<{
    text: string;
    invert?: boolean;
    label?: string;
    placeholder?: string;
    showInvert?: boolean;
  }>(),
  {
    invert: false,
    label: 'Label text',
    placeholder: 'Type your label…',
    showInvert: true,
  },
);

defineEmits<{
  'update:text': [value: string];
  'update:invert': [value: boolean];
}>();
</script>

<template>
  <div class="text-editor">
    <label class="control control-text">
      <span class="control-label">{{ label }}</span>
      <input
        :value="text"
        type="text"
        class="text-input"
        :placeholder="placeholder"
        @input="$emit('update:text', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label v-if="showInvert" class="control control-checkbox">
      <input
        :checked="invert"
        type="checkbox"
        @change="$emit('update:invert', ($event.target as HTMLInputElement).checked)"
      />
      <span class="control-label">Invert</span>
    </label>
  </div>
</template>

<style scoped>
.text-editor {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.control-text {
  flex: 1;
  min-width: 160px;
}

.control-checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  padding-bottom: 0.15rem;
}

.control-label {
  color: var(--vp-c-text-2);
  font-size: 0.82rem;
  font-weight: 500;
}

.text-input {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-size: 0.95rem;
  padding: 0.45rem 0.6rem;
  transition: border-color 0.15s;
  width: 100%;
}

.text-input:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}
</style>
