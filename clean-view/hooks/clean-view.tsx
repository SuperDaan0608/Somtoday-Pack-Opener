import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { Checklist, ChecklistTask } from '../types'

const MAX_NAME = 40
const FALLBACK_NAME = 'Working on it'
const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN, REPORT])

const EMPTY: Checklist = {
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: null,
  stuckReason: null,
  startedAt: null,
  finishedAt: null,
  isCollapsed: false,
}

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const PROMPT_SECTION = `# Clean View is on
The person you are helping is not technical. A checklist above their prompt shows the plan and your progress, and all tool calls are hidden from them.
- Write every step name in plain English a non-technical person understands. Keep it under 40 characters and start it with a verb, like "Build the pricing section".
- Never put file paths, file names, commands, code or tool names in a step name.
- For every request, even a quick question, call plan_steps (full name ${PLAN}) first with 2 to 8 short step names in order. Load it with ToolSearch if it is deferred. Then call report_progress (${REPORT}) with the step name and a percent as real progress happens, and with 100 the moment a step finishes.
- If this session has TodoWrite or TaskCreate, you can use its to-do list as the plan instead.`

// ---------------------------------------------------------------- names

export function cleanName(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : ''
  s = s.replace(/`[^`]*`/g, ' ')
  s = s.replace(/\S*[\\/]\S*/g, ' ')
  s = s.replace(
    /[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|cpp|cs|php|sh|json|ya?ml|toml|md|html?|css|scss|sql|lua|c|h)\b/gi,
    ' ',
  )
  s = s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
  if (s === '') return FALLBACK_NAME
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (s.length <= MAX_NAME) return s

  let cut = s.slice(0, MAX_NAME - 1)
  const space = cut.lastIndexOf(' ')
  if (s.charAt(MAX_NAME - 1) !== ' ' && space > 0) cut = cut.slice(0, space)
  cut = cut.replace(/[\s,;:.\-–]+$/, '')
  return cut === '' ? FALLBACK_NAME : `${cut}…`
}

// ------------------------------------------------------------- checklist

const task = (id: string, name: string, status: ChecklistTask['status']): ChecklistTask => ({
  id,
  name,
  status,
  percent: status === 'done' ? 100 : 0,
  hasReported: false,
})

const placeholders = (): ChecklistTask[] => [
  task('ph0', 'Understand your request', 'active'),
  task('ph1', 'Plan the steps', 'upcoming'),
]

const hasRealPlan = (c: Checklist): boolean => c.phase !== 'idle' && c.tasks.some(t => !t.id.startsWith('ph'))

const isRunning = (c: Checklist): boolean => c.phase === 'working' || c.phase === 'needs-you' || c.phase === 'stuck'

function normalize(tasks: ChecklistTask[]): ChecklistTask[] {
  let seen = false
  const out = tasks.map(t => {
    if (t.status !== 'active') return t
    if (seen) return { ...t, status: 'upcoming' as const }
    seen = true
    return t
  })
  if (seen) return out
  const first = out.findIndex(t => t.status === 'upcoming')
  return first < 0 ? out : out.map((t, i) => (i === first ? { ...t, status: 'active' as const } : t))
}

function startJob(now: number, title = 'Working on your request'): Checklist {
  return { ...EMPTY, title, phase: 'working', tasks: placeholders(), startedAt: now }
}

function planSteps(names: string[]): ChecklistTask[] {
  return names.map((name, i) => task(`s${i}`, name, i === 0 ? 'active' : 'upcoming'))
}

function reportProgress(tasks: ChecklistTask[], rawName: string, rawPercent: number): ChecklistTask[] {
  const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, Math.round(rawPercent))) : 0
  const name = cleanName(rawName)
  const key = name.toLowerCase()
  const out = tasks.map(t => ({ ...t }))
  let at = out.findIndex(t => t.name.toLowerCase() === key)
  if (at < 0) {
    at = out.findIndex(t => {
      const n = t.name.toLowerCase()
      return n.startsWith(key) || key.startsWith(n)
    })
  }
  if (at < 0) {
    const firstUpcoming = out.findIndex(t => t.status === 'upcoming')
    at = firstUpcoming < 0 ? out.length : firstUpcoming
    out.splice(at, 0, task(`r${out.length}`, name, 'upcoming'))
  }
  for (let j = 0; j < at; j += 1) {
    out[j] = { ...out[j], status: 'done', percent: 100 }
  }
  for (let j = at + 1; j < out.length; j += 1) {
    if (out[j].status === 'active') out[j] = { ...out[j], status: 'upcoming', percent: 0 }
  }
  const one = out[at]
  if (one.status !== 'done' || percent >= 100) {
    out[at] =
      percent >= 100
        ? { ...one, status: 'done', percent: 100, hasReported: true }
        : { ...one, status: 'active', percent, hasReported: true }
  }
  return normalize(out)
}

// ---------------------------------------------------------------- text

function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  return m === 0 ? `${total}s` : `${m}m ${total % 60}s`
}

function errorSentence(text: string): string {
  const t = text.toLowerCase()
  if (/rate.?limit|usage limit|429|quota/.test(t)) return 'you hit your usage limit, try again a little later'
  if (/overloaded|529|503|server.*busy/.test(t)) return "Claude's servers are busy, try again in a minute"
  if (/context|too long|too many tokens|max.?tokens/.test(t)) return 'type /compact and try again'
  if (/network|connection|econn|enotfound|fetch failed|timed? ?out|offline/.test(t)) return 'the internet connection dropped'
  if (/auth|401|403|api key|login|credential|unauthorized/.test(t)) return 'type /login'
  return 'something went wrong, try again'
}

const REJECTED = /user doesn't want to proceed|tool use was rejected|permission to use .* (?:has been )?denied|user rejected/i

// -------------------------------------------------------------- module

let seq = 0
let failures = 0
let isTurnRunning = false
let ticker: { cancel: () => void } | undefined
let collapser: { cancel: () => void } | undefined

function syncClock($: any, phase: Checklist['phase']): void {
  const isAnimated = phase === 'working' || phase === 'needs-you'
  if (isAnimated && ticker === undefined) {
    ticker = $.clock.every(250, () => {
      void update($, tickAtom, (n: number) => (n + 1) % 1000000)
    })
  } else if (!isAnimated && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}

async function mutate($: any, fn: (c: Checklist) => Checklist): Promise<Checklist> {
  let result: Checklist = EMPTY
  await update($, checklistAtom, (c: Checklist) => (result = fn(c)))
  syncClock($, result.phase)
  return result
}

async function ensureJob($: any): Promise<void> {
  const now = await $.clock.now()
  await mutate($, c => (isRunning(c) ? c : startJob(now)))
}

async function setEnabled($: any, want: boolean): Promise<void> {
  await update($, enabledAtom, () => want)
  await $.store.set('cleanViewEnabled', want)
  $.ui.toast(want ? 'Clean View is on: tool details are hidden' : 'Clean View is off: every detail is back')
}


export function registerCleanView(on: On): void {
  const setNeedsYou = (reason: string) => (c: Checklist): Checklist =>
    isRunning(c) ? { ...c, phase: 'needs-you', needsYouReason: reason } : c

  const clearNeedsYou = (c: Checklist): Checklist =>
    c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: null } : c

  const setStuck = (reason: string) => (c: Checklist): Checklist =>
    isRunning(c) ? { ...c, phase: 'stuck', stuckReason: reason } : c

  // ------------------------------------------------------ session start

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('cleanViewEnabled')
    if (typeof saved === 'boolean') await update($, enabledAtom, () => saved)

    await $.tool.register({
      name: 'plan_steps',
      description:
        'Lay out every step of the job up front, 2 to 8 short plain-English names in order (start each with a verb, no file names or code). The first step starts right away.',
      inputSchema: {
        type: 'object',
        properties: { steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 } },
        required: ['steps'],
      },
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Report progress on a step of the plan: the step name and a percent from 0 to 100. Use 100 the moment the step finishes.',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } },
        required: ['task', 'percent'],
      },
    })
    await $.command.register({ name: 'simple', description: 'Turn Clean View on or off: /simple on, /simple off, or just /simple to switch' })

    return next(e)
  })

  // ------------------------------------------------------------ command

  on('command.run', { command: 'simple' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    const current = await read($, enabledAtom)
    let want = !current
    if (word === 'on') want = true
    else if (word === 'off') want = false
    else if (word !== '') return { text: 'Use /simple on, /simple off, or just /simple to switch.' }

    await setEnabled($, want)

    return { text: want ? 'Clean View is on.' : 'Clean View is off. Every detail is back.' }
  })

  // ------------------------------------------------------ system prompt

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    if (!(await read($, enabledAtom))) return out

    return { ...out, sections: [...out.sections, { id: 'clean-view:plan', text: PROMPT_SECTION, scope: 'session' as const }] }
  })

  // --------------------------------------------------------- turn start

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    if (!(await read($, enabledAtom)) || text === '' || text.startsWith('/') || isTurnRunning) return next(e)

    isTurnRunning = true
    seq += 1
    const mine = seq
    failures = 0
    collapser?.cancel()
    collapser = undefined
    const now = await $.clock.now()
    await mutate($, () => startJob(now))

    void (async () => {
      try {
        const r = await $.model.complete({
          model: 'haiku',
          effort: 'low',
          prompt: `Name this job in 2 to 6 plain words. Start with a verb, like "Build my landing page". No quotes, no file names, no punctuation. Reply with the name only.\n\nRequest: ${text.slice(0, 600)}`,
        })
        if (!r.isAnswered || mine !== seq) return
        const words = r.text.split('\n')[0].replace(/["'`.]/g, '').trim().split(/\s+/).slice(0, 6).join(' ')
        const title = cleanName(words)
        if (title === FALLBACK_NAME) return
        await mutate($, c => (mine === seq ? { ...c, title } : c))
      } catch {
        // the placeholder title stays
      }
    })()

    return next(e)
  })

  // ---------------------------------------------------------- tool.call

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const tool = String(e.tool)
    const enabled = await read($, enabledAtom)

    if (enabled && !ALWAYS_ALLOWED.has(tool)) {
      const c = await read($, checklistAtom)
      if (!hasRealPlan(c)) {
        return {
          deny: `Clean View needs a plan first. Call plan_steps (${PLAN}; load it with ToolSearch "select:${PLAN}" if needed) with 2 to 8 plain-English steps, then try this again.`,
        }
      }
    }

    await mutate($, clearNeedsYou)
    if (tool === 'AskUserQuestion') await mutate($, setNeedsYou('Claude has a question for you'))

    const ran = await next(e)

    await mutate($, clearNeedsYou)
    if (ran.deny !== undefined) return ran

    if (ran.isError === true) {
      if (REJECTED.test(String(ran.text ?? ''))) {
        await mutate($, setStuck('you said no to a step, so Claude paused'))
      } else {
        failures += 1
        if (failures >= 3) await mutate($, setStuck('a step keeps failing, Claude is trying another way'))
      }
      return ran
    }

    failures = 0
    await mutate($, c => (c.phase === 'stuck' ? { ...c, phase: 'working', stuckReason: null } : c))

    if (tool === 'TodoWrite') {
      const todos = ((e as any).todos ?? []) as Array<{ content: string; status: string }>
      if (todos.length > 0) {
        await ensureJob($)
        await mutate($, c => {
          const prior = new Map(c.tasks.map(t => [t.name, t]))
          const tasks = todos.map((todo, i) => {
            const name = cleanName(todo.content)
            const status = todo.status === 'completed' ? 'done' : todo.status === 'in_progress' ? 'active' : 'upcoming'
            const before = prior.get(name)
            return {
              ...task(`t${i}`, name, status),
              percent: status === 'done' ? 100 : status === 'active' ? (before?.percent ?? 0) : 0,
              hasReported: status === 'active' ? (before?.hasReported ?? false) : false,
            }
          })
          return { ...c, tasks: normalize(tasks) }
        })
      }
    } else if (tool === 'TaskCreate') {
      const created = (ran as any).result?.task?.id
      const id = `tc${created ?? Math.random().toString(36).slice(2, 8)}`
      await ensureJob($)
      await mutate($, c => ({
        ...c,
        tasks: normalize([...c.tasks.filter(t => !t.id.startsWith('ph')), task(id, cleanName((e as any).subject), 'upcoming')]),
      }))
    } else if (tool === 'TaskUpdate') {
      const input = e as any
      await mutate($, c => {
        const id = `tc${input.taskId}`
        if (!c.tasks.some(t => t.id === id)) return c
        let tasks = c.tasks
        if (input.status === 'deleted') {
          tasks = tasks.filter(t => t.id !== id)
        } else {
          tasks = tasks.map(t => {
            if (t.id !== id) return input.status === 'in_progress' && t.status === 'active' ? { ...t, status: 'upcoming' as const } : t
            const name = typeof input.subject === 'string' ? cleanName(input.subject) : t.name
            if (input.status === 'completed') return { ...t, name, status: 'done' as const, percent: 100 }
            if (input.status === 'in_progress') return { ...t, name, status: 'active' as const }
            if (input.status === 'pending') return { ...t, name, status: 'upcoming' as const, percent: 0 }
            return { ...t, name }
          })
        }
        return { ...c, tasks: normalize(tasks) }
      })
    }

    return ran
  })

  on('tool.call', { tool: PLAN }, async ($, e) => {
    const raw = (e as any).steps
    const names = (Array.isArray(raw) ? raw : []).filter((s: unknown) => typeof s === 'string').slice(0, 8).map(cleanName)
    if (names.length === 0) return { deny: 'plan_steps needs a list of 2 to 8 short step names.' }

    await ensureJob($)
    await mutate($, c => ({ ...c, tasks: planSteps(names) }))

    return { result: `Planned ${names.length} steps. The first one has started.` }
  })

  on('tool.call', { tool: REPORT }, async ($, e) => {
    const input = e as any
    const percent = Math.max(0, Math.min(100, Math.round(Number(input.percent) || 0)))

    await ensureJob($)
    await mutate($, c => ({ ...c, tasks: reportProgress(c.tasks, String(input.task ?? ''), percent) }))

    return { result: `Progress noted: ${percent}%.` }
  })

  // ------------------------------------------- permissions and notices

  on('classic.Notification', async ($, e, next) => {
    const isPrompt = /permission|elicitation|approval/i.test(e.notification_type) || /permission|approve|needs your/i.test(e.message)
    if (isPrompt && e.notification_type !== 'idle_prompt') {
      await mutate($, setNeedsYou('Claude needs your OK to continue'))
    }

    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await mutate($, setStuck('you said no to a step, so Claude paused'))

    return next(e)
  })

  // ------------------------------------------------------ turn complete

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    isTurnRunning = false
    if (!(await read($, enabledAtom))) return next(e)

    const before = await read($, checklistAtom)
    if (before.phase === 'idle') return next(e)

    const now = await $.clock.now()
    const mine = seq
    let outcome: Checklist

    if (e.reason === 'error') {
      outcome = await mutate($, c => ({ ...c, phase: 'stuck', stuckReason: errorSentence(e.answer) }))
    } else if (e.reason === 'refusal') {
      outcome = await mutate($, c => ({ ...c, phase: 'stuck', stuckReason: "Claude couldn't help with that request" }))
    } else if (e.reason === 'aborted') {
      outcome = await mutate($, c => ({ ...c, phase: 'stopped', finishedAt: now }))
    } else if (before.tasks.some(t => !t.id.startsWith('ph') && t.status !== 'done')) {
      outcome = await mutate($, c => ({ ...c, phase: 'needs-you', needsYouReason: 'Claude is waiting for your reply' }))
    } else {
      outcome = await mutate($, c => ({
        ...c,
        phase: 'done',
        finishedAt: now,
        tasks: c.tasks.map(t => ({ ...t, status: 'done' as const, percent: 100 })),
      }))
      collapser?.cancel()
      collapser = $.clock.after(5000, () => {
        void mutate($, c => (mine === seq && c.phase === 'done' ? { ...c, isCollapsed: true } : c))
      })
    }
    void outcome

    return next(e)
  })

  // ------------------------------------------------------- hidden rows

  for (const component of ['ToolUse', 'ToolResult', 'ToolGroup'] as const) {
    on('ui.render', { component }, async ($, e, next) => {
      if (!(await read($, enabledAtom))) return next(e)
      const { Box } = $.ui.resolve(e)

      return <Box display="none" />
    })
  }

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)

    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  // -------------------------------------------------------------- band

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const enabled = await read($, enabledAtom)
    const c = await read($, checklistAtom)
    const tick = await read($, tickAtom)
    const now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)

    const toggle = (
      <Button
        key="toggle"
        label={`● Clean View: ${enabled ? 'ON' : 'OFF'}`}
        onPress={async () => {
          const current = await read($, enabledAtom)
          await setEnabled($, !current)
        }}
      />
    )

    if (!enabled || c.phase === 'idle') {
      return (
        <Box key="band" width="100%" justifyContent="flex-end">
          {toggle}
        </Box>
      )
    }

    const columns = e.props.bodyColumns
    const title = c.title === '' ? 'Working on your request' : c.title
    const runFor = elapsed((c.finishedAt ?? now) - (c.startedAt ?? now))

    let head
    if (c.phase === 'needs-you') {
      head = (
        <Box key="head-left" flexShrink={1}>
          <Text bold color="black" backgroundColor="yellow">
            {' Needs you '}
          </Text>
          <Text wrap="truncate-end">{` ${c.needsYouReason ?? 'Claude needs your OK to continue'}`}</Text>
        </Box>
      )
    } else if (c.phase === 'stuck') {
      head = (
        <Box key="head-left" flexShrink={1}>
          <Text bold color="red" wrap="truncate-end">{`⚠ Stuck: ${c.stuckReason ?? 'something went wrong'}`}</Text>
        </Box>
      )
    } else if (c.phase === 'stopped') {
      head = (
        <Box key="head-left" flexShrink={1}>
          <Text bold wrap="truncate-end">{`■ Stopped · ${title} · you pressed Esc`}</Text>
        </Box>
      )
    } else if (c.phase === 'done') {
      head = (
        <Box key="head-left" flexShrink={1}>
          <Text bold color="green" wrap="truncate-end">{`✓ All done · ${title} · took ${runFor}`}</Text>
        </Box>
      )
    } else {
      head = (
        <Box key="head-left" flexShrink={1}>
          <Text bold wrap="truncate-end">{`${title} · ${runFor}`}</Text>
        </Box>
      )
    }

    const header = (
      <Box key="head" width="100%" justifyContent="space-between">
        {head}
        <Box flexShrink={0} marginLeft={1}>
          {toggle}
        </Box>
      </Box>
    )

    if (c.phase === 'done' && c.isCollapsed) {
      return (
        <Box key="band" width="100%" flexDirection="column">
          {header}
        </Box>
      )
    }

    const nameWidth = Math.max(6, Math.min(MAX_NAME, columns - 22))
    const firstUpcoming = c.tasks.findIndex(t => t.status === 'upcoming')
    const frame = c.phase === 'working' ? tick : 0

    const rows = c.tasks.map((t, i) => {
      let icon = '○'
      let iconColor: string | undefined
      let meter = '░'.repeat(10)
      let meterColor: string | undefined
      let label = i === firstUpcoming ? 'Next' : 'Up next'

      if (t.status === 'done') {
        icon = '✓'
        iconColor = 'green'
        meter = '█'.repeat(10)
        meterColor = 'green'
        label = 'Done'
      } else if (t.status === 'active') {
        icon = c.phase === 'needs-you' ? '‖' : '▶'
        iconColor = c.phase === 'needs-you' ? 'yellow' : 'cyan'
        meterColor = iconColor
        if (t.hasReported) {
          const filled = Math.round(t.percent / 10)
          meter = '█'.repeat(filled) + '░'.repeat(10 - filled)
          label = `${t.percent}%`
        } else {
          const head = (frame % 13) - 3
          meter = Array.from({ length: 10 }, (_, k) => (k >= head && k < head + 3 ? '█' : '░')).join('')
          label = 'Working'
        }
      }

      const isDim = t.status !== 'active'

      return (
        <Box key={`row-${i}`}>
          <Text color={iconColor} dimColor={t.status === 'upcoming'} bold={t.status === 'active'}>{`${icon} `}</Text>
          <Box width={nameWidth} flexShrink={0}>
            <Text bold={t.status === 'active'} dimColor={isDim} wrap="truncate-end">
              {t.name}
            </Text>
          </Box>
          <Text color={meterColor} dimColor={t.status === 'upcoming'}>{` ${meter}  `}</Text>
          <Text bold={t.status === 'active'} dimColor={t.status === 'upcoming'}>{label}</Text>
        </Box>
      )
    })

    return (
      <Box key="band" width="100%" flexDirection="column">
        {header}
        {rows}
      </Box>
    )
  })
}
