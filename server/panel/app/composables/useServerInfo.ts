import type { ServerInfo } from '~/utils/types'

// Verbindungsdaten ändern sich nicht während der Sitzung, ein Abruf reicht.
// Mehrere Komponenten fragen gleichzeitig (jede Gerätekarte), deshalb teilen sie sich den laufenden Abruf.
let pending: Promise<ServerInfo> | null = null

export function useServerInfo() {
  const info = useState<ServerInfo | null>('server-info', () => null)
  const error = ref<string | null>(null)
  onMounted(async () => {
    if (info.value) return
    try {
      pending ??= api<ServerInfo>('/info')
      info.value = await pending
    } catch (err) {
      pending = null
      error.value = failureText(err)
    }
  })
  // Der Token kommt aus „Add device“; hier steht nur die Form des Befehls.
  const installTemplate = computed(() => (info.value ? `curl -fsSL ${info.value.baseUrl}/install.sh | DEVICE_MCP_TOKEN='<device token>' bash` : ''))
  const claudeCodeCommand = computed(() =>
    info.value
      ? ['claude mcp add \\', '  --transport http \\', '  --scope user \\', '  device-mcp \\', `  ${info.value.mcpUrl} \\`, '  --header "Authorization: Bearer $MCP_TOKEN"'].join('\n')
      : '',
  )
  return { info, error, claudeCodeCommand, installTemplate }
}
