<script setup lang="ts">
import { KeyRound, Pencil, Power, ScrollText, Trash2 } from '@lucide/vue'
import type { Device } from '~/utils/types'

defineProps<{ device: Device; showLog?: boolean; busy?: boolean }>()
const emit = defineEmits<{ rename: []; toggle: []; regenerate: []; remove: [] }>()
</script>

<template>
  <div class="actions" role="group" :aria-label="`Aktionen für ${device.name}`">
    <NuxtLink v-if="showLog" :to="`/geraete/${device.id}`" class="action" title="Protokoll"><ScrollText :size="16" aria-hidden="true" /><span class="action__label">Protokoll</span></NuxtLink>
    <button type="button" class="action" title="Umbenennen" :disabled="busy" @click="emit('rename')"><Pencil :size="16" aria-hidden="true" /><span class="action__label">Umbenennen</span></button>
    <button type="button" class="action" title="Token neu erzeugen" :disabled="busy" @click="emit('regenerate')"><KeyRound :size="16" aria-hidden="true" /><span class="action__label">Token neu</span></button>
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
