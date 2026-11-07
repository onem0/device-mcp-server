<script setup lang="ts">
useHead({ title: 'Log in' })

const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await api('/auth/login', { method: 'POST', body: { password: password.value } })
    useState<boolean | null>('auth').value = true
    await navigateTo('/')
  } catch (err) {
    error.value = failureText(err)
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="card login__card" @submit.prevent="submit">
      <LabelTape tone="black">device-mcp</LabelTape>
      <h1 class="sheet__title">Log in</h1>
      <div class="field">
        <label for="password">Panel password</label>
        <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required autofocus :aria-invalid="!!error" />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <button type="submit" class="btn" :disabled="busy">{{ busy ? 'Checking …' : 'Log in' }}</button>
      <p class="hint">The password is <code>PANEL_PASSWORD</code> in the server's .env.</p>
    </form>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 6.5rem);
}
.login__card {
  display: grid;
  justify-items: stretch;
  gap: 1.25rem;
  width: min(24rem, 100%);
  padding: 2rem;
  background: var(--raised);
}
.login__card > .tape {
  justify-self: start;
}
</style>
