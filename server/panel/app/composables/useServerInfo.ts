import type { ServerInfo } from '~/utils/types'

// Connection details do not change during the session, one fetch is enough.
// Several components ask at the same time (every device card), so they share the fetch in progress.
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
  // The token comes from "Add device"; only the shape of the command is here.
  const installTemplate = computed(() => (info.value ? `curl -fsSL ${info.value.baseUrl}/install.sh | DEVICE_MCP_TOKEN='<device token>' bash` : ''))
  const claudeCodeCommand = computed(() =>
    info.value
      ? ['claude mcp add \\', '  --transport http \\', '  --scope user \\', '  device-mcp \\', `  ${info.value.mcpUrl} \\`, '  --header "Authorization: Bearer $MCP_TOKEN"'].join('\n')
      : '',
  )
  return { info, error, claudeCodeCommand, installTemplate }
}
