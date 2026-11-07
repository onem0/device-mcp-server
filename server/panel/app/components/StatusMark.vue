<script setup lang="ts">
import { Lock } from '@lucide/vue'
import type { Device } from '~/utils/types'

const props = defineProps<{ device: Device }>()
const now = useNow()

const state = computed(() => {
  const d = props.device
  if (!d.enabled) return { key: 'disabled', label: 'disabled', detail: d.lastSeenAt ? `last seen ${ago(d.lastSeenAt, now.value)}` : 'never connected' }
  if (d.online) return { key: 'online', label: 'online', detail: d.connectedAt ? `connected for ${since(d.connectedAt, now.value)}` : '' }
  if (!d.lastSeenAt) return { key: 'never', label: 'waiting for the daemon', detail: 'never connected' }
  return { key: 'offline', label: 'offline', detail: `last seen ${ago(d.lastSeenAt, now.value)}` }
})
</script>

<template>
  <span class="status" :class="`status--${state.key}`">
    <i class="status__dot" aria-hidden="true" />
    <strong>{{ state.label }}</strong>
    <span v-if="state.detail" class="status__detail muted">{{ state.detail }}</span>
    <span v-if="device.readOnly" class="status__ro" title="Claude can read, but cannot run commands, write anything or type into sessions.">
      <Lock :size="14" aria-hidden="true" />read-only
    </span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.45rem;
  font-size: var(--fs-m);
}
.status strong {
  font-weight: 700;
}
.status__detail::before {
  content: '· ';
}
.status__ro {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.35rem;
  font-weight: 700;
}
@media (max-width: 720px) {
  .status__detail {
    flex-basis: 100%;
    padding-left: 1.05rem;
  }
  .status__detail::before {
    content: none;
  }
  .status__ro {
    flex-basis: 100%;
    margin-left: 1.05rem;
  }
}
.status__dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 3px rgba(31, 143, 78, 0.16);
}
.status--offline .status__dot,
.status--never .status__dot,
.status--disabled .status__dot {
  background: transparent;
  box-shadow: inset 0 0 0 2px #8a8f86;
}
.status--disabled strong {
  color: var(--mute);
}
</style>
