<script setup lang="ts">
import type { Device } from '~/utils/types'

defineProps<{ device: Device; editing: boolean; busy: boolean; renameError: string | null }>()
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
      <template v-if="!device.enabled">Deaktiviert, bevor sich der Daemon je gemeldet hat. Claude erreicht das Gerät erst wieder, wenn du es aktivierst.</template>
      <template v-else>Der Daemon hat sich noch nie gemeldet. Den Install-Befehl gab es nur beim Anlegen; ist er weg, erzeuge mit „Token neu“ einen neuen.</template>
    </p>
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
</style>
