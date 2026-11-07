import type { Device } from './types'


// Zeitangaben auf Deutsch. "Seit" braucht den Dativ: seit 3 Tagen, seit 1 Tag.

const units = [
  { ms: 86_400_000, one: 'Tag', many: 'Tagen' },
  { ms: 3_600_000, one: 'Stunde', many: 'Stunden' },
  { ms: 60_000, one: 'Minute', many: 'Minuten' },
] as const

export function span(ms: number) {
  for (const unit of units) {
    if (ms >= unit.ms) {
      const n = Math.floor(ms / unit.ms)
      return `${n} ${n === 1 ? unit.one : unit.many}`
    }
  }
  return 'wenigen Sekunden'
}

export const since = (iso: string, now: number) => `seit ${span(Math.max(0, now - Date.parse(iso)))}`

export function ago(iso: string | null, now: number) {
  if (!iso) return 'noch nie'
  const ms = Math.max(0, now - Date.parse(iso))
  if (ms < 45_000) return 'gerade eben'
  return `vor ${span(ms)}`
}

const dateTimeFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const dateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
export const day = (iso: string) => dayFormat.format(new Date(iso))
export const clock = (iso: string) => timeFormat.format(new Date(iso))

export function duration(ms: number | null) {
  if (ms == null) return '–'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${Math.round(s % 60)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export const systemLine = (d: Device) => [d.os, d.arch].filter(Boolean).join(' · ')
