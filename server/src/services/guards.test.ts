import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { WRITE_TOOLS, compareVersions, daemonTooOld, daemonUpdateState, sanitizeArgs, tooOldMessage } from './guards.js'

describe('daemon version', () => {
  test('compares numerically, not as text', () => {
    assert.equal(compareVersions('0.2.0', '0.2.0'), 0)
    assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
    assert.equal(compareVersions('0.1.0', '0.2.0'), -1)
    assert.equal(compareVersions('1.0', '1.0.0'), 0)
  })

  test('too old when lower or unknown', () => {
    assert.equal(daemonTooOld('0.1.0', '0.2.0'), true)
    assert.equal(daemonTooOld(null, '0.2.0'), true)
    assert.equal(daemonTooOld('0.2.0', '0.2.0'), false)
    assert.equal(daemonTooOld('0.3.1', '0.2.0'), false)
  })

  test('message names versions, tool and update command', () => {
    const msg = tooOldMessage('pi', '0.1.0', '0.2.0', 'edit_file', 'https://device.onemo.dev')
    assert.match(msg, /^Daemon version too old/)
    assert.match(msg, /0\.1\.0/)
    assert.match(msg, /0\.2\.0/)
    assert.match(msg, /edit_file/)
    assert.match(msg, /curl -fsSL https:\/\/device\.onemo\.dev\/install\.sh \| bash/)
    assert.match(msg, /systemd-run/)
  })

  test('self-updating daemons are told to wait instead', () => {
    const msg = tooOldMessage('pi', '0.3.0', '0.4.0', 'new_tool', 'https://device.onemo.dev')
    assert.match(msg, /updates itself/)
    assert.doesNotMatch(msg, /systemd-run/)
  })

  test('update state: pending from 0.3.0 on, manual before, none when current or unknown', () => {
    assert.equal(daemonUpdateState('0.2.1', '0.3.0'), 'manual')
    assert.equal(daemonUpdateState('0.3.0', '0.3.1'), 'pending')
    assert.equal(daemonUpdateState('0.3.1', '0.3.1'), null)
    assert.equal(daemonUpdateState('0.4.0', '0.3.1'), null)
    assert.equal(daemonUpdateState(null, '0.3.1'), null)
    assert.equal(daemonUpdateState('0.3.0', null), null)
  })
})

describe('read-only', () => {
  test('blocks writing tools, not reading tools and not the stop tools', () => {
    for (const t of ['run_command', 'write_file', 'edit_file', 'session_start', 'session_send']) assert.ok(WRITE_TOOLS.has(t), t)
    for (const t of ['read_file', 'job_status', 'job_output', 'job_wait', 'session_read', 'session_list', 'kill_job', 'session_kill', 'list_devices'])
      assert.ok(!WRITE_TOOLS.has(t), t)
  })
})

describe('audit arguments', () => {
  test('truncates long strings and stores contents only as length', () => {
    const out = sanitizeArgs({ device: 'pi', path: '/etc/hosts', content: 'x'.repeat(5000), old_string: 'a'.repeat(300), keys: ['Enter'], replace_all: true })
    assert.equal(out.device, 'pi')
    assert.equal(out.content, '<5000 chars>')
    assert.match(String(out.old_string), /^a{200}… \(\+100 chars\)$/)
    assert.deepEqual(out.keys, ['Enter'])
    assert.equal(out.replace_all, true)
  })

  test('drops the SDK request context including headers', () => {
    const extra = { signal: {}, requestId: 1, requestInfo: { headers: { authorization: 'Bearer geheim' } }, sendNotification: () => {} }
    assert.deepEqual(sanitizeArgs(extra), {})
    assert.ok(!JSON.stringify(sanitizeArgs({ path: '/x', requestInfo: { headers: { authorization: 'Bearer geheim' } } })).includes('geheim'))
  })

  test('handles empty arguments', () => {
    assert.deepEqual(sanitizeArgs(undefined), {})
    assert.deepEqual(sanitizeArgs({}), {})
  })
})
