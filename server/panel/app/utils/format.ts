import type { Device } from './types'


// Zeitangaben auf Englisch: "3 days ago", "connected for 3 days".

const units = [
  { ms: 86_400_000, one: 'day', many: 'days' },
  { ms: 3_600_000, one: 'hour', many: 'hours' },
  { ms: 60_000, one: 'minute', many: 'minutes' },
] as const

export function span(ms: number) {
  for (const unit of units) {
    if (ms >= unit.ms) {
      const n = Math.floor(ms / unit.ms)
      return `${n} ${n === 1 ? unit.one : unit.many}`
    }
  }
  return 'a few seconds'
}

// Dauer seit einem Zeitpunkt, z. B. "3 days" (für "connected for 3 days").
export const since = (iso: string, now: number) => span(Math.max(0, now - Date.parse(iso)))

export function ago(iso: string | null, now: number) {
  if (!iso) return 'never'
  const ms = Math.max(0, now - Date.parse(iso))
  if (ms < 45_000) return 'just now'
  return `${span(ms)} ago`
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const dateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
export const day = (iso: string) => dayFormat.format(new Date(iso))
export const clock = (iso: string) => timeFormat.format(new Date(iso))

export function duration(ms: number | null) {
  if (ms == null) return '–'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toLocaleString('en-US', { maximumFractionDigits: 1 })} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${Math.round(s % 60)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export const systemLine = (d: Device) => [d.os, d.arch].filter(Boolean).join(' · ')
