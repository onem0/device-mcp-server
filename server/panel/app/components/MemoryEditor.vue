<script setup lang="ts">
import type { Device, Memory, MemoryDraft } from '~/utils/types'

// Form for a new note or for changing one in place. Tags are typed as one line, separated by commas.
const props = defineProps<{ memory?: Memory | null; devices: Device[]; scope?: string | null; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ save: [draft: MemoryDraft]; cancel: [] }>()

const uid = useId()
const title = ref(props.memory?.title ?? '')
const content = ref(props.memory?.content ?? '')
const path = ref(props.memory?.path ?? '')
const tags = ref(props.memory?.tags.join(', ') ?? '')
const pinned = ref(props.memory?.pinned ?? false)
const deviceId = ref<string>(props.memory ? (props.memory.deviceId ?? '') : (props.scope ?? ''))
const titleInput = ref<HTMLInputElement | null>(null)

onMounted(() => titleInput.value?.focus())

function submit() {
  emit('save', {
    deviceId: deviceId.value || null,
    title: title.value.trim(),
    content: content.value,
    path: path.value.trim() || null,
    tags: tags.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    pinned: pinned.value,
  })
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <form class="editor" @submit.prevent="submit" @keydown="onKey">
    <div class="editor__row">
      <div class="field editor__title">
        <label :for="`${uid}-title`">Title</label>
        <input :id="`${uid}-title`" ref="titleInput" v-model="title" class="input" maxlength="200" required placeholder="e.g. Nginx config of the blog" autocomplete="off" />
      </div>
      <div class="field editor__scope">
        <label :for="`${uid}-scope`">About</label>
        <select :id="`${uid}-scope`" v-model="deviceId" class="input">
          <option value="">All devices (global)</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label :for="`${uid}-path`">Path <span class="muted editor__optional">optional</span></label>
      <input :id="`${uid}-path`" v-model="path" class="input mono editor__mono" maxlength="4096" placeholder="/etc/nginx/sites-enabled/blog" autocomplete="off" spellcheck="false" />
    </div>
    <div class="field">
      <label :for="`${uid}-content`">Note</label>
      <textarea :id="`${uid}-content`" v-model="content" class="input editor__text" rows="5" maxlength="20000" placeholder="What Claude should know next time: where it is, how it runs, what to watch out for." />
      <p class="hint">No passwords or tokens: write down where they are kept instead.</p>
    </div>
    <div class="editor__row">
      <div class="field editor__tags">
        <label :for="`${uid}-tags`">Tags <span class="muted editor__optional">optional, separated by commas</span></label>
        <input :id="`${uid}-tags`" v-model="tags" class="input mono editor__mono" placeholder="nginx, web" autocomplete="off" spellcheck="false" />
      </div>
      <label class="editor__pin">
        <input v-model="pinned" type="checkbox" />
        <span class="editor__pin-text"><strong>Pinned</strong><span class="hint">Claude gets it at the start of every conversation.</span></span>
      </label>
    </div>
    <p v-if="error" class="banner" role="alert">{{ error }}</p>
    <div class="editor__actions">
      <button type="button" class="btn btn--quiet" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn" :disabled="busy || !title.trim()">{{ busy ? 'Saving …' : memory ? 'Save' : 'Save note' }}</button>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: grid;
  gap: 1rem;
}
.editor__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 16rem);
  align-items: end;
  gap: 1rem;
}
.editor__optional {
  font-weight: 400;
}
.editor__mono {
  font-family: var(--mono);
  font-size: var(--fs-s);
}
.editor__text {
  min-height: 7.5rem;
  padding-block: 0.7rem;
  line-height: 1.5;
  resize: vertical;
}
.editor__pin {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  min-height: 2.75rem;
  padding-top: 0.35rem;
  cursor: pointer;
}
.editor__pin-text {
  display: grid;
  gap: 0.1rem;
}
.editor__pin input {
  width: 1.05rem;
  height: 1.05rem;
  margin: 0.2rem 0 0;
  flex: none;
}
.editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}
@media (max-width: 720px) {
  .editor__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
