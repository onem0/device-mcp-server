<script setup lang="ts">
useHead({ title: 'Verbindung' })
const { info, error, claudeCodeCommand } = useServerInfo()
</script>

<template>
  <div class="setup">
    <h1 class="setup__h1">Claude mit deinen Geräten verbinden</h1>
    <p v-if="error" class="banner" role="alert">{{ error }}</p>

    <template v-if="info">
      <section class="card setup__block" aria-labelledby="s-claude-ai">
        <h2 id="s-claude-ai" class="setup__title">claude.ai und Claude-App</h2>
        <ol class="setup__steps">
          <li>In claude.ai unter Einstellungen → Connectors → <strong>Custom Connector hinzufügen</strong>.</li>
          <li>Als URL die MCP-URL eintragen.</li>
          <li>Unter den erweiterten Einstellungen einen Request-Header anlegen: Name <code>Authorization</code>, Wert <code>Bearer</code> plus Leerzeichen plus dein MCP-Token.</li>
          <li>Speichern. Der Connector gilt danach auch in der Handy-App.</li>
        </ol>
        <div class="setup__fields">
          <CopyField label="MCP-URL" :value="info.mcpUrl" />
          <CopyField label="Header-Wert" value="Bearer <MCP_TOKEN>" />
        </div>
      </section>

      <section class="card setup__block" aria-labelledby="s-code">
        <h2 id="s-code" class="setup__title">Claude Code</h2>
        <p>Im Terminal, mit dem MCP-Token in der Variable <code>MCP_TOKEN</code>. <code>--scope user</code> macht den Server in allen Projekten verfügbar; ohne gilt er nur im aktuellen Ordner.</p>
        <CopyField label="Befehl" :value="claudeCodeCommand" pre />
      </section>

      <section class="card setup__block" aria-labelledby="s-token">
        <h2 id="s-token" class="setup__title">Woher kommt der MCP-Token?</h2>
        <p>Er steht als <code>MCP_TOKEN</code> in der .env des Servers (auf Coolify unter Environment Variables). Das Panel zeigt ihn bewusst nie an: Wer ihn hat, kann auf allen Geräten Befehle ausführen. Wer falsch oder ohne Token anfragt, bekommt nur 401.</p>
      </section>

      <section class="card setup__block" aria-labelledby="s-remove">
        <h2 id="s-remove" class="setup__title">Daemon von einem Gerät entfernen</h2>
        <p>Auf dem Gerät ausführen, danach das Gerät hier im Panel löschen. <code>~/.claude-tools</code> bleibt erhalten.</p>
        <CopyField label="Auf dem Gerät" value="device-mcp-uninstall" />
        <CopyField label="Oder direkt vom Server" :value="info.uninstallCommand" />
      </section>

      <p class="hint">Server {{ info.version }} · {{ info.baseUrl }} · Geräte gelten nach {{ info.heartbeatTimeoutSeconds }} s ohne Heartbeat als offline.</p>
    </template>
  </div>
</template>

<style scoped>
.setup {
  display: grid;
  gap: 1rem;
  max-width: 52rem;
}
.setup__h1 {
  font-size: var(--fs-l);
  font-weight: 800;
  font-stretch: 80%;
  line-height: 1.2;
}
.setup__block {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  background: var(--raised);
}
.setup__block p {
  max-width: 68ch;
}
.setup__title {
  font-size: var(--fs-l);
  font-weight: 800;
  font-stretch: 80%;
  line-height: 1.2;
}
.setup__steps {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding-left: 1.25rem;
  max-width: 68ch;
}
.setup__fields {
  display: grid;
  gap: 0.9rem;
}
</style>
