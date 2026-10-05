import { describe, expect, mock, test } from 'claude-code/testing'

const REPORT = 'mcp__clean-view__report_progress'
const PLAN = 'mcp__clean-view__plan_steps'
const PANE = {
  component: 'Pane' as const,
  requestId: 'agent-dock',
  props: { title: 'Agent Dock', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30, totalRows: 0 } } as never,
}

type Setup = {
  limit?: string
  onSleep?: () => void
  store?: Record<string, unknown>; submitted?: string[]; panes?: { id: string }[]; statuses?: (string | undefined)[] }

async function setup($: any, on: any, options: Setup = {}) {
  mock.store(on, options.store)
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/tmp/home', CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: options.limit ?? '100', CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY: options.limit ?? '100' })
  on('session.start', (_$: any, e: any) => ({ ...e, cwd: '/tmp' }) as never)
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  on('classic.SubagentStop', () => ({}) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: {} } }) as never)
  on('session.id', () => ({ value: 'sess1' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  on('process.run', () => {
    options.onSleep?.()
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('ui.toast', () => ({}) as never)
  on('ui.status', (_$: any, e: any) => {
    options.statuses?.push(e.text)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: options.panes ?? [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }) as never)
  on('session.append', (_$: any, e: any) => ({ message: e.message, uuid: e.uuid }) as never)
  on('prompt.submit', (_$: any, e: any) => {
    options.submitted?.push(e.text)
    return { text: e.text, context: e.context } as never
  })
  let n = 0
  on('tool.call', (_$: any, e: any) => {
    n += 1
    return { result: e.tool === 'Agent' ? { agentId: `ag${n}` } : 'ok', text: 'ok' } as never
  })
  await $.session.start({ cwd: '/tmp' } as never)
  return clock
}

const agentCall = (i: number) => ({ tool: 'Agent', tool_use_id: `u${i}`, description: `Price check: Store ${i}`, prompt: 'go' }) as never
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string).join('|')

async function submit($: any, text: string) {
  return $.prompt.submit({ text, wait: false, origin: { kind: 'user' } } as never)
}

describe('team size', () => {
  test('a saved size of 50 resets to 1 in a new session; 10 stays', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 50 } })
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...PANE })
    expect(await texts(ui)).toContain('Claude decides how many helpers')
  })

  test('a saved size of 10 stays 10', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 10 } })
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...PANE })
    expect(await texts(ui)).toContain('Splits each request across 10 helpers')
  })

  test('a request carries the exactly-N instruction only above size 1', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 5 } })
    const sent = await submit($, 'Research bakery pricing')
    expect((sent.context ?? []).join('\n')).toContain('exactly 5')

    const { $: $2 } = { $ }
    await $2.command.run({ command: 'dock', args: '1' } as never)
    await new Promise(r => setTimeout(r, 20))
    const sent1 = await submit($, 'Research bakery pricing')
    expect((sent1.context ?? []).join('\n')).not.toContain('exactly')
  })
})

describe('helpers', () => {
  test('the 6th Agent call at size 5 is denied', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 5 } })
    await submit($, 'Research bakery pricing')
    await $.tool.call({ tool: PLAN, steps: ['Look', 'Report'] } as never)
    for (let i = 1; i <= 5; i += 1) {
      const ok = await $.tool.call(agentCall(i))
      expect(ok.deny).toBeUndefined()
    }
    const sixth = await $.tool.call(agentCall(6))
    expect(sixth.deny).toBe('Team Size is 5: this request already has 5 helpers. Finish with the helpers you have.')
  })

  test('a request that used 3 of 10 gets exactly one nudge', async ($, on) => {
    const submitted: string[] = []
    await setup($, on, { store: { 'dock.size': 10 }, submitted })
    await submit($, 'Research bakery pricing')
    await $.tool.call({ tool: PLAN, steps: ['Look', 'Report'] } as never)
    for (let i = 1; i <= 3; i += 1) await $.tool.call(agentCall(i))
    const done = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never
    await $.turn.complete(done)
    await $.turn.complete(done)
    const nudges = submitted.filter(t => t.startsWith('You used 3 of 10'))
    expect(nudges).toHaveLength(1)
  })

  test('cards go queued, working, done and show helper progress', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 3 } })
    await submit($, 'Research bakery pricing')
    await $.tool.call({ tool: PLAN, steps: ['Look', 'Report'] } as never)
    const ids = [1, 2, 3]
    for (const i of ids) {
      await $.session.append({ message: { type: 'assistant', content: [{ type: 'tool_use', id: `u${i}`, name: 'Agent', input: { description: `Price check: Store ${i}` } }] } } as never).catch(() => undefined)
    }
    for (const i of ids) await $.tool.call(agentCall(i))
    const reported = await $.tool.call({ tool: REPORT, agentId: 'ag1', task: 'Price check: Store 1', percent: 60 } as never)
    expect(reported.result).toBe('Progress noted: 60%.')

    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...PANE })
    let all = await texts(ui)
    expect(all).toContain('3 working')
    expect(all).toContain('60%')

    for (const i of ids) await $.classic.SubagentStop({ agent_id: `ag${i}` } as never)
    await ui.redraw()
    all = await texts(ui)
    expect(all).toMatch(/3 agents finished Research bakery pricing in/)
  })

  test('a helper that calls plan_steps is told to skip it', async ($, on) => {
    await setup($, on, { store: { 'dock.size': 3 } })
    const r = await $.tool.call({ tool: PLAN, agentId: 'ag9', steps: ['x'] } as never)
    expect(r.result).toBe('Helpers skip the plan. Just call report_progress as you work.')
  })
})

describe('commands', () => {
  test('/dock answers at once and a bad number gets the help text', async ($, on) => {
    await setup($, on)
    const bad = await $.command.run({ command: 'dock', args: 'abc' } as never)
    expect(bad.text).toBe('Team Size is a whole number from 1 to 100, e.g. /dock 10.')
    const big = await $.command.run({ command: 'dock', args: '50' } as never)
    expect(big.text).toBe('Confirm the team of 50 in the Agent Dock.')
  })

  test('/dock folds to the badge and back', async ($, on) => {
    const statuses: (string | undefined)[] = []
    await setup($, on, { panes: [{ id: 'agent-dock' }], statuses })
    const r = await $.command.run({ command: 'dock', args: '' } as never)
    expect(r.text).toBe('Agent Dock toggled.')
    await new Promise(res => setTimeout(res, 50))
    expect(statuses.some(s => typeof s === 'string')).toBe(true)
  })
})

describe('big teams and the queue', () => {
  test('a team of 50 needs a confirmation, then 50 cards fit as tiles', async ($, on) => {
    await setup($, on)
    await $.command.run({ command: 'dock', args: '50' } as never)
    await new Promise(r => setTimeout(r, 30))
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...PANE })
    expect(await texts(ui)).toContain('Big team: this uses your plan quickly. Continue?')
    await ui.press({ key: 'confirm-big' })
    expect(await texts(ui)).toContain('Splits each request across 50 helpers')
    await submit($, 'Research bakery pricing')
    await $.tool.call({ tool: PLAN, steps: ['Look', 'Report'] } as never)
    for (let i = 1; i <= 50; i += 1) await $.tool.call(agentCall(i))
    await ui.redraw()
    const all = await texts(ui)
    expect(all).toContain('50 working')
    expect((all.match(/ P\d /g) ?? []).length).toBe(50)
    expect((await $.tool.call(agentCall(51))).deny).toBeDefined()
  })

  test('extra helpers wait for a free slot instead of failing', async ($, on) => {
    let freed = false
    await setup($, on, {
      store: { 'dock.size': 3 },
      limit: '2',
      onSleep: () => {
        if (freed) return
        freed = true
        void $.classic.SubagentStop({ agent_id: 'ag1' } as never)
      },
    })
    await submit($, 'Research bakery pricing')
    await $.tool.call({ tool: PLAN, steps: ['Look', 'Report'] } as never)
    const results = await Promise.all([1, 2, 3].map(i => $.tool.call(agentCall(i))))
    expect(results.every(r => r.deny === undefined)).toBe(true)
    expect(freed).toBe(true)
  })
})
