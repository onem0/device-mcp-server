import type { Device, DeviceWithToken } from '~/utils/types'

// Gemeinsame Geräteaktionen für Übersicht und Detailseite.
export function useDeviceOps(hooks: { changed: () => unknown; removed?: (device: Device) => unknown }) {
  const busyId = ref<string | null>(null)
  const editingId = ref<string | null>(null)
  const renameError = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const confirm = reactive({ open: false, kind: null as 'remove' | 'regenerate' | null, device: null as Device | null, busy: false, error: null as string | null })
  const secret = ref<{ payload: DeviceWithToken; mode: 'create' | 'regenerate' } | null>(null)

  function startRename(device: Device) {
    renameError.value = null
    editingId.value = device.id
  }

  async function rename(device: Device, name: string) {
    busyId.value = device.id
    renameError.value = null
    try {
      await api<Device>(`/devices/${device.id}`, { method: 'PATCH', body: { name } })
      editingId.value = null
      await hooks.changed()
    } catch (err) {
      renameError.value = failureText(err)
    } finally {
      busyId.value = null
    }
  }

  async function toggle(device: Device) {
    busyId.value = device.id
    actionError.value = null
    try {
      await api<Device>(`/devices/${device.id}`, { method: 'PATCH', body: { enabled: !device.enabled } })
      await hooks.changed()
    } catch (err) {
      actionError.value = failureText(err)
    } finally {
      busyId.value = null
    }
  }

  function ask(kind: 'remove' | 'regenerate', device: Device) {
    Object.assign(confirm, { open: true, kind, device, busy: false, error: null })
  }

  async function confirmAction() {
    const device = confirm.device
    if (!device) return
    confirm.busy = true
    confirm.error = null
    try {
      if (confirm.kind === 'remove') {
        await api(`/devices/${device.id}`, { method: 'DELETE' })
        confirm.open = false
        await (hooks.removed ? hooks.removed(device) : hooks.changed())
      } else {
        const payload = await api<DeviceWithToken>(`/devices/${device.id}/token`, { method: 'POST' })
        confirm.open = false
        secret.value = { payload, mode: 'regenerate' }
        await hooks.changed()
      }
    } catch (err) {
      confirm.error = failureText(err)
    } finally {
      confirm.busy = false
    }
  }

  const showSecret = (payload: DeviceWithToken, mode: 'create' | 'regenerate') => (secret.value = { payload, mode })

  return { busyId, editingId, renameError, actionError, confirm, secret, startRename, rename, toggle, ask, confirmAction, showSecret }
}
