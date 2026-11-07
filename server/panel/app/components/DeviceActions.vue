<script setup lang="ts">
import { KeyRound, Lock, LockOpen, Pencil, Power, ScrollText, Trash2 } from '@lucide/vue'
import type { Device } from '~/utils/types'

defineProps<{ device: Device; showLog?: boolean; busy?: boolean }>()
const emit = defineEmits<{ rename: []; toggle: []; readOnly: []; regenerate: []; remove: [] }>()
</script>

<template>
  <div class="actions" role="group" :aria-label="`Aktionen für ${device.name}`">
    <NuxtLink v-if="showLog" :to="`/geraete/${device.id}`" class="action" title="Protokoll"><ScrollText :size="16" aria-hidden="true" /><span class="action__label">Protokoll</span></NuxtLink>
    <button type="button" class="action" title="Umbenennen" :disabled="busy" @click="emit('rename')"><Pencil :size="16" aria-hidden="true" /><span class="action__label">Umbenennen</span></button>
    <button type="button" class="action" title="Token neu erzeugen" :disabled="busy" @click="emit('regenerate')"><KeyRound :size="16" aria-hidden="true" /><span class="action__label">Token neu</span></button>
    <button
      type="button"
      class="action"
      :title="device.readOnly ? 'Claude darf wieder schreiben und Befehle ausführen' : 'Nur lesen: keine Befehle, kein Schreiben, keine Session-Eingaben'"
      :aria-pressed="device.readOnly"
      :disabled="busy"
      @click="emit('readOnly')"
    >
      <LockOpen v-if="device.readOnly" :size="16" aria-hidden="true" /><Lock v-else :size="16" aria-hidden="true" />
      <span class="action__label">{{ device.readOnly ? 'Schreiben erlauben' : 'Nur lesen' }}</span>
    </button>
    <button type="button" class="action" :title="device.enabled ? 'Deaktivieren' : 'Aktivieren'" :disabled="busy" @click="emit('toggle')">
      <Power :size="16" aria-hidden="true" /><span class="action__label action__label--keep">{{ device.enabled ? 'Deaktivieren' : 'Aktivieren' }}</span>
    </button>
    <button type="button" class="action action--danger" title="Löschen" :disabled="busy" @click="emit('remove')"><Trash2 :size="16" aria-hidden="true" /><span class="action__label">Löschen</span></button>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.15rem;
}
/* Schmal: nur Symbole in einer Zeile, die Namen stehen in title und für Screenreader im Text. */
@media (max-width: 720px) {
  .actions {
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 0.25rem;
  }
  .action {
    min-width: 2.5rem;
    min-height: 2.5rem;
    justify-content: center;
    padding: 0;
  }
  .action:has(.action__label--keep) {
    padding: 0 0.6rem;
  }
  .action__label:not(.action__label--keep) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}
</style>
