<script setup lang="ts">
import { Pencil, Pin, PinOff, Trash2 } from '@lucide/vue'
import type { Memory } from '~/utils/types'

const props = defineProps<{ memory: Memory; busy?: boolean }>()
const emit = defineEmits<{ edit: []; pin: []; remove: [] }>()
const now = useNow()

const expanded = ref(false)
const long = computed(() => props.memory.content.length > 280 || props.memory.content.split('\n').length > 4)
const author = computed(() => (props.memory.source === 'panel' ? 'by you' : 'by Claude'))
</script>

<template>
  <article class="note" :aria-labelledby="`note-${memory.id}`">
    <div class="note__head">
      <h3 :id="`note-${memory.id}`" class="note__title">
        <Pin v-if="memory.pinned" :size="15" class="note__pin" aria-label="Pinned" />{{ memory.title }}
      </h3>
      <div class="note__actions" role="group" :aria-label="`Actions for ${memory.title}`">
        <button type="button" class="action" title="Edit" :disabled="busy" @click="emit('edit')"><Pencil :size="16" aria-hidden="true" /><span>Edit</span></button>
        <button type="button" class="action" :title="memory.pinned ? 'Unpin' : 'Pin: Claude gets it at the start of every conversation'" :aria-pressed="memory.pinned" :disabled="busy" @click="emit('pin')">
          <PinOff v-if="memory.pinned" :size="16" aria-hidden="true" /><Pin v-else :size="16" aria-hidden="true" /><span>{{ memory.pinned ? 'Unpin' : 'Pin' }}</span>
        </button>
        <button type="button" class="action action--danger" title="Delete" :disabled="busy" @click="emit('remove')"><Trash2 :size="16" aria-hidden="true" /><span>Delete</span></button>
      </div>
    </div>
    <p v-if="memory.path" class="mono note__path">{{ memory.path }}</p>
    <p v-if="memory.content" class="note__text" :class="{ 'note__text--clamped': long && !expanded }">{{ memory.content }}</p>
    <button v-if="long" type="button" class="note__more" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? 'Show less' : 'Show all' }}</button>
    <p class="note__meta">
      <span v-if="memory.tags.length" class="mono note__tags">{{ memory.tags.map((t) => `#${t}`).join(' ') }}</span>
      <span>Saved {{ author }} · {{ ago(memory.updatedAt, now) }}</span>
      <span v-if="memory.useCount">Found {{ memory.useCount }}× · last {{ ago(memory.lastUsedAt, now) }}</span>
    </p>
  </article>
</template>

<style scoped>
.note {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 0;
}
.note + .note {
  border-top: 1px solid var(--line);
}
.note__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 1rem;
}
.note__title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--fs-m);
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.note__pin {
  flex: none;
}
.note__actions {
  display: flex;
  gap: 0.15rem;
  margin-right: -0.6rem;
}
.note__path {
  color: var(--ink);
  overflow-wrap: anywhere;
}
.note__text {
  max-width: 75ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.note__text--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.note__more {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: 600 var(--fs-s) / 1.5 var(--sans);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  cursor: pointer;
}
.note__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  color: var(--mute);
  font-size: var(--fs-s);
}
.note__tags {
  color: var(--mute);
}
@media (max-width: 720px) {
  .note__actions {
    margin-right: 0;
    margin-left: -0.6rem;
  }
  .note__actions .action {
    min-width: 2.5rem;
    min-height: 2.5rem;
    justify-content: center;
  }
  .note__actions .action span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}
</style>
