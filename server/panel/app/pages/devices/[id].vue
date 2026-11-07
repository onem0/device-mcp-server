<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import type { AuditEntry, Device } from '~/utils/types'

const route = useRoute()
const id = computed(() => String(route.params.id))

const device = ref<Device | null>(null)
const entries = ref<AuditEntry[]>([])
const total = ref(0)
const loadError = ref<string | null>(null)
const loadingMore = ref(false)
const PAGE = 50

useHead({ title: () => device.value?.name ?? 'Device' })

async function loadDevice() {
  try {
    device.value = await api<Device>(`/devices/${id.value}`)
    loadError.value = null
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 404) return navigateTo('/')
    loadError.value = failureText(err)
  }
}

// Beim Nachladen im Hintergrund die schon sichtbaren Einträge auffrischen (höchstens 200).
async function loadAudit() {
  try {
    const limit = Math.min(200, Math.max(PAGE, entries.value.length))
    const res = await api<{ entries: AuditEntry[]; total: number }>(`/devices/${id.value}/audit`, { query: { limit, offset: 0 } })
    entries.value = res.entries
    total.value = res.total
  } catch (err) {
    loadError.value = failureText(err)
  }
}

async function loadMore() {
  loadingMore.value = true
  try {
    const res = await api<{ entries: AuditEntry[]; total: number }>(`/devices/${id.value}/audit`, { query: { limit: PAGE, offset: entries.value.length } })
    entries.value = [...entries.value, ...res.entries]
    total.value = res.total
  } catch (err) {
    loadError.value = failureText(err)
  } finally {
    loadingMore.value = false
  }
}

onMounted(() => Promise.all([loadDevice(), loadAudit()]))
usePolling(loadDevice, 5000)
usePolling(loadAudit, 10000)

const ops = useDeviceOps({ changed: loadDevice, removed: () => navigateTo('/') })
</script>

<template>
  <div class="detail">
    <NuxtLink to="/" class="action detail__back"><ArrowLeft :size="16" aria-hidden="true" />All devices</NuxtLink>
    <p v-if="loadError" class="banner" role="alert">{{ loadError }}</p>
    <p v-if="ops.actionError.value" class="banner" role="alert">{{ ops.actionError.value }}</p>

    <template v-if="device">
      <header class="card detail__head" :class="{ 'is-off': !device.enabled }">
        <div class="detail__top">
          <h1 class="detail__name">
            <DeviceTape :device="device" :editing="ops.editingId.value === device.id" :busy="ops.busyId.value === device.id" :error="ops.renameError.value" @save="ops.rename(device, $event)" @cancel="ops.editingId.value = null" />
          </h1>
          <StatusMark :device="device" />
          <DeviceActions
            class="detail__actions"
            :device="device"
            :busy="ops.busyId.value === device.id"
            @rename="ops.startRename(device)"
            @toggle="ops.toggle(device)"
            @read-only="ops.toggleReadOnly(device)"
            @regenerate="ops.ask('regenerate', device)"
            @remove="ops.ask('remove', device)"
          />
        </div>
        <DeviceFacts :device="device" detailed />
      </header>

      <section class="card detail__audit" aria-labelledby="audit-title">
        <h2 id="audit-title" class="caps">Audit log · {{ total }} {{ total === 1 ? 'entry' : 'entries' }}</h2>
        <p v-if="!entries.length" class="hint">Claude has not run, read or written anything on this device yet.</p>
        <AuditTable v-else :entries="entries" />
        <button v-if="entries.length < total" type="button" class="btn btn--quiet detail__more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading …' : `Load older (${total - entries.length} more)` }}
        </button>
      </section>
    </template>
  </div>

  <TokenDialog :secret="ops.secret.value" @close="ops.secret.value = null" />
  <DeviceConfirm :ops="ops" />
</template>

<style scoped>
.detail {
  display: grid;
  gap: 1.25rem;
}
.detail__back {
  justify-self: start;
  margin-left: -0.6rem;
}
.detail__head {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem 1.5rem 0.4rem;
}
.detail__head.is-off {
  background: #eef0eb;
}
.detail__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.1rem;
}
.detail__name {
  font: inherit;
}
.detail__actions {
  margin-left: auto;
}
.detail__audit {
  display: grid;
  gap: 1rem;
  padding: 1.35rem 1.5rem 1.5rem;
  background: var(--raised);
}
.detail__more {
  justify-self: center;
}
@media (max-width: 720px) {
  .detail__actions {
    margin-left: -0.6rem;
    flex-basis: 100%;
  }
}
</style>
