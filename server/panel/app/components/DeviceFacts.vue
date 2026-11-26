<script setup lang="ts">
import type { Device } from '~/utils/types'

// Fixed cells: on every card the same fact sits in the same place.
const props = defineProps<{ device: Device; detailed?: boolean }>()
const { info } = useServerInfo()

// Shown below the daemon version as long as the server ships a newer one.
const updateNote = computed(() => {
  const status = props.device.updateStatus
  const target = status?.target ?? info.value?.daemonVersion
  if (status?.state === 'running') return target ? `Updating to ${target}` : 'Updating'
  if (status?.state === 'restarting') return target ? `${target} installed, restart pending` : 'Restart pending'
  if (props.device.daemonUpdate === 'available') return target ? `${target} available` : 'Update available'
  if (props.device.daemonUpdate === 'manual') return target ? `Needs a manual update to ${target}` : 'Needs a manual update'
  return null
})

interface Cell {
  label: string
  value: string
  note?: string | null
}

const cells = computed<Cell[]>(() => {
  const d = props.device
  const base: Cell[] = [
    { label: 'User', value: d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '–') },
    { label: 'System', value: d.os ?? '–' },
    { label: 'Architecture', value: [d.arch, d.kernel].filter(Boolean).join(' · ') || '–' },
    { label: 'Daemon', value: d.daemonVersion ?? '–', note: updateNote.value },
  ]
  if (!props.detailed) return base
  return [
    ...base,
    { label: 'Home', value: d.homeDir ?? '–' },
    { label: 'Added', value: day(d.createdAt) },
    { label: 'Device ID', value: d.id },
  ]
})
</script>

<template>
  <dl class="facts" :class="{ 'facts--detailed': detailed }">
    <div v-for="cell in cells" :key="cell.label" class="facts__cell">
      <dt class="caps muted">{{ cell.label }}</dt>
      <dd class="mono">{{ cell.value }}</dd>
      <dd v-if="cell.note" class="facts__note">{{ cell.note }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--line);
}
.facts--detailed {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.facts__cell {
  display: grid;
  align-content: start;
  gap: 0.3rem;
  padding: 0.85rem 1rem 0.1rem 0;
  min-width: 0;
}
.facts--detailed {
  row-gap: 0.75rem;
  padding-bottom: 1.1rem;
}
dd {
  overflow-wrap: anywhere;
}
.facts__note {
  margin-top: -0.1rem;
  color: var(--mute);
  font-size: var(--fs-s);
  line-height: 1.4;
}
@media (max-width: 720px) {
  .facts,
  .facts--detailed {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
