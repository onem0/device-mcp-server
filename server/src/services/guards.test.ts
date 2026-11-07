import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { WRITE_TOOLS, compareVersions, daemonTooOld, sanitizeArgs, tooOldMessage } from './guards.js'

describe('Daemon-Version', () => {
  test('vergleicht numerisch, nicht als Text', () => {
    assert.equal(compareVersions('0.2.0', '0.2.0'), 0)
    assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
    assert.equal(compareVersions('0.1.0', '0.2.0'), -1)
    assert.equal(compareVersions('1.0', '1.0.0'), 0)
  })

  test('zu alt, wenn kleiner oder unbekannt', () => {
    assert.equal(daemonTooOld('0.1.0', '0.2.0'), true)
    assert.equal(daemonTooOld(null, '0.2.0'), true)
    assert.equal(daemonTooOld('0.2.0', '0.2.0'), false)
    assert.equal(daemonTooOld('0.3.1', '0.2.0'), false)
  })

  test('Meldung nennt Versionen, Tool und Update-Befehl', () => {
    const msg = tooOldMessage('pi', '0.1.0', '0.2.0', 'edit_file', 'https://device.onemo.dev')
    assert.match(msg, /^Daemon-Version zu alt/)
    assert.match(msg, /0\.1\.0/)
    assert.match(msg, /0\.2\.0/)
    assert.match(msg, /edit_file/)
    assert.match(msg, /curl -fsSL https:\/\/device\.onemo\.dev\/install\.sh \| bash/)
  })
})

describe('Read-only', () => {
  test('sperrt schreibende Tools, nicht lesende und nicht die Not-Aus-Tools', () => {
    for (const t of ['run_command', 'write_file', 'edit_file', 'session_start', 'session_send']) assert.ok(WRITE_TOOLS.has(t), t)
    for (const t of ['read_file', 'job_status', 'job_output', 'job_wait', 'session_read', 'session_list', 'kill_job', 'session_kill', 'list_devices'])
      assert.ok(!WRITE_TOOLS.has(t), t)
  })
})

describe('Audit-Argumente', () => {
  test('kürzt lange Strings und speichert Inhalte nur als Länge', () => {
    const out = sanitizeArgs({ device: 'pi', path: '/etc/hosts', content: 'x'.repeat(5000), old_string: 'a'.repeat(300), keys: ['Enter'], replace_all: true })
    assert.equal(out.device, 'pi')
    assert.equal(out.content, '<5000 Zeichen>')
    assert.match(String(out.old_string), /^a{200}… \(\+100 Zeichen\)$/)
    assert.deepEqual(out.keys, ['Enter'])
    assert.equal(out.replace_all, true)
  })

  test('verwirft den Request-Kontext des SDK samt Headern', () => {
    const extra = { signal: {}, requestId: 1, requestInfo: { headers: { authorization: 'Bearer geheim' } }, sendNotification: () => {} }
    assert.deepEqual(sanitizeArgs(extra), {})
    assert.ok(!JSON.stringify(sanitizeArgs({ path: '/x', requestInfo: { headers: { authorization: 'Bearer geheim' } } })).includes('geheim'))
  })

  test('kommt mit leeren Argumenten klar', () => {
    assert.deepEqual(sanitizeArgs(undefined), {})
    assert.deepEqual(sanitizeArgs({}), {})
  })
})
