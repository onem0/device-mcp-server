<script setup lang="ts">
import { Check, Copy, Loader } from '@lucide/vue'
import type { Device, DeviceWithToken } from '~/utils/types'

// Der Geräte-Token ist nur in diesem Dialog greifbar und nie wieder. Er läuft als gelbes Band aus dem Dialog,
// beim Schließen wird das Band abgeschnitten. Zu sehen ist er nicht: Band und Befehl zeigen ihn verdeckt,
// die Kopieren-Buttons liefern den echten Wert.
const props = defineProps<{ secret: { payload: DeviceWithToken; mode: 'create' | 'regenerate' } | null }>()
const emit = defineEmits<{ close: [] }>()

const copied = ref(false)
const warned = ref(false)
const cutting = ref(false)
const live = ref<Device | null>(null)
const tokenCopied = ref(false)

async function copyToken() {
  if (!props.secret || !(await copyText(props.secret.payload.token))) return
  copied.value = true
  tokenCopied.value = true
  setTimeout(() => (tokenCopied.value = false), 2000)
}
let poll: ReturnType<typeof setInterval> | undefined

// Feste Länge, damit das Band nichts über den Token verrät.
const MASK = '•'.repeat(24)
const maskedToken = computed(() => `${props.secret?.payload.token.match(/^[a-z]+_/)?.[0] ?? ''}${MASK}`)
const maskedCommand = computed(() => {
  const payload = props.secret?.payload
  return payload ? payload.installCommand.replace(payload.token, maskedToken.value) : ''
})

const device = computed(() => live.value ?? props.secret?.payload.device ?? null)
const connected = computed(() => !!device.value?.online)

watch(
  () => props.secret,
  (secret) => {
    clearInterval(poll)
    copied.value = false
    tokenCopied.value = false
    warned.value = false
    cutting.value = false
    live.value = null
    if (!secret) return
    // Live mitverfolgen, bis der Daemon sich meldet.
    poll = setInterval(async () => {
      try {
        live.value = await api<Device>(`/devices/${secret.payload.device.id}`)
        if (live.value.online) clearInterval(poll)
      } catch {
        // nächster Versuch
      }
    }, 2000)
  },
)

onBeforeUnmount(() => clearInterval(poll))

// Schließen ohne Kopieren verliert den Token. Einmal warnen, dann gehen lassen.
const canClose = () => {
  if (copied.value || connected.value || warned.value) return true
  warned.value = true
  return false
}

function close() {
  if (!canClose()) return
  clearInterval(poll)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return emit('close')
  cutting.value = true
  setTimeout(() => emit('close'), 260)
}
</script>

<template>
  <SheetDialog v-if="secret" class="sheet--tape" :open="secret !== null" :label="`Token for ${secret.payload.device.name}`" :guard="() => (close(), false)" @close="close">
    <div class="token" :class="{ 'is-cut': cutting }">
      <div class="token__exit">
        <div class="token__tape">
          <code class="token__value" aria-label="Device token, hidden">{{ maskedToken }}</code>
        </div>
        <div class="token__slot" aria-hidden="true" />
      </div>
      <div class="token__under">
        <span class="token__hint">Device token. Hidden, and only available now.</span>
        <button type="button" class="token__copy" :class="{ 'is-done': tokenCopied }" aria-label="Copy device token" @click="copyToken">
          <Check v-if="tokenCopied" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          <span>{{ tokenCopied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    </div>

    <div class="sheet__body token__body">
      <div class="token__head">
        <LabelTape small>{{ secret.payload.device.name }}</LabelTape>
        <h2 class="sheet__title">{{ secret.mode === 'create' ? 'Device added' : 'New token created' }}</h2>
      </div>

      <p v-if="secret.mode === 'regenerate'" class="hint">The old token no longer works and the connection was closed. Run the command on the device again; it only updates the config.</p>

      <CopyField label="Run on the device (as a normal user)" :value="secret.payload.installCommand" :display="maskedCommand" @copied="copied = true" />
      <p class="hint">
        Copy puts the full command with the real token on your clipboard; the token itself is never shown.
        <template v-if="secret.mode === 'create'">It works on Linux with systemd and on macOS: the script fetches the daemon from this server, connects it here and sets it up as a service that keeps itself up to date.</template>
      </p>

      <div class="token__live" :class="{ 'is-on': connected }" role="status" aria-live="polite">
        <template v-if="connected && device">
          <Check :size="18" aria-hidden="true" />
          <span><strong>Connected.</strong> {{ [device.os, device.arch].filter(Boolean).join(', ') }}<template v-if="device.username"> · {{ device.username }}@{{ device.hostname }}</template></span>
        </template>
        <template v-else>
          <Loader :size="18" class="spin" aria-hidden="true" />
          <span>Waiting for the daemon's first connection …</span>
        </template>
      </div>

      <p v-if="warned && !copied && !connected" class="banner" role="alert">You copied neither the command nor the token. Once you close this, the token is gone and you need to create a new one.</p>

      <div class="sheet__actions">
        <button type="button" class="btn" @click="close">{{ warned && !copied && !connected ? 'Close anyway' : 'Done' }}</button>
      </div>
    </div>
  </SheetDialog>
</template>

<style scoped>
/* Das Band steht ganz über der Dialogkante und steckt nur unten im Schlitz. */
.token {
  padding: 0 1.75rem;
}
.token__exit {
  position: relative;
  height: 0;
}
.token__tape {
  position: absolute;
  bottom: 0;
  left: 0.5rem;
  right: 0.5rem;
  padding: 0.65rem 1rem 0.8rem;
  border-radius: 1px;
  background: var(--tape-yellow);
  box-shadow:
    0 1px 1.5px rgba(21, 21, 21, 0.25),
    0 6px 14px rgba(21, 21, 21, 0.12);
}
.token__slot {
  position: absolute;
  top: -5px;
  left: -0.65rem;
  right: -0.65rem;
  height: 10px;
  border-radius: 5px;
  background: var(--tape-black);
  box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.6);
}
.token__value {
  display: block;
  font-size: var(--fs-s);
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
  user-select: none;
}
.token__under {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.1rem 0 1.25rem;
  border-bottom: 1px solid var(--line);
}
.token__hint {
  color: var(--mute);
  font-size: var(--fs-s);
  font-weight: 600;
}
.token__copy {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
  min-height: 2.25rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink);
  font: 700 var(--fs-s) / 1 var(--sans);
  cursor: pointer;
}
.token__copy:hover {
  background: rgba(21, 21, 21, 0.05);
}
.token__copy.is-done {
  background: var(--ink);
  box-shadow: none;
  color: var(--tape-white);
}
.token__body {
  padding-top: 1.5rem;
}
.token__head {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
}
.token__live {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  background: var(--ground);
  color: var(--mute);
}
.token__live.is-on {
  background: #e3f1e8;
  color: #155f35;
}
.spin {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 480px) {
  .token {
    padding: 0 1.25rem;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* Einmal der Länge nach gedruckt, wie aus dem Etikettendrucker. Ohne Animation ist es einfach da. */
  .token__tape {
    animation: feed 700ms linear both;
  }
  .is-cut .token__tape {
    animation: cut 260ms cubic-bezier(0.5, 0, 0.75, 0) forwards;
  }
}
/* Aus dem Schlitz nach oben ausgeworfen: Verschiebung und Beschnitt laufen gleich, die Unterkante bleibt am Schlitz. */
@keyframes feed {
  from {
    transform: translateY(100%);
    clip-path: inset(0 -20px 100% -20px);
  }
  to {
    transform: none;
    clip-path: inset(-20px -20px -20px -20px);
  }
}
@keyframes cut {
  to {
    transform: translateY(-18px) rotate(-2deg);
    opacity: 0;
  }
}
</style>
