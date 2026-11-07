<script setup lang="ts">
import type { DeviceWithToken } from '~/utils/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [payload: DeviceWithToken] }>()

const name = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    name.value = ''
    error.value = null
    await nextTick()
    input.value?.focus()
  },
)

async function submit() {
  busy.value = true
  error.value = null
  try {
    const payload = await api<DeviceWithToken>('/devices', { method: 'POST', body: { name: name.value.trim() } })
    emit('created', payload)
  } catch (err) {
    error.value = failureText(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog :open="open" label="Gerät hinzufügen" @close="emit('close')">
    <form class="sheet__body" @submit.prevent="submit">
      <h2 class="sheet__title">Gerät hinzufügen</h2>
      <div class="field">
        <label for="new-device-name">Name</label>
        <input
          id="new-device-name"
          ref="input"
          v-model="name"
          class="input"
          placeholder="z. B. raspi-garten"
          maxlength="64"
          autocomplete="off"
          spellcheck="false"
          required
          :aria-invalid="!!error"
          aria-describedby="new-device-hint"
        />
        <p id="new-device-hint" class="hint">Mit diesem Namen sprichst du das Gerät in Claude an. Buchstaben, Ziffern, Punkt, Binde- und Unterstrich.</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <p class="hint">Danach bekommst du einen Install-Befehl mit dem Geräte-Token. Er wird nur ein einziges Mal angezeigt.</p>
      <div class="sheet__actions">
        <button type="button" class="btn btn--quiet" :disabled="busy" @click="emit('close')">Abbrechen</button>
        <button type="submit" class="btn" :disabled="busy || !name.trim()">{{ busy ? 'Lege an …' : 'Anlegen und Token erzeugen' }}</button>
      </div>
    </form>
  </SheetDialog>
</template>
