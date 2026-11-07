<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

const { info, error, claudeCodeCommand } = useServerInfo()
</script>

<template>
  <section class="card conn" aria-labelledby="conn-title">
    <h2 id="conn-title" class="caps">Verbindung</h2>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-else-if="info">
      <CopyField label="MCP-URL" :value="info.mcpUrl" />
      <CopyField label="Request-Header" value="Authorization: Bearer <MCP_TOKEN>" />
      <CopyField label="Claude Code" :value="claudeCodeCommand" pre />
      <p class="hint">Der MCP-Token steht als <code>MCP_TOKEN</code> in der .env des Servers. Das Panel zeigt ihn nie an.</p>
      <NuxtLink to="/verbindung" class="conn__more">Anleitung für claude.ai und Claude Code <ArrowRight :size="16" aria-hidden="true" /></NuxtLink>
    </template>
    <p v-else class="hint">Lade …</p>
  </section>
</template>

<style scoped>
.conn {
  display: grid;
  gap: 1rem;
  padding: 1.35rem 1.5rem 1.4rem;
  background: var(--raised);
}
.conn__more {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  text-decoration: none;
}
.conn__more:hover {
  text-decoration: underline;
}
</style>
