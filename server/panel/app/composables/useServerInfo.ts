import type { ServerInfo } from '~/utils/types'

// Verbindungsdaten ändern sich nicht während der Sitzung, ein Abruf reicht.
export function useServerInfo() {
  const info = useState<ServerInfo | null>('server-info', () => null)
  const error = ref<string | null>(null)
  onMounted(async () => {
    if (info.value) return
    try {
      info.value = await api<ServerInfo>('/info')
    } catch (err) {
      error.value = failureText(err)
    }
  })
  const claudeCodeCommand = computed(() =>
    info.value
      ? ['claude mcp add \\', '  --transport http \\', '  --scope user \\', '  device-mcp \\', `  ${info.value.mcpUrl} \\`, '  --header "Authorization: Bearer $MCP_TOKEN"'].join('\n')
      : '',
  )
  return { info, error, claudeCodeCommand }
}
