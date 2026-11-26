<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

useHead({ title: 'Connection' })
const { info, error, claudeCodeCommand, installTemplate } = useServerInfo()
</script>

<template>
  <div class="setup">
    <h1 class="setup__h1">Connect Claude to your devices</h1>
    <p v-if="error" class="banner" role="alert">{{ error }}</p>

    <template v-if="info">
      <section class="card setup__block" aria-labelledby="s-install">
        <h2 id="s-install" class="setup__title">Install the daemon on a device</h2>
        <ol class="setup__steps">
          <li>Add the device here in the panel. Copy the command you get there: it carries the device's own token, hidden and available only that once.</li>
          <li>Run it on the device as a normal user, not as root. It works on Linux with systemd and on macOS, x86_64 and arm64.</li>
          <li>The script fetches the daemon from this server, connects it to this server and sets it up as a service. The device shows up as online a few seconds later.</li>
        </ol>
        <CopyField label="Command" :value="installTemplate" />
        <NuxtLink to="/?add" class="setup__go">Add a device <ArrowRight :size="16" aria-hidden="true" /></NuxtLink>
      </section>

      <section class="card setup__block" aria-labelledby="s-claude-ai">
        <h2 id="s-claude-ai" class="setup__title">claude.ai and the Claude app</h2>
        <ol class="setup__steps">
          <li>In claude.ai go to Settings → Connectors → <strong>Add custom connector</strong>.</li>
          <li>Enter the MCP URL as the URL.</li>
          <li>In the advanced settings add a request header: name <code>Authorization</code>, value <code>Bearer</code>, a space, then your MCP token.</li>
          <li>Save. The connector then also works in the mobile app.</li>
        </ol>
        <div class="setup__fields">
          <CopyField label="MCP URL" :value="info.mcpUrl" />
          <CopyField label="Header value" value="Bearer <MCP_TOKEN>" />
        </div>
      </section>

      <section class="card setup__block" aria-labelledby="s-code">
        <h2 id="s-code" class="setup__title">Claude Code</h2>
        <p>In a terminal, with the MCP token in the variable <code>MCP_TOKEN</code>. <code>--scope user</code> makes the server available in all projects; without it, it only applies to the current directory.</p>
        <CopyField label="Command" :value="claudeCodeCommand" pre />
      </section>

      <section class="card setup__block" aria-labelledby="s-token">
        <h2 id="s-token" class="setup__title">Where does the MCP token come from?</h2>
        <p>It is <code>MCP_TOKEN</code> in the server's .env (on Coolify under Environment Variables). The panel deliberately never shows it: whoever has it can run commands on every device. Requests with a wrong or missing token only get 401.</p>
      </section>

      <section class="card setup__block" aria-labelledby="s-update">
        <h2 id="s-update" class="setup__title">Daemon updates</h2>
        <p>
          Daemons update themselves. After the server was redeployed they reconnect, see the daemon version this server ships<template v-if="info.daemonVersion"> (currently <code>{{ info.daemonVersion }}</code>)</template>, download it from here, verify its checksum and restart as soon as no job is running. They also check every six hours.
        </p>
        <p>Daemons older than <code>0.3.0</code> cannot do that yet. Run this on the device once; it keeps the token. The same command also turns auto-update off or on again with <code>DEVICE_MCP_AUTO_UPDATE=0</code> or <code>=1</code> in front of <code>bash</code>.</p>
        <CopyField label="On the device" :value="info.updateCommand" />
      </section>

      <section class="card setup__block" aria-labelledby="s-remove">
        <h2 id="s-remove" class="setup__title">Remove the daemon from a device</h2>
        <p>Run this on the device, then delete the device here in the panel. <code>~/.claude-tools</code> is kept.</p>
        <CopyField label="On the device" value="device-mcp-uninstall" />
        <CopyField label="Or straight from the server" :value="info.uninstallCommand" />
      </section>

      <p class="hint">Server {{ info.version }} · {{ info.baseUrl }} · Devices count as offline after {{ info.heartbeatTimeoutSeconds }} s without a heartbeat.</p>
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
.setup__go {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 0.35rem;
  font-weight: 700;
  text-decoration: none;
}
.setup__go:hover {
  text-decoration: underline;
}
</style>
