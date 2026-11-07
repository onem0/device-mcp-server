<script setup lang="ts">
import { KeyRound, Lock, LockOpen, Pencil, Power, ScrollText, Trash2 } from '@lucide/vue'
import type { Device } from '~/utils/types'

defineProps<{ device: Device; showLog?: boolean; busy?: boolean }>()
const emit = defineEmits<{ rename: []; toggle: []; readOnly: []; regenerate: []; remove: [] }>()
</script>

<template>
  <div class="actions" role="group" :aria-label="`Actions for ${device.name}`">
    <NuxtLink v-if="showLog" :to="`/devices/${device.id}`" class="action" title="Audit log"><ScrollText :size="16" aria-hidden="true" /><span class="action__label">Audit log</span></NuxtLink>
    <button type="button" class="action" title="Rename" :disabled="busy" @click="emit('rename')"><Pencil :size="16" aria-hidden="true" /><span class="action__label">Rename</span></button>
    <button type="button" class="action" title="Create a new token" :disabled="busy" @click="emit('regenerate')"><KeyRound :size="16" aria-hidden="true" /><span class="action__label">New token</span></button>
    <button
      type="button"
      class="action"
      :title="device.readOnly ? 'Let Claude write and run commands again' : 'Read-only: no commands, no writing, no session input'"
      :aria-pressed="device.readOnly"
      :disabled="busy"
      @click="emit('readOnly')"
    >
      <LockOpen v-if="device.readOnly" :size="16" aria-hidden="true" /><Lock v-else :size="16" aria-hidden="true" />
      <span class="action__label">{{ device.readOnly ? 'Allow writing' : 'Read-only' }}</span>
    </button>
    <button type="button" class="action" :title="device.enabled ? 'Disable' : 'Enable'" :disabled="busy" @click="emit('toggle')">
      <Power :size="16" aria-hidden="true" /><span class="action__label action__label--keep">{{ device.enabled ? 'Disable' : 'Enable' }}</span>
    </button>
    <button type="button" class="action action--danger" title="Delete" :disabled="busy" @click="emit('remove')"><Trash2 :size="16" aria-hidden="true" /><span class="action__label">Delete</span></button>
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
