<script setup lang="ts">
// Hülle um <dialog> mit showModal. Schließen per Esc fragt erst beim Elternteil nach (guard).
const props = defineProps<{ open: boolean; label: string; guard?: () => boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  },
  { flush: 'post' },
)

onMounted(() => {
  if (props.open) dialog.value?.showModal()
})

function onCancel(event: Event) {
  event.preventDefault()
  if (!props.guard || props.guard()) emit('close')
}

defineExpose({ dialog })
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="label" @cancel="onCancel" @close="open && emit('close')">
    <slot />
  </dialog>
</template>
