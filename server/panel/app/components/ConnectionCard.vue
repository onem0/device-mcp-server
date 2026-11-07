<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

const { info, error, claudeCodeCommand } = useServerInfo()
</script>

<template>
  <section class="card conn" aria-labelledby="conn-title">
    <h2 id="conn-title" class="caps">Connection</h2>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-else-if="info">
      <CopyField label="MCP URL" :value="info.mcpUrl" />
      <CopyField label="Request header" value="Authorization: Bearer <MCP_TOKEN>" />
      <CopyField label="Claude Code" :value="claudeCodeCommand" pre />
      <p class="hint">The MCP token is <code>MCP_TOKEN</code> in the server's .env. The panel never shows it.</p>
      <NuxtLink to="/connect" class="conn__more">Setup for claude.ai and Claude Code <ArrowRight :size="16" aria-hidden="true" /></NuxtLink>
    </template>
    <p v-else class="hint">Loading …</p>
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
