<script setup lang="ts">
// Rückfragen zu Löschen und neuem Token, gemeinsam für Übersicht und Detailseite.
const props = defineProps<{ ops: ReturnType<typeof useDeviceOps> }>()
const c = props.ops.confirm
</script>

<template>
  <ConfirmDialog
    :open="c.open && c.kind === 'remove'"
    :title="`${c.device?.name ?? 'Gerät'} löschen?`"
    confirm-label="Endgültig löschen"
    danger
    :busy="c.busy"
    :error="c.error"
    @close="c.open = false"
    @confirm="ops.confirmAction()"
  >
    <p>Das Gerät verschwindet samt Jobs und Audit-Log. Sein Token gilt sofort nicht mehr, Claude kommt nicht mehr drauf.</p>
    <p class="hint">Der Daemon bleibt auf dem Gerät installiert. Dort entfernen mit <code>device-mcp-uninstall</code>.</p>
  </ConfirmDialog>
  <ConfirmDialog
    :open="c.open && c.kind === 'regenerate'"
    :title="`Neuen Token für ${c.device?.name ?? 'Gerät'} erzeugen?`"
    confirm-label="Neuen Token erzeugen"
    :busy="c.busy"
    :error="c.error"
    @close="c.open = false"
    @confirm="ops.confirmAction()"
  >
    <p>Der alte Token gilt sofort nicht mehr und die Verbindung wird getrennt. Danach führst du den neuen Install-Befehl auf dem Gerät aus.</p>
  </ConfirmDialog>
</template>
