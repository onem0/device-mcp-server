<script setup lang="ts">
import type { Device } from '~/utils/types'

// Name tape; when renaming it is reprinted in place.
const props = defineProps<{ device: Device; editing: boolean; link?: boolean; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ save: [name: string]; cancel: [] }>()

const draft = ref(props.device.name)
// Reprint only after a name change, not on first display.
const reprinted = ref(false)
watch(
  () => props.device.name,
  () => (reprinted.value = true),
)
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.editing,
  async (on) => {
    if (!on) return
    draft.value = props.device.name
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
)

function submit() {
  const name = draft.value.trim()
  if (!name || name === props.device.name) return emit('cancel')
  emit('save', name)
}
</script>

<template>
  <form v-if="editing" class="rename" @submit.prevent="submit" @keydown.esc.prevent="emit('cancel')">
    <label class="sr-only" :for="`rename-${device.id}`">New name for {{ device.name }}</label>
    <input
      :id="`rename-${device.id}`"
      ref="input"
      v-model="draft"
      class="tape rename__input"
      maxlength="64"
      autocomplete="off"
      spellcheck="false"
      :disabled="busy"
      :aria-invalid="!!error"
    />
    <button type="submit" class="btn" :disabled="busy">Save</button>
    <button type="button" class="btn btn--quiet" :disabled="busy" @click="emit('cancel')">Cancel</button>
    <p v-if="error" class="error rename__error" role="alert">{{ error }}</p>
  </form>
  <NuxtLink v-else-if="link" :to="`/devices/${device.id}`" class="tape-link" :aria-label="`Open ${device.name}`">
    <LabelTape :key="device.name" :class="{ 'is-reprinted': reprinted }" :struck="!device.enabled">{{ device.name }}</LabelTape>
  </NuxtLink>
  <LabelTape v-else :key="device.name" :class="{ 'is-reprinted': reprinted }" :struck="!device.enabled">{{ device.name }}</LabelTape>
</template>

<style scoped>
.rename {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.rename__input {
  width: min(22rem, 100%);
  border: 0;
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  text-transform: none;
}
.rename__error {
  flex-basis: 100%;
}
.tape-link {
  display: inline-flex;
  max-width: 100%;
  border-radius: 4px;
  text-decoration: none;
  transition: transform 160ms var(--ease-out);
}
.tape-link:hover {
  transform: translateY(-1px);
}
@media (prefers-reduced-motion: no-preference) {
  .is-reprinted {
    animation: reprint 480ms linear both;
  }
}
@keyframes reprint {
  from {
    clip-path: inset(-6px 100% -6px 0);
  }
  to {
    clip-path: inset(-6px -6px -6px 0);
  }
}
</style>
