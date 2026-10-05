import { describe, expect, mock, test } from 'claude-code/testing'

import { cleanName } from './clean-view'

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12, totalRows: 0 },
    view: {},
  } as never,
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)

async function startJob($: any, on: any) {
  mock.store(on)
  const clock = mock.clock(on)
  on('session.start', (_$: any, e: any) => ({ ...e, cwd: '/tmp' }) as never)
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: {} } }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('ui.toast', () => ({}) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }) as never)
  await $.session.start({ cwd: '/tmp' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  return clock
}

describe('names', () => {
  test('cleaner strips code and paths', () => {
    expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
    expect(cleanName('Fix the bug in src/app/main now please')).toBe('Fix the bug in now please')
    expect(cleanName('x'.repeat(10) + ' ' + 'word '.repeat(14)).length).toBeLessThanOrEqual(40)
    expect(cleanName('a'.repeat(80)).length).toBeLessThanOrEqual(40)
    expect(cleanName('`foo()`')).toBe('Working on it')
  })
})

describe('band', () => {
  test('checklist rows render on both surfaces', async ($, on) => {
    await startJob($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ] } as never)
    await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'clean-view', surface, ...BAND })
      const all = (await texts(ui)).join('|')
      expect(all).toMatch(/✓ /)
      expect(all).toMatch(/▶ /)
      expect(all).toMatch(/60%/)
      expect(all).toMatch(/Next/)
      expect(all).toMatch(/Up next/)
      expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a permission prompt shows Needs you', async ($, on) => {
    await startJob($, on)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...BAND })
    expect((await texts(ui)).join('|')).toMatch(/Needs you/)
  })

  test('/simple off hides the band but keeps the button', async ($, on) => {
    await startJob($, on)
    await $.command.run({ command: 'simple', args: 'off' } as never)
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...BAND })
    expect((await texts(ui)).join('|')).not.toMatch(/Build my landing page|Understand your request/)
    expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeDefined()
  })
})

describe('plan', () => {
  test('plan_steps then report_progress 100 starts step two', async ($, on) => {
    await startJob($, on)
    const planned = await $.tool.call({ tool: PLAN, steps: ['Read notes', 'Build page', 'Polish'] } as never)
    expect(planned.result).toBe('Planned 3 steps. The first one has started.')
    const reported = await $.tool.call({ tool: REPORT, task: 'Read notes', percent: 100 } as never)
    expect(reported.result).toBe('Progress noted: 100%.')
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...BAND })
    const all = (await texts(ui)).join('|')
    expect(all).toMatch(/✓ /)
    expect(all).toMatch(/▶ /)
    expect(all).toMatch(/Working/)
  })

  test('tools are denied before a plan and allowed after', async ($, on) => {
    await startJob($, on)
    const denied = await $.tool.call({ tool: 'Bash', command: 'ls', description: 'list' } as never)
    expect(denied.deny).toBeDefined()
    await $.tool.call({ tool: PLAN, steps: ['Look around', 'Report back'] } as never)
    const allowed = await $.tool.call({ tool: 'Bash', command: 'ls', description: 'list' } as never)
    expect(allowed.deny).toBeUndefined()
  })
})

describe('rows and finish', () => {
  test('tool rows are hidden while on and back when off', async ($, on) => {
    await startJob($, on)
    const row = { tool_use_id: 'u1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false }
    const hidden = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', component: 'ToolUse', props: row as never })
    expect((await hidden.find({ type: 'Box' }))?.props.display).toBe('none')
    await $.command.run({ command: 'simple', args: 'off' } as never)
    await hidden.redraw()
    expect(await hidden.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  })

  test('finishing shows All done and collapses after 5 seconds', async ($, on) => {
    const clock = await startJob($, on)
    await $.tool.call({ tool: PLAN, steps: ['Read notes', 'Build page'] } as never)
    await $.tool.call({ tool: REPORT, task: 'Read notes', percent: 100 } as never)
    await $.tool.call({ tool: REPORT, task: 'Build page', percent: 100 } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', ...BAND })
    expect((await texts(ui)).join('|')).toMatch(/All done/)
    expect((await texts(ui)).join('|')).toMatch(/Build page/)
    await clock.advance(5100)
    await ui.redraw()
    const after = (await texts(ui)).join('|')
    expect(after).toMatch(/All done/)
    expect(after).not.toMatch(/Build page/)
  })
})
