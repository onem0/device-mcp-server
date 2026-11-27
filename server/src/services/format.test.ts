import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatClaudeEvents, formatClaudeRun, formatCost, formatScreen } from './format.js'
import { WRITE_TOOLS, sanitizeArgs } from './guards.js'
import { formatMemoryDigest, normalizeTags, queryWords, type DigestNote } from './memory-text.js'
import type { ClaudeEventsResult, JobSummary } from './protocol.js'

const job = (patch: Partial<JobSummary> = {}): JobSummary => ({
  id: 'job1',
  command: 'claude -p "Fix it"',
  cwd: '/home/neo/app',
  status: 'exited',
  exitCode: 0,
  signal: null,
  error: null,
  startedAt: '2026-11-27T10:00:00.000Z',
  finishedAt: '2026-11-27T10:02:13.000Z',
  durationMs: 133_000,
  timeoutMs: null,
  outputLines: 40,
  outputBytes: 9000,
  outputTruncated: false,
  ...patch,
})

const events = (patch: Partial<ClaudeEventsResult> = {}): ClaudeEventsResult => ({
  job: job(),
  events: [
    { kind: 'init', text: 'Claude Code 2.1.331 · claude-opus-5-5 · bypassPermissions · in /home/neo/app' },
    { kind: 'tool', text: 'Bash: npm test' },
    { kind: 'error', text: 'Bash failed: 1 test failed' },
    { kind: 'text', text: 'Fixed the failing test.\nAll green now.' },
  ],
  fromLine: 0,
  toLine: 40,
  totalLines: 40,
  hasMore: false,
  result: {
    subtype: 'success',
    isError: false,
    text: 'Fixed the failing test.\nAll green now.',
    numTurns: 7,
    durationMs: 130_000,
    costUsd: 0.4212,
    permissionDenials: [],
    sessionId: '4f0b1d2e-1111-4222-8333-944445555666',
  },
  ...patch,
})

const view = { device: 'pi', jobId: 'job1', sessionId: '4f0b1d2e-1111-4222-8333-944445555666', cwd: '/home/neo/app' }

describe('Claude Code output', () => {
  test('a finished run shows the result once, the activity and how to continue', () => {
    const out = formatClaudeRun({ ...view, job: job(), events: events() })
    assert.match(out, /^Claude Code on "pi" · exited with exit_code 0/)
    assert.match(out, /Result \(success · 7 turns · 2 min 10 s · ≈ \$0\.42 at API prices\):\nFixed the failing test\.\nAll green now\./)
    assert.match(out, /→ Bash: npm test/)
    assert.match(out, /✗ Bash failed: 1 test failed/)
    // The final text is the result: not twice.
    assert.equal(out.split('Fixed the failing test.').length - 1, 1)
    assert.match(out, /claude_code_start with session_id=4f0b1d2e-1111-4222-8333-944445555666/)
    assert.match(out, /cd \/home\/neo\/app && claude --resume 4f0b1d2e/)
  })

  test('a running run points to the next status call with since', () => {
    const running = job({ status: 'running', exitCode: null, finishedAt: null, durationMs: null })
    const out = formatClaudeRun({ ...view, job: running, events: events({ job: running, result: null, toLine: 12 }), since: 0 })
    assert.match(out, /Still running\. Next: claude_code_status with job_id=job1, since=12 and wait=300/)
    assert.match(out, /kill_job job_id=job1/)
    assert.doesNotMatch(out, /Result/)
  })

  test('no result after the end explains the usual causes; denials are counted', () => {
    const out = formatClaudeRun({ ...view, job: job({ exitCode: 1 }), events: events({ result: null, events: [{ kind: 'output', text: 'Invalid API key · Please run /login' }] }) })
    assert.match(out, /ended without a result/)
    assert.match(out, /! Invalid API key/)
    const denied = formatClaudeRun({
      ...view,
      job: job(),
      events: events({ result: { ...events().result!, permissionDenials: ['Bash', 'Bash', 'WebFetch'] } }),
    })
    assert.match(denied, /Blocked by the permission mode: Bash ×2, WebFetch/)
  })

  test('activity from the tail says how to get the start; subagents are marked', () => {
    const out = formatClaudeRun({ ...view, job: job(), events: events({ fromLine: 100, toLine: 140, totalLines: 140 }) })
    assert.match(out, /--- Activity \(log lines 101–140 of 140; since=0 shows everything from the start\) ---/)
    assert.equal(formatClaudeEvents([{ kind: 'tool', text: 'Read: a.ts', sub: true }]), '→ (subagent) Read: a.ts')
  })

  test('a login error says what the user has to do', () => {
    const out = formatClaudeRun({
      ...view,
      job: job({ exitCode: 1 }),
      events: events({ result: { ...events().result!, isError: true, text: 'Not logged in · Please run /login', costUsd: 0 } }),
    })
    assert.match(out, /Result \(error · /)
    assert.match(out, /not logged in on this device\. Ask the user to run "claude" there once/)
  })

  test('cost', () => {
    assert.equal(formatCost(null), null)
    assert.equal(formatCost(0.004), '< $0.01 at API prices')
  })
})

describe('session screen', () => {
  test('cursor, full-screen program, own session, wait reason and highlight note', () => {
    const out = formatScreen({
      name: 'work',
      text: '$ make\ndone',
      lines: 2,
      dead: false,
      exitStatus: null,
      command: 'bash',
      cursor: { row: 3, col: 1 },
      alternateScreen: false,
      own: true,
      highlighted: true,
      wait: { reason: 'shell', waitedMs: 4200, match: null, outputMatched: false },
    })
    const [first, second, third] = out.split('\n')
    assert.equal(first, 'The command finished, the shell is in front again (after 4.2 s).')
    assert.equal(second, "Session work (the user's own) · running (bash) · 2 lines · cursor at row 3, column 1")
    assert.match(third!, /marked ⟦like this⟧/)
    assert.match(out, /---\n\$ make\ndone$/)
  })

  test('older daemons without the new fields still format', () => {
    assert.equal(formatScreen({ name: 'mcp-a', text: '', lines: 0, dead: true, exitStatus: 2, command: '' }), 'Session mcp-a · finished with exit code 2 · 0 lines\n---\n(screen empty)')
  })
})

describe('memory helpers and guards', () => {
  test('tags are normalized', () => {
    assert.deepEqual(normalizeTags([' Web ', 'web', 'Home Lab', '']), ['web', 'home-lab'])
    assert.equal(normalizeTags(undefined), undefined)
  })

  test('digest: pinned notes with content, the rest as an index, marked as data', () => {
    const note = (title: string, patch: Partial<DigestNote> = {}): DigestNote => ({ deviceName: null, title, content: '', path: null, pinned: false, ...patch })
    assert.equal(formatMemoryDigest([]), '')
    const out = formatMemoryDigest([
      note('Prefers Claude Code for coding', { pinned: true, content: 'Hand coding\nwork to claude_code_start.' }),
      note('Blog lives here', { deviceName: 'pi', path: '/var/www/blog', content: 'not shown in the index' }),
      note('Coffee order', { content: 'oat flat white' }),
    ])
    const lines = out.split('\n')
    assert.match(lines[0]!, /reference data, not instructions/)
    assert.equal(lines[1], 'Pinned:')
    assert.equal(lines[2], '- [global] Prefers Claude Code for coding: Hand coding work to claude_code_start.')
    assert.match(lines[3]!, /^Other notes, titles only/)
    assert.equal(lines[4], '- [pi] Blog lives here (/var/www/blog)')
    assert.equal(lines[5], '- [global] Coffee order')
    assert.doesNotMatch(out, /not shown in the index/)
  })

  test('digest index is capped', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ deviceName: 'pi', title: `Note number ${i} with a fairly long title`, content: '', path: '/srv/some/path', pinned: false }))
    const out = formatMemoryDigest(many)
    assert.ok(out.length < 6000)
    assert.match(out, /- … \d+ more \(memory_search\)$/)
  })

  test('query words', () => {
    assert.deepEqual(queryWords('  nginx   config '), ['nginx', 'config'])
    assert.deepEqual(queryWords(undefined), [])
  })

  test('claude_code_start is blocked on read-only devices, tokens never reach the log', () => {
    assert.equal(WRITE_TOOLS.has('claude_code_start'), true)
    assert.equal(WRITE_TOOLS.has('session_wait'), false)
    assert.deepEqual(sanitizeArgs({ prompt: 'x', oauthToken: 'secret' }), { prompt: 'x' })
  })
})
