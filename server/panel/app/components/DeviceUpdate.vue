<script setup lang="ts">
import { Download, Loader } from '@lucide/vue'
import type { Device } from '~/utils/types'

// Everything about a device's daemon version: offer the update, show progress, name errors.
// Only appears when there is something to do or to say.
const props = defineProps<{ device: Device; busy?: boolean }>()
const emit = defineEmits<{ update: [] }>()
const { info } = useServerInfo()

const target = computed(() => props.device.updateStatus?.target ?? info.value?.daemonVersion ?? null)
const state = computed(() => props.device.updateStatus?.state ?? null)
const canUpdate = computed(() => props.device.daemonUpdate === 'available' && state.value !== 'running' && state.value !== 'restarting')
const visible = computed(() => state.value !== null || props.device.daemonUpdate !== null)
</script>

<template>
  <div v-if="visible" class="update">
    <p v-if="state === 'running'" class="update__line" role="status">
      <Loader :size="16" class="update__spin" aria-hidden="true" />
      <span>Updating the daemon<template v-if="target"> to <code>{{ target }}</code></template> …</span>
    </p>
    <p v-else-if="state === 'restarting'" class="update__line" role="status">
      <span><strong>Daemon <code>{{ target }}</code></strong> · {{ device.updateStatus?.message }}</span>
    </p>
    <template v-else>
      <p v-if="state === 'failed'" class="error" role="alert">The update<template v-if="target"> to {{ target }}</template> failed: {{ device.updateStatus?.message }}</p>

      <div v-if="canUpdate" class="update__offer">
        <button type="button" class="btn btn--quiet" :disabled="busy || !device.online" @click="emit('update')">
          <Download :size="16" aria-hidden="true" />{{ state === 'failed' ? 'Try again' : target ? `Update to ${target}` : 'Update' }}
        </button>
        <p class="hint">
          <template v-if="!device.online">The device has to be online for an update.</template>
          <template v-else-if="device.autoUpdate">Auto-update is on and runs when the device connects. You can also start it now.</template>
          <template v-else>Downloads the daemon from this server and restarts it once no job is running.</template>
        </p>
      </div>

      <div v-else-if="device.daemonUpdate === 'manual' && info" class="update__manual">
        <p class="hint">This daemon is too old to be updated from the panel. Run the installer on the device once more; it keeps the token, and after that the Update button works.</p>
        <CopyField label="On the device" :value="info.updateCommand" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.update {
  display: grid;
  gap: 0.75rem;
  max-width: 70ch;
}
.update__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.update__offer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
}
.update__offer .btn {
  flex: none;
}
.update__offer .hint {
  flex: 1 1 16rem;
}
.update__manual {
  display: grid;
  gap: 0.75rem;
}
.update__spin {
  flex: none;
  animation: update-spin 1.2s linear infinite;
}
@keyframes update-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .update__spin {
    animation: none;
  }
}
</style>
