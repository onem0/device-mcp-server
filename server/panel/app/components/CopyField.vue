<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'

// pre: show multi-line shell commands unchanged, scroll horizontally if need be instead of breaking mid-word.
// display: text that is shown instead of value (e.g. a command with a masked token). What gets copied is always value.
const props = defineProps<{ value: string; label?: string; pre?: boolean; display?: string }>()
const emit = defineEmits<{ copied: [] }>()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  if (!(await copyText(props.value))) return
  copied.value = true
  emit('copied')
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="copy">
    <span v-if="label" class="copy__label caps muted">{{ label }}</span>
    <div class="copy__row">
      <code class="copy__value" :class="{ 'copy__value--pre': pre, 'copy__value--masked': display !== undefined }">{{ display ?? value }}</code>
      <button type="button" class="copy__btn" :class="{ 'is-done': copied }" :aria-label="`Copy ${label ?? 'value'}`" @click="copy">
        <Check v-if="copied" :size="16" aria-hidden="true" />
        <Copy v-else :size="16" aria-hidden="true" />
        <span class="copy__btn-text">{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.copy {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
  container-type: inline-size;
}
/* In narrow columns only the icon, so the value has room. The name is in the aria-label. */
@container (max-width: 26rem) {
  .copy__btn-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .copy__btn {
    padding: 0 0.7rem;
  }
  /* When narrow, better to wrap than to cut off; the lines still remain one option each. */
  .copy .copy__value--pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
.copy__row {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  background: var(--ground);
  box-shadow: inset 0 0 0 1px var(--line);
  min-width: 0;
}
.copy__value {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.75rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
  user-select: all;
}
/* Masked value: selecting would only copy the placeholders, so here it works through the button alone. */
.copy__value--masked {
  user-select: none;
}
.copy__value--pre {
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}
.copy__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
  padding: 0 0.75rem;
  border: 0;
  border-left: 1px solid var(--line);
  border-radius: 0 6px 6px 0;
  background: transparent;
  color: var(--ink);
  font: 600 var(--fs-s) / 1 var(--sans);
  cursor: pointer;
}
.copy__btn:hover {
  background: rgba(21, 21, 21, 0.06);
}
.copy__btn.is-done {
  color: var(--ok);
}
</style>
