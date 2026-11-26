// Calls fn regularly while the page is visible. Once immediately on returning to the tab.
export function usePolling(fn: () => Promise<unknown> | unknown, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | undefined
  const tick = () => {
    if (document.visibilityState === 'visible') void fn()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void fn()
  }
  onMounted(() => {
    timer = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })
}
