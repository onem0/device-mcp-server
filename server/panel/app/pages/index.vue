<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { Device, DeviceWithToken } from '~/utils/types'

useHead({ title: 'Geräte' })

const devices = ref<Device[]>([])
const loaded = ref(false)
const loadError = ref<string | null>(null)
const addOpen = ref(false)

async function load() {
  try {
    devices.value = await api<Device[]>('/devices')
    loadError.value = null
  } catch (err) {
    loadError.value = failureText(err)
  } finally {
    loaded.value = true
  }
}

onMounted(load)
usePolling(load, 5000)

const ops = useDeviceOps({ changed: load })
const online = computed(() => devices.value.filter((d) => d.online).length)

function onCreated(payload: DeviceWithToken) {
  addOpen.value = false
  ops.showSecret(payload, 'create')
  void load()
}
</script>

<template>
  <div class="overview">
    <section class="overview__devices" aria-labelledby="devices-title">
      <div class="overview__head">
        <h1 id="devices-title" class="caps overview__title">
          Geräte · {{ devices.length }}<span v-if="devices.length" class="muted"> · {{ online }} online</span>
        </h1>
        <button type="button" class="btn" @click="addOpen = true"><Plus :size="18" aria-hidden="true" />Gerät hinzufügen</button>
      </div>

      <p v-if="loadError" class="banner" role="alert">{{ loadError }}</p>
      <p v-if="ops.actionError.value" class="banner" role="alert">{{ ops.actionError.value }}</p>

      <div v-if="loaded && !devices.length && !loadError" class="card empty">
        <span class="tape empty__tape">Noch kein Gerät</span>
        <p>Leg ein Gerät an und führe den Befehl, den du danach bekommst, auf dem Gerät aus. Sobald der Daemon läuft, erscheint es hier als online.</p>
        <button type="button" class="btn" @click="addOpen = true"><Plus :size="18" aria-hidden="true" />Erstes Gerät hinzufügen</button>
      </div>

      <DeviceCard
        v-for="device in devices"
        :key="device.id"
        :device="device"
        :editing="ops.editingId.value === device.id"
        :busy="ops.busyId.value === device.id"
        :rename-error="ops.editingId.value === device.id ? ops.renameError.value : null"
        @rename="ops.startRename(device)"
        @save="ops.rename(device, $event)"
        @cancel="ops.editingId.value = null"
        @toggle="ops.toggle(device)"
        @read-only="ops.toggleReadOnly(device)"
        @regenerate="ops.ask('regenerate', device)"
        @remove="ops.ask('remove', device)"
      />
    </section>

    <aside class="overview__side">
      <ConnectionCard />
    </aside>
  </div>

  <AddDeviceDialog :open="addOpen" @close="addOpen = false" @created="onCreated" />
  <TokenDialog :secret="ops.secret.value" @close="ops.secret.value = null" />
  <DeviceConfirm :ops="ops" />
</template>

<style scoped>
.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 25rem;
  align-items: start;
  gap: 2.5rem;
}
.overview__devices {
  display: grid;
  gap: 1rem;
}
.overview__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.25rem;
}
.overview__title {
  white-space: nowrap;
}
.overview__side {
  position: sticky;
  top: 1.5rem;
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
@media (max-width: 1040px) {
  .overview {
    grid-template-columns: minmax(0, 1fr);
  }
  .overview__side {
    position: static;
  }
}
</style>
