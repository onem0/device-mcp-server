<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { Device, Memory, MemoryDraft } from '~/utils/types'

useHead({ title: 'Memory' })

const route = useRoute()
const notes = ref<Memory[]>([])
const devices = ref<Device[]>([])
const loaded = ref(false)
const loadError = ref<string | null>(null)
// '' all notes, 'global' only the global ones, otherwise a device ID.
const scope = ref<string>(typeof route.query.device === 'string' ? route.query.device : '')

const creating = ref(false)
const editingId = ref<string | null>(null)
const busyId = ref<string | null>(null)
const formError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const removing = ref<Memory | null>(null)
const removeBusy = ref(false)
const removeError = ref<string | null>(null)

async function load() {
  try {
    notes.value = await api<Memory[]>('/memories', { query: scope.value ? { device: scope.value } : {} })
    loadError.value = null
  } catch (err) {
    loadError.value = failureText(err)
  } finally {
    loaded.value = true
  }
}

watch(scope, async (value) => {
  editingId.value = null
  await navigateTo({ query: value ? { device: value } : {} }, { replace: true })
  await load()
})

onMounted(async () => {
  await load()
  devices.value = await api<Device[]>('/devices').catch(() => [])
})
// Claude may save notes at any time; the open editor keeps its own state.
usePolling(load, 10000)

interface Group {
  key: string
  device: Device | null
  name: string
  notes: Memory[]
}

// Global first, then the devices by name. A device without notes does not get a group.
const groups = computed<Group[]>(() => {
  const byKey = new Map<string, Group>()
  for (const note of notes.value) {
    const key = note.deviceId ?? 'global'
    if (!byKey.has(key)) {
      byKey.set(key, { key, device: devices.value.find((d) => d.id === note.deviceId) ?? null, name: note.deviceName ?? 'Global', notes: [] })
    }
    byKey.get(key)!.notes.push(note)
  }
  return [...byKey.values()].sort((a, b) => (a.key === 'global' ? -1 : b.key === 'global' ? 1 : a.name.localeCompare(b.name)))
})

const pinnedCount = computed(() => notes.value.filter((n) => n.pinned).length)
const scopeName = computed(() => (scope.value === 'global' ? 'global' : (devices.value.find((d) => d.id === scope.value)?.name ?? '')))

function startCreate() {
  editingId.value = null
  formError.value = null
  creating.value = true
}

function startEdit(note: Memory) {
  creating.value = false
  formError.value = null
  editingId.value = note.id
}

async function create(draft: MemoryDraft) {
  busyId.value = 'new'
  formError.value = null
  try {
    await api<Memory>('/memories', { method: 'POST', body: draft })
    creating.value = false
    await load()
  } catch (err) {
    formError.value = failureText(err)
  } finally {
    busyId.value = null
  }
}

async function save(note: Memory, draft: MemoryDraft) {
  busyId.value = note.id
  formError.value = null
  try {
    await api<Memory>(`/memories/${note.id}`, { method: 'PATCH', body: draft })
    editingId.value = null
    await load()
  } catch (err) {
    formError.value = failureText(err)
  } finally {
    busyId.value = null
  }
}

async function togglePin(note: Memory) {
  busyId.value = note.id
  actionError.value = null
  try {
    await api<Memory>(`/memories/${note.id}`, { method: 'PATCH', body: { pinned: !note.pinned } })
    await load()
  } catch (err) {
    actionError.value = failureText(err)
  } finally {
    busyId.value = null
  }
}

function askRemove(note: Memory) {
  removeError.value = null
  removing.value = note
}

async function remove() {
  if (!removing.value) return
  removeBusy.value = true
  removeError.value = null
  try {
    await api(`/memories/${removing.value.id}`, { method: 'DELETE' })
    removing.value = null
    await load()
  } catch (err) {
    removeError.value = failureText(err)
  } finally {
    removeBusy.value = false
  }
}
</script>

<template>
  <div class="memory">
    <div class="memory__head">
      <h1 class="caps">
        Memory · {{ notes.length }} {{ notes.length === 1 ? 'note' : 'notes' }}<span v-if="pinnedCount" class="muted"> · {{ pinnedCount }} pinned</span>
      </h1>
      <div class="memory__tools">
        <div class="field memory__filter">
          <label for="memory-scope" class="sr-only">Show notes for</label>
          <select id="memory-scope" v-model="scope" class="input">
            <option value="">All notes</option>
            <option value="global">Global only</option>
            <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
        <button type="button" class="btn" :disabled="creating" @click="startCreate"><Plus :size="18" aria-hidden="true" />New note</button>
      </div>
    </div>
    <p class="hint memory__intro">
      What Claude keeps across conversations: where things live on your devices, how they run, what you prefer. Claude writes these with memory_save and
      looks them up with memory_search before it searches a device. Pinned notes go to Claude at the start of every conversation.
    </p>
    <p v-if="loadError" class="banner" role="alert">{{ loadError }}</p>
    <p v-if="actionError" class="banner" role="alert">{{ actionError }}</p>

    <section v-if="creating" class="card memory__new" aria-label="New note">
      <MemoryEditor :devices="devices" :scope="scope && scope !== 'global' ? scope : null" :busy="busyId === 'new'" :error="formError" @save="create" @cancel="creating = false" />
    </section>

    <div v-if="loaded && !notes.length && !loadError && !creating" class="card empty">
      <span class="tape empty__tape">Nothing remembered yet</span>
      <p v-if="scope">No notes {{ scope === 'global' ? 'that apply to all devices' : `for ${scopeName}` }} yet.</p>
      <p v-else>
        As soon as Claude learns where something lives on one of your devices, it saves a note here. You can also write one yourself, for example where your
        projects are or how you like things done.
      </p>
      <button type="button" class="btn" @click="startCreate"><Plus :size="18" aria-hidden="true" />Write a note</button>
    </div>

    <section v-for="group in groups" :key="group.key" class="group" :aria-label="group.key === 'global' ? 'Global notes' : `Notes for ${group.name}`">
      <header class="group__head">
        <NuxtLink v-if="group.device" :to="`/devices/${group.device.id}`" class="tape-link" :aria-label="`Open ${group.name}`">
          <LabelTape small :struck="!group.device.enabled">{{ group.name }}</LabelTape>
        </NuxtLink>
        <LabelTape v-else-if="group.key !== 'global'" small>{{ group.name }}</LabelTape>
        <h2 v-else class="caps">Global</h2>
        <span class="caps muted">{{ group.notes.length }} {{ group.notes.length === 1 ? 'note' : 'notes' }}</span>
      </header>
      <div class="card group__list">
        <template v-for="note in group.notes" :key="note.id">
          <div v-if="editingId === note.id" class="group__edit">
            <MemoryEditor :memory="note" :devices="devices" :busy="busyId === note.id" :error="formError" @save="save(note, $event)" @cancel="editingId = null" />
          </div>
          <MemoryItem v-else :memory="note" :busy="busyId === note.id" @edit="startEdit(note)" @pin="togglePin(note)" @remove="askRemove(note)" />
        </template>
      </div>
    </section>
  </div>

  <ConfirmDialog :open="!!removing" title="Delete note?" confirm-label="Delete note" danger :busy="removeBusy" :error="removeError" @confirm="remove" @close="removing = null">
    <p>
      <strong>{{ removing?.title }}</strong> will be gone for Claude too. If it is only out of date, edit it instead.
    </p>
  </ConfirmDialog>
</template>

<style scoped>
.memory {
  display: grid;
  gap: 1rem;
}
.memory__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}
.memory__tools {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.memory__filter {
  flex: none;
  width: 16rem;
}
.memory__intro {
  max-width: 70ch;
  margin-top: -0.5rem;
}
.memory__new {
  padding: 1.35rem 1.5rem 1.5rem;
  background: var(--raised);
}
.group {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
.group__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.25rem;
}
.group__list {
  padding: 0.25rem 1.5rem;
  background: var(--raised);
}
.group__edit {
  padding: 1.25rem 0 1.5rem;
}
.group__edit + :deep(.note),
:deep(.note) + .group__edit {
  border-top: 1px solid var(--line);
}
.tape-link {
  display: inline-flex;
  max-width: 100%;
  border-radius: 4px;
  text-decoration: none;
  transition: transform 160ms var(--ease-out);
}
.tape-link:hover {
  transform: translateY(-1px);
}
.empty {
  display: grid;
  justify-items: start;
  gap: 1rem;
  padding: 1.75rem 1.5rem;
}
.empty p {
  max-width: 60ch;
  color: var(--mute);
}
.empty__tape {
  background: transparent;
  box-shadow: inset 0 0 0 2px var(--line-strong);
  color: var(--mute);
}
@media (max-width: 720px) {
  .memory__tools {
    flex: 1 1 100%;
  }
  .memory__filter {
    flex: 1 1 auto;
    width: auto;
  }
  .group__list {
    padding-inline: 1rem;
  }
}
</style>
