<script setup lang="ts">
// Confirmation prompts for deleting and a new token, shared by overview and detail page.
const props = defineProps<{ ops: ReturnType<typeof useDeviceOps> }>()
const c = props.ops.confirm
</script>

<template>
  <ConfirmDialog
    :open="c.open && c.kind === 'remove'"
    :title="`Delete ${c.device?.name ?? 'device'}?`"
    confirm-label="Delete permanently"
    danger
    :busy="c.busy"
    :error="c.error"
    @close="c.open = false"
    @confirm="ops.confirmAction()"
  >
    <p>The device is removed together with its jobs and audit log. Its token stops working immediately, Claude can no longer reach it.</p>
    <p class="hint">The daemon stays installed on the device. Remove it there with <code>device-mcp-uninstall</code>.</p>
  </ConfirmDialog>
  <ConfirmDialog
    :open="c.open && c.kind === 'regenerate'"
    :title="`Create a new token for ${c.device?.name ?? 'device'}?`"
    confirm-label="Create new token"
    :busy="c.busy"
    :error="c.error"
    @close="c.open = false"
    @confirm="ops.confirmAction()"
  >
    <p>The old token stops working immediately and the connection is closed. Then run the new install command on the device.</p>
  </ConfirmDialog>
</template>
