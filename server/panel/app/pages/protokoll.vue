<script setup lang="ts">
import type { AuditEntry, Device } from '~/utils/types'

useHead({ title: 'Protokoll' })

const route = useRoute()
const entries = ref<AuditEntry[]>([])
const total = ref(0)
const devices = ref<Device[]>([])
const deviceFilter = ref<string>(typeof route.query.device === 'string' ? route.query.device : '')
const loadError = ref<string | null>(null)
const loadingMore = ref(false)
const PAGE = 50

const query = (limit: number, offset: number) => ({ limit, offset, ...(deviceFilter.value ? { device: deviceFilter.value } : {}) })

// Beim Nachladen im Hintergrund die schon sichtbaren Einträge auffrischen (höchstens 200).
async function load() {
  try {
    const limit = Math.min(200, Math.max(PAGE, entries.value.length))
    const res = await api<{ entries: AuditEntry[]; total: number }>('/audit', { query: query(limit, 0) })
    entries.value = res.entries
    total.value = res.total
    loadError.value = null
  } catch (err) {
    loadError.value = failureText(err)
  }
}

async function loadMore() {
  loadingMore.value = true
  try {
    const res = await api<{ entries: AuditEntry[]; total: number }>('/audit', { query: query(PAGE, entries.value.length) })
    entries.value = [...entries.value, ...res.entries]
    total.value = res.total
  } catch (err) {
    loadError.value = failureText(err)
  } finally {
    loadingMore.value = false
  }
}

watch(deviceFilter, async (value) => {
  entries.value = []
  await navigateTo({ query: value ? { device: value } : {} }, { replace: true })
  await load()
})

onMounted(async () => {
  await load()
  devices.value = await api<Device[]>('/devices').catch(() => [])
})
usePolling(load, 10000)
</script>

<template>
  <div class="log">
    <div class="log__head">
      <h1 class="caps">Protokoll · {{ total }} {{ total === 1 ? 'Eintrag' : 'Einträge' }}</h1>
      <div class="field log__filter">
        <label for="log-device" class="sr-only">Gerät</label>
        <select id="log-device" v-model="deviceFilter" class="input">
          <option value="">Alle Geräte</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
    </div>
    <p class="hint log__intro">Jeder Aufruf von Claude über MCP, neueste zuerst: welches Tool, mit welchen Argumenten, mit welchem Ergebnis.</p>
    <p v-if="loadError" class="banner" role="alert">{{ loadError }}</p>

    <section class="card log__table">
      <p v-if="!entries.length" class="hint">Noch keine Aufrufe{{ deviceFilter ? ' für dieses Gerät' : '' }}.</p>
      <AuditTable v-else :entries="entries" :show-device="!deviceFilter" />
      <button v-if="entries.length < total" type="button" class="btn btn--quiet log__more" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Lade …' : `Ältere laden (${total - entries.length} weitere)` }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.log {
  display: grid;
  gap: 1rem;
}
.log__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}
.log__filter {
  width: min(16rem, 100%);
}
.log__intro {
  max-width: 70ch;
  margin-top: -0.5rem;
}
.log__table {
  display: grid;
  gap: 1rem;
  padding: 1.1rem 1.5rem 1.5rem;
  background: var(--raised);
}
.log__more {
  justify-self: center;
}
</style>
