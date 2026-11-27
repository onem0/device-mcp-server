<script setup lang="ts">
import { LogOut } from '@lucide/vue'

const route = useRoute()
const busy = ref(false)

async function logout() {
  busy.value = true
  try {
    await api('/auth/logout', { method: 'POST' })
  } finally {
    useState<boolean | null>('auth').value = false
    busy.value = false
    await navigateTo('/login')
  }
}
</script>

<template>
  <div class="shell">
    <header v-if="route.path !== '/login'" class="top">
      <NuxtLink to="/" class="top__mark" aria-label="device-mcp, go to the device overview"><LabelTape tone="black" small>device-mcp</LabelTape></NuxtLink>
      <nav class="top__nav" aria-label="Main navigation">
        <NuxtLink to="/" :class="{ 'is-on': route.path === '/' || route.path.startsWith('/devices') }">Devices</NuxtLink>
        <NuxtLink to="/memory" active-class="is-on">Memory</NuxtLink>
        <NuxtLink to="/audit" active-class="is-on">Audit log</NuxtLink>
        <NuxtLink to="/connect" active-class="is-on">Connection</NuxtLink>
      </nav>
      <button type="button" class="action top__logout" :disabled="busy" @click="logout"><LogOut :size="16" aria-hidden="true" />Log out</button>
    </header>
    <main class="shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}
.top {
  display: flex;
  align-items: center;
  gap: 2.25rem;
  height: 4.5rem;
  padding: 0 max(1rem, calc((100vw - 84rem) / 2 + 3rem));
  border-bottom: 1px solid var(--line);
}
.top__mark {
  display: inline-flex;
  border-radius: 4px;
  text-decoration: none;
}
.top__nav {
  display: flex;
  gap: 1.75rem;
  height: 100%;
}
.top__nav a {
  display: inline-flex;
  align-items: center;
  color: var(--mute);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: inset 0 -2px 0 transparent;
}
.top__nav a:hover {
  color: var(--ink);
}
.top__nav a.is-on {
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--ink);
}
.top__logout {
  margin-left: auto;
}
.shell__main {
  padding: 2.5rem max(1rem, calc((100vw - 84rem) / 2 + 3rem)) 4rem;
}
@media (max-width: 720px) {
  .top {
    gap: 1rem;
    height: auto;
    min-height: 4rem;
    flex-wrap: wrap;
    padding-block: 0.75rem;
  }
  .top__nav {
    order: 3;
    flex-basis: 100%;
    gap: 1.25rem;
    height: 2.25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .shell__main {
    padding-top: 1.5rem;
  }
}
</style>
