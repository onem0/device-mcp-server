// Gemeinsame Uhr für relative Zeitangaben ("vor 3 Minuten"), tickt alle 15 s.
export function useNow(intervalMs = 15_000) {
  const now = useState('now', () => Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), intervalMs)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
