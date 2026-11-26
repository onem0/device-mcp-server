<script setup lang="ts">
import type { Device } from '~/utils/types'

defineProps<{ device: Device; editing: boolean; busy: boolean; renameError: string | null }>()
const { info } = useServerInfo()
const emit = defineEmits<{ rename: []; save: [name: string]; cancel: []; toggle: []; readOnly: []; regenerate: []; remove: [] }>()
</script>

<template>
  <article class="card device" :class="{ 'device--off': !device.enabled }">
    <div class="device__top">
      <DeviceTape :device="device" :editing="editing" :busy="busy" :error="renameError" link @save="emit('save', $event)" @cancel="emit('cancel')" />
      <StatusMark :device="device" />
    </div>
    <DeviceFacts :device="device" />
    <p v-if="!device.lastSeenAt && !device.os" class="device__never hint">
      <template v-if="!device.enabled">Disabled before the daemon ever connected. Claude can reach the device again once you enable it.</template>
      <template v-else>The daemon has never connected. The install command could only be copied when adding the device; if it is gone, create a new one with “New token”.</template>
    </p>
    <div v-if="device.daemonUpdate === 'manual' && info" class="device__update">
      <p class="hint">This daemon is too old to update itself. Run the installer on the device once more; it keeps the token, and from then on the daemon updates itself.</p>
      <CopyField label="On the device" :value="info.updateCommand" />
    </div>
    <DeviceActions
      class="device__actions"
      :device="device"
      :busy="busy"
      show-log
      @rename="emit('rename')"
      @toggle="emit('toggle')"
      @read-only="emit('readOnly')"
      @regenerate="emit('regenerate')"
      @remove="emit('remove')"
    />
  </article>
</template>

<style scoped>
.device {
  display: grid;
  gap: 1rem;
  padding: 1.35rem 1.5rem 0.75rem;
}
.device--off {
  background: #eef0eb;
}
.device__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.1rem;
}
.device__actions {
  justify-content: flex-start;
  margin: -0.35rem 0 0 -0.6rem;
}
.device__never {
  max-width: 70ch;
  margin-top: -0.25rem;
}
.device__update {
  display: grid;
  gap: 0.75rem;
  max-width: 70ch;
}
</style>
