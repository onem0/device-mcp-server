<script setup lang="ts">
defineProps<{ open: boolean; title: string; confirmLabel: string; danger?: boolean; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <SheetDialog :open="open" :label="title" @close="emit('close')">
    <form class="sheet__body" method="dialog" @submit.prevent="emit('confirm')">
      <h2 class="sheet__title">{{ title }}</h2>
      <div class="confirm__text"><slot /></div>
      <p v-if="error" class="banner" role="alert">{{ error }}</p>
      <div class="sheet__actions">
        <button type="button" class="btn btn--quiet" :disabled="busy" @click="emit('close')">Abbrechen</button>
        <button type="submit" class="btn" :class="{ 'btn--danger': danger }" :disabled="busy">{{ busy ? 'Einen Moment …' : confirmLabel }}</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.confirm__text {
  display: grid;
  gap: 0.6rem;
  max-width: 60ch;
}
</style>
