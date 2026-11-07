<script setup lang="ts">
import type { AuditEntry } from '~/utils/types'

defineProps<{ entries: AuditEntry[]; showDevice?: boolean }>()
const expanded = ref(new Set<string>())

const TOOLS: Record<string, string> = {
  list_devices: 'Devices',
  run_command: 'Command',
  job_status: 'Job status',
  job_output: 'Job output',
  job_wait: 'Wait',
  kill_job: 'Kill',
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  session_start: 'Session',
  session_send: 'Input',
  session_read: 'Screen',
  session_list: 'Sessions',
  session_kill: 'Session end',
}

// Argumente ohne das Gerät, das steht schon in der Zeile.
const detailArgs = (e: AuditEntry) => Object.entries(e.args ?? {}).filter(([k]) => k !== 'device')
const formatArg = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function result(e: AuditEntry) {
  switch (e.status) {
    case 'running':
      return { text: 'running', tone: 'run' }
    case 'exited':
      return { text: `exit ${e.exitCode}`, tone: e.exitCode === 0 ? 'ok' : 'err' }
    case 'ok':
      return { text: 'ok', tone: 'ok' }
    case 'error':
      return { text: 'Error', tone: 'err' }
    case 'killed':
      return { text: 'killed', tone: 'mute' }
    case 'timeout':
      return { text: 'Timeout', tone: 'err' }
    case 'failed':
      return { text: 'failed', tone: 'err' }
    case 'lost':
      return { text: 'lost', tone: 'mute' }
    default:
      return { text: e.status, tone: 'mute' }
  }
}

const isLong = (e: AuditEntry) => e.command.length > 160 || e.command.includes('\n') || detailArgs(e).length > 0

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
</script>

<template>
  <table class="audit">
    <thead>
      <tr>
        <th scope="col">Time</th>
        <th v-if="showDevice" scope="col">Device</th>
        <th scope="col">Tool</th>
        <th scope="col">Command</th>
        <th scope="col">Result</th>
        <th scope="col" class="num">Duration</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="e in entries" :key="e.id">
        <td class="audit__time mono"><time :datetime="e.createdAt" :title="dateTime(e.createdAt)">{{ day(e.createdAt) }} <span>{{ clock(e.createdAt) }}</span></time></td>
        <td v-if="showDevice" class="audit__device" :class="{ 'is-empty': !e.deviceId }">
          <NuxtLink v-if="e.deviceId && e.deviceName" :to="`/devices/${e.deviceId}`" class="audit__tape"><LabelTape small>{{ e.deviceName }}</LabelTape></NuxtLink>
          <span v-else class="muted">–</span>
        </td>
        <td class="audit__tool" :title="e.tool">{{ TOOLS[e.tool] ?? e.tool }}</td>
        <td class="audit__cmd">
          <code :class="{ 'is-clamped': isLong(e) && !expanded.has(e.id) }">{{ e.command }}</code>
          <button v-if="isLong(e)" type="button" class="audit__more" :aria-expanded="expanded.has(e.id)" @click="toggle(e.id)">
            {{ expanded.has(e.id) ? 'Less' : 'Details' }}
          </button>
          <dl v-if="expanded.has(e.id) && detailArgs(e).length" class="audit__args">
            <template v-for="[key, value] in detailArgs(e)" :key="key">
              <dt>{{ key }}</dt>
              <dd class="mono">{{ formatArg(value) }}</dd>
            </template>
          </dl>
          <p v-if="e.error" class="audit__err">{{ e.error }}</p>
          <p v-if="e.jobId" class="audit__job mono muted">job {{ e.jobId }}</p>
        </td>
        <td class="audit__res"><span :class="`res res--${result(e).tone}`">{{ result(e).text }}</span></td>
        <td class="num mono">{{ duration(e.durationMs) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.audit {
  width: 100%;
  border-collapse: collapse;
}
th {
  padding: 0.65rem 1rem 0.65rem 0;
  border-bottom: 1px solid var(--line-strong);
  color: var(--mute);
  font-size: var(--fs-s);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-align: left;
  text-transform: uppercase;
}
td {
  padding: 0.8rem 1rem 0.8rem 0;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
.num {
  text-align: right;
  padding-right: 0;
  white-space: nowrap;
}
.audit__time {
  white-space: nowrap;
  color: var(--mute);
}
.audit__time span {
  color: var(--ink);
}
.audit__tool {
  font-weight: 700;
  white-space: nowrap;
}
.audit__cmd {
  width: 100%;
  min-width: 0;
}
.audit__cmd code {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
.audit__cmd code.is-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.audit__more {
  margin-top: 0.25rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: 600 var(--fs-s) / 1.4 var(--sans);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.audit__device {
  white-space: nowrap;
}
.audit__tape {
  display: inline-flex;
  border-radius: 4px;
  text-decoration: none;
}
.audit__args {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.2rem 0.75rem;
  margin: 0.5rem 0 0;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: var(--ground);
}
.audit__args dt {
  color: var(--mute);
  font-size: var(--fs-s);
  font-weight: 700;
}
.audit__args dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.audit__err {
  margin-top: 0.3rem;
  color: var(--err);
  font-size: var(--fs-s);
  font-weight: 600;
}
.audit__job {
  margin-top: 0.2rem;
  font-size: 0.75rem;
}
.res {
  font-weight: 700;
  white-space: nowrap;
}
.res--ok {
  color: var(--ink);
}
.res--err {
  color: var(--err);
}
.res--run,
.res--mute {
  color: var(--mute);
}

@media (max-width: 720px) {
  thead {
    display: none;
  }
  tr {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.3rem 1rem;
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 0;
    border: 0;
  }
  .audit__time {
    grid-area: 1 / 1;
  }
  .audit__tool {
    grid-area: 1 / 2;
    text-align: right;
  }
  .audit__device {
    grid-area: 2 / 1 / 3 / 3;
  }
  .audit__device.is-empty {
    display: none;
  }
  .audit__cmd {
    grid-area: 3 / 1 / 4 / 3;
  }
  .audit__res {
    grid-area: 4 / 1;
  }
  .num {
    grid-area: 4 / 2;
  }
}
</style>
