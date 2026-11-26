// Checks the session once per page load, after that the state decides.
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
