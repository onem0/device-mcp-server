// Shared clock for relative times ("3 minutes ago"), ticks every 15 s.
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
