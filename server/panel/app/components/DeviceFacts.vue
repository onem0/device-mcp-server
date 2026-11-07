<script setup lang="ts">
import type { Device } from '~/utils/types'

// Feste Zellen: Auf jeder Karte steht derselbe Fakt an derselben Stelle.
const props = defineProps<{ device: Device; detailed?: boolean }>()

const cells = computed(() => {
  const d = props.device
  const base = [
    { label: 'User', value: d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '–') },
    { label: 'System', value: d.os ?? '–' },
    { label: 'Architecture', value: [d.arch, d.kernel].filter(Boolean).join(' · ') || '–' },
    { label: 'Daemon', value: d.daemonVersion ?? '–' },
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
@media (max-width: 720px) {
  .facts,
  .facts--detailed {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
