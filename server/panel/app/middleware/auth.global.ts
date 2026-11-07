// Prüft die Sitzung einmal pro Seitenaufruf, danach entscheidet der Zustand.
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useState<boolean | null>('auth', () => null)
  if (auth.value === null) {
    try {
      auth.value = (await $fetch<{ authenticated: boolean }>('/v1/auth/session')).authenticated
    } catch {
      auth.value = false
    }
  }
  if (!auth.value && to.path !== '/login') return navigateTo('/login')
  if (auth.value && to.path === '/login') return navigateTo('/')
})
