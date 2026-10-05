import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import {
  BIG_TEAM,
  EMPTY_DOCK,
  SIZES,
  addQueued,
  applyReport,
  applyStop,
  badge,
  bindAgent,
  capMessage,
  clock,
  counts,
  dropCard,
  finishCard,
  gradient,
  infoLine,
  initials,
  jobName,
  limitFrom,
  markStuck,
  markWorking,
  meter,
  nudgeText,
  overallPercent,
  parseSize,
  phaseOf,
  restoreSize,
  settle,
  splitInstruction,
  summary,
  taskName,
} from './dock-logic'
import type { DockCard, DockModel } from './dock-logic'

const PANE = 'agent-dock'
const REPORT = 'mcp__clean-view__report_progress'
const PLAN = 'mcp__clean-view__plan_steps'

const CORAL = '#ff7a59'
const GOLD = '#f5c451'
const GREEN = '#3ecf8e'
const GREEN_DARK = '#2a9d6e'
const RED = '#ef5350'
const HAIR = '#3a3f4b'
const FACES = ['#ff7a59', '#f5c451', '#3ecf8e', '#6aa9ff', '#b69cff', '#4fd1c5', '#f78fb3', '#d8b98a']

const dockAtom = atom({ plugin: 'clean-view', key: 'dock' } as const, EMPTY_DOCK)
const dockTickAtom = atom({ plugin: 'clean-view', key: 'dockTick' } as const, 0)

// ----------------------------------------------------- module-level state

let dockTicker: { cancel: () => void } | undefined
let lastCount = -1

function syncDockClock($: any, isLive: boolean): void {
  if (isLive && dockTicker === undefined) {
    dockTicker = $.clock.every(250, () => {
      void update($, dockTickAtom, (n: number) => (n + 1) % 1000000)
    })
  } else if (!isLive && dockTicker !== undefined) {
    dockTicker.cancel()
    dockTicker = undefined
  }
}

async function publish($: any, d: DockModel): Promise<void> {
  try {
    const live = counts(d.cards).working
    if (d.isFolded) $.ui.status(d.cards.length === 0 ? 'Agent Dock folded' : badge(d.cards))
    else $.ui.status(undefined)

    if (live !== lastCount) {
      lastCount = live
      const home = await $.env.get('HOME')
      const sid = await $.session.id()
      if (home && sid) {
        await $.fs.write(`${home}/.claude/ai-employee-kit-data/agents-now/${sid}.json`, JSON.stringify({ count: live, updatedAt: await $.clock.now() }))
      }
    }
  } catch {
    // the dock keeps working without its status line
  }
}

async function mutateDock($: any, fn: (d: DockModel) => DockModel): Promise<DockModel> {
  const now = await $.clock.now()
  let result: DockModel = EMPTY_DOCK
  await update($, dockAtom, (d: DockModel) => (result = settle(fn(d), now)))
  syncDockClock($, phaseOf(result.cards) === 'live')
  await publish($, result)
  return result
}

async function setSize($: any, n: number): Promise<void> {
  if (n > BIG_TEAM) {
    await mutateDock($, d => ({ ...d, pendingSize: n, isCustomOpen: false }))
    return
  }
  await mutateDock($, d => ({ ...d, size: n, pendingSize: null, isCustomOpen: false }))
  await $.store.set('dock.size', n)
}

async function confirmBig($: any): Promise<void> {
  const d = await read($, dockAtom)
  if (d.pendingSize === null) return
  const n = d.pendingSize
  await mutateDock($, c => ({ ...c, size: n, pendingSize: null }))
  await $.store.set('dock.size', n)
}

async function setHelperModel($: any, helperModel: 'cheap' | 'same'): Promise<void> {
  await mutateDock($, d => ({ ...d, helperModel }))
  await $.store.set('dock.helperModel', helperModel)
}

async function openDock($: any): Promise<void> {
  const opened = await $.ui.open({ id: PANE, title: 'Agent Dock', columns: 100 })
  if (!opened.isPlaced) $.ui.toast('The window is too narrow to show the Agent Dock. Widen it or watch the status bar.')
}

async function toggleDock($: any): Promise<void> {
  const isOpen = (await $.ui.panes()).some((p: { id: string }) => p.id === PANE)
  if (isOpen) {
    await mutateDock($, d => ({ ...d, isFolded: true }))
    await $.ui.close({ id: PANE })
  } else {
    await mutateDock($, d => ({ ...d, isFolded: false }))
    await openDock($)
  }
}

// ------------------------------------------------------------------ hooks

export function registerDock(on: On): void {
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    const size = restoreSize(await $.store.get('dock.size'))
    const saved = await $.store.get('dock.helperModel')
    const helperModel = saved === 'same' ? 'same' : 'cheap'
    await update($, dockAtom, (d: DockModel) => ({ ...d, size, helperModel }))
    await $.command.register({ name: 'dock', description: 'Open or fold the Agent Dock: /dock, or /dock 10 to set the Team Size' })

    return next(e)
  })

  on('command.run', { command: 'dock' }, ($, e) => {
    try {
      const arg = e.args.trim()
      if (arg === '') {
        void (async () => {
          try {
            await toggleDock($)
          } catch {
            // nothing to do
          }
        })()
        return { text: 'Agent Dock toggled.' }
      }
      const n = parseSize(arg)
      if (n === null) return { text: 'Team Size is a whole number from 1 to 100, e.g. /dock 10.' }
      void (async () => {
        try {
          await setSize($, n)
          await mutateDock($, d => ({ ...d, isFolded: false }))
          await openDock($)
        } catch {
          // nothing to do
        }
      })()

      return { text: n > BIG_TEAM ? `Confirm the team of ${n} in the Agent Dock.` : `Team Size is now ${n}.` }
    } catch {
      return { text: 'The Agent Dock could not do that.' }
    }
  })

  // Tell Claude to split the work.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    const origin = (e as any).origin
    if (text === '' || text.startsWith('/') || origin?.kind === 'plugin') return next(e)

    const d = await read($, dockAtom)
    const now = await $.clock.now()
    await mutateDock($, c => ({
      ...c,
      cards: [],
      doneAgents: [],
      mission: jobName(text),
      startedAt: now,
      finishedAt: null,
      agentCalls: 0,
      hasNudged: false,
      hasMission: true,
    }))
    if (d.size <= 1) return next(e)

    return next({ ...e, context: [...(e.context ?? []), splitInstruction(d.size)] })
  })

  // Queued cards appear as soon as Claude writes the Agent calls.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (e.agentId === undefined && e.message.type === 'assistant' && Array.isArray(e.message.content)) {
      const calls = (e.message.content as any[]).filter(b => b?.type === 'tool_use' && b.name === 'Agent')
      if (calls.length > 0) {
        const now = await $.clock.now()
        await mutateDock($, d =>
          calls.reduce((m, b) => addQueued(m, String(b.id), taskName(b.input?.description), now), d),
        )
      }
    }

    return next(e)
  })

  // The cap, the queue and the helper model.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const d0 = await read($, dockAtom)
    const input = e as any
    const id = String(e.tool_use_id)
    const isManaged = d0.size > 1

    if (isManaged) {
      let isOver = false
      await mutateDock($, c => {
        isOver = c.agentCalls + 1 > c.size
        return isOver ? c : { ...c, agentCalls: c.agentCalls + 1 }
      })
      if (isOver) return { deny: capMessage(d0.size) }
    }

    const queuedAt = await $.clock.now()
    await mutateDock($, c => addQueued(c, id, taskName(input.description), queuedAt))

    if (isManaged) {
      const limit = limitFrom(
        await $.env.get('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS'),
        await $.env.get('CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY'),
      )
      for (;;) {
        let isClaimed = false
        const now = await $.clock.now()
        await mutateDock($, c => {
          isClaimed = false
          if (counts(c.cards).working >= limit) return c
          isClaimed = true
          return markWorking(c, id, now)
        })
        if (isClaimed) break
        if (next.signal.aborted) {
          await mutateDock($, c => dropCard(c, id))
          return { deny: 'Stopped before this helper started.' }
        }
        await $.process.run(['/bin/sleep', '1'])
      }
    } else {
      const now = await $.clock.now()
      await mutateDock($, c => markWorking(c, id, now))
    }

    const call = isManaged && d0.helperModel === 'cheap' && !input.model ? { ...e, model: 'haiku' as const } : e
    const ran = await next(call as typeof e)
    const now = await $.clock.now()

    if (ran.deny !== undefined || ran.isError === true) {
      await mutateDock($, c => markStuck(c, id, now))
      return ran
    }

    const agentId = (ran as any).result?.agentId
    if (typeof agentId === 'string') await mutateDock($, c => bindAgent(c, id, agentId, now))
    if (input.run_in_background === false) await mutateDock($, c => finishCard(c, id, now))

    return ran
  })

  // Helpers report their own progress.
  on('tool.call', { tool: REPORT, agentId: /./ }, async ($, e) => {
    const input = e as any
    const percent = Math.max(0, Math.min(100, Math.round(Number(input.percent) || 0)))
    await mutateDock($, d => applyReport(d, String(e.agentId), percent))

    return { result: `Progress noted: ${percent}%.` }
  })

  on('tool.call', { tool: PLAN, agentId: /./ }, () => ({
    result: 'Helpers skip the plan. Just call report_progress as you work.',
  }))

  on('classic.SubagentStop', async ($, e, next) => {
    const now = await $.clock.now()
    await mutateDock($, d => applyStop(d, String(e.agent_id), now))

    return next(e)
  })

  // One nudge per request when Claude used fewer helpers than the Team Size.
  on('turn.complete', { reason: /^/ }, async ($, e, next) => {
    if (e.agentId !== undefined || e.reason !== 'answer') return next(e)

    const d = await read($, dockAtom)
    if (d.size > 1 && d.hasMission && !d.hasNudged && d.agentCalls < d.size) {
      const used = d.agentCalls
      await mutateDock($, c => ({ ...c, hasNudged: true }))
      void $.prompt.submit({ text: nudgeText(used, d.size) })
    }

    return next(e)
  })

  // ---------------------------------------------------------------- pane

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const d = await read($, dockAtom)
    const tick = await read($, dockTickAtom)
    const now = await $.clock.now()
    const limit = limitFrom(
      await $.env.get('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS'),
      await $.env.get('CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY'),
    )
    const { Box, Text, Button, Input } = $.ui.resolve(e)

    const cols = Math.max(30, e.props.bodyColumns)
    const phase = phaseOf(d.cards)
    const n = counts(d.cards)
    const total = d.cards.length

    // masthead
    const mark = '◆  A G E N T   D O C K'
    const colors = gradient(CORAL, GOLD, mark.length)
    const isBlinkOn = tick % 4 < 2
    const live =
      phase === 'live' ? (
        <Text bold color={isBlinkOn ? GREEN : GREEN_DARK}>{'● L I V E'}</Text>
      ) : phase === 'complete' ? (
        <Text bold color={GOLD}>{'COMPLETE'}</Text>
      ) : (
        <Text dimColor>{'STANDING BY'}</Text>
      )

    const masthead = (
      <Box key="mast" width="100%" justifyContent="space-between">
        <Box>
          {mark.split('').map((ch, i) => (
            <Text bold color={colors[i]}>{ch}</Text>
          ))}
        </Box>
        {live}
      </Box>
    )

    // team size
    const isCustomSize = !(SIZES as readonly number[]).includes(d.size)
    const sizeRow = (
      <Box key="size" flexWrap="wrap" columnGap={1}>
        <Text dimColor>{'T E A M  S I Z E  '}</Text>
        {SIZES.map(s => (
          <Button
            key={`size-${s}`}
            label={String(s)}
            variant={d.size === s ? 'primary' : 'secondary'}
            onPress={() => setSize($, s)}
          />
        ))}
        <Button
          key="custom"
          label="Custom"
          variant={isCustomSize ? 'primary' : 'secondary'}
          onPress={() => mutateDock($, c => ({ ...c, isCustomOpen: !c.isCustomOpen }))}
        />
      </Box>
    )

    const customBox = d.isCustomOpen ? (
      <Box key="custom-box" borderStyle="round" borderColor={CORAL} paddingX={1} flexDirection="column">
        <Text>{'How many helpers?'}</Text>
        <Input
          key="custom-input"
          placeholder="1 to 100"
          autoFocus
          onSubmit={async (value: string) => {
            const size = parseSize(value)
            if (size === null) {
              $.ui.toast('Type a whole number from 1 to 100')
              return
            }
            await setSize($, size)
          }}
        />
      </Box>
    ) : null

    const info = (
      <Text key="info" dimColor wrap="truncate-end">
        {infoLine(d.size, limit, d.helperModel)}
      </Text>
    )

    const modelRow = (
      <Box key="model" columnGap={1}>
        <Text dimColor>{'Helper agents:'}</Text>
        <Button
          key="model-cheap"
          label="Fast & Cheap"
          variant={d.helperModel === 'cheap' ? 'primary' : 'secondary'}
          onPress={() => setHelperModel($, 'cheap')}
        />
        <Button
          key="model-same"
          label="Same as me"
          variant={d.helperModel === 'same' ? 'primary' : 'secondary'}
          onPress={() => setHelperModel($, 'same')}
        />
      </Box>
    )

    const bigBox =
      d.pendingSize !== null ? (
        <Box key="big" borderStyle="round" borderColor={GOLD} paddingX={1} flexDirection="column">
          <Text color={GOLD}>{'Big team: this uses your plan quickly. Continue?'}</Text>
          <Box columnGap={1}>
            <Button key="confirm-big" label={`Continue with ${d.pendingSize}`} variant="primary" onPress={() => confirmBig($)} />
            <Button key="cancel-big" label="Cancel" onPress={() => mutateDock($, c => ({ ...c, pendingSize: null }))} />
          </Box>
        </Box>
      ) : null

    const rule = <Text color={HAIR}>{'─'.repeat(cols)}</Text>

    // body
    let body
    if (total === 0) {
      const seats = Math.min(d.size, 25)
      const second = Math.floor(now / 1000)
      body = (
        <Box key="idle" flexDirection="column" gap={1}>
          <Box>
            {Array.from({ length: seats }, (_, i) => (
              <Text color={FACES[i % FACES.length]} dimColor={(second + i * 7) % 9 === 0}>{'● '}</Text>
            ))}
          </Box>
          <Text>{`Your team of ${d.size} is standing by`}</Text>
          <Text dimColor>
            {d.size === 1 ? 'Claude decides how many helpers a request needs.' : `Send a request and it splits across ${d.size} helpers.`}
          </Text>
        </Box>
      )
    } else {
      const elapsedMs = (d.finishedAt ?? now) - (d.startedAt ?? now)
      const percent = overallPercent(d.cards)
      const doneW = Math.round((cols * (n.done + n.stuck)) / total)
      const workW = Math.min(cols - doneW, Math.round((cols * n.working) / total))
      const restW = Math.max(0, cols - doneW - workW)
      const doneColors = gradient(CORAL, GOLD, Math.max(1, doneW))
      const bar = (
        <Box key="bar">
          {Array.from({ length: doneW }, (_, i) => (
            <Text color={doneColors[i]}>{'━'}</Text>
          ))}
          {Array.from({ length: workW }, (_, i) => (
            <Text color={(i + tick) % 6 < 3 ? GREEN : GREEN_DARK}>{'━'}</Text>
          ))}
          <Text color={HAIR}>{'─'.repeat(restW)}</Text>
        </Box>
      )

      const mission = (
        <Box key="mission" width="100%" justifyContent="space-between">
          <Box flexShrink={1}>
            <Text dimColor>{'M I S S I O N   '}</Text>
            <Text bold wrap="truncate-end">{d.mission}</Text>
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            <Text bold>{`${percent}%`}</Text>
            <Text dimColor>{`   ${clock(elapsedMs)}`}</Text>
          </Box>
        </Box>
      )

      const countsRow = (
        <Box key="counts" columnGap={4}>
          <Text color={GREEN}>{`● ${n.working} working`}</Text>
          <Text dimColor>{`○ ${n.queued} queued`}</Text>
          <Text color={GOLD}>{`✓ ${n.done} done`}</Text>
          <Text color={n.stuck > 0 ? RED : undefined} dimColor={n.stuck === 0}>{`✕ ${n.stuck} stuck`}</Text>
        </Box>
      )

      const done =
        phase === 'complete' ? (
          <Box key="summary" borderStyle="round" borderColor={GREEN} paddingX={1}>
            <Text color={GREEN} wrap="truncate-end">{`✓ ${summary(d.cards, d.mission, elapsedMs)}`}</Text>
          </Box>
        ) : null

      const statusColor = (c: DockCard): string =>
        c.status === 'done' ? GOLD : c.status === 'stuck' ? RED : c.status === 'working' ? GREEN : HAIR

      let grid
      if (total > 12) {
        const tileW = 8
        const perRow = Math.max(1, Math.floor(cols / tileW))
        const rows: DockCard[][] = []
        for (let i = 0; i < total; i += perRow) rows.push(d.cards.slice(i, i + perRow))
        grid = (
          <Box key="grid" flexDirection="column">
            {rows.map((row, r) => (
              <Box key={`trow-${r}`}>
                {row.map(c => (
                  <Box width={tileW} flexShrink={0} flexDirection="column">
                    <Text bold color="black" backgroundColor={statusColor(c)}>{` ${initials(c.task)} `}</Text>
                    <Text dimColor={c.status === 'queued'} color={c.status === 'stuck' ? RED : undefined}>
                      {c.status === 'queued' ? '○' : c.status === 'stuck' ? '✕' : c.status === 'done' ? '✓' : `${c.percent}%`}
                    </Text>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )
      } else {
        const perRow = cols >= 96 ? 3 : cols >= 60 ? 2 : 1
        const cardW = Math.floor((cols - (perRow - 1)) / perRow)
        const inner = Math.max(10, cardW - 4)
        const meterW = Math.max(6, inner - 6)
        const rows: DockCard[][] = []
        for (let i = 0; i < total; i += perRow) rows.push(d.cards.slice(i, i + perRow))
        grid = (
          <Box key="grid" flexDirection="column">
            {rows.map((row, r) => (
              <Box key={`crow-${r}`} columnGap={1}>
                {row.map((c, k) => {
                  const idx = r * perRow + k
                  const queued = c.status === 'queued'
                  const percent = c.status === 'done' ? 100 : c.percent
                  const m = meter(percent, meterW)
                  const elapsedCard =
                    c.startedAt === null ? '--:--' : clock((c.finishedAt ?? now) - c.startedAt)
                  const sweepAt = (tick % (meterW + 3)) - 3
                  const isSweep = c.status === 'working' && !c.hasReported
                  const fill = c.status === 'stuck' ? RED : c.status === 'done' ? GOLD : GREEN
                  return (
                    <Box
                      width={cardW}
                      flexShrink={0}
                      flexDirection="column"
                      paddingX={1}
                      borderStyle="round"
                      borderColor={c.status === 'stuck' ? RED : HAIR}
                      hover={{ borderColor: CORAL }}
                    >
                      <Box width="100%" justifyContent="space-between">
                        <Box flexShrink={1}>
                          <Text bold color="black" backgroundColor={FACES[idx % FACES.length]} dimColor={queued}>{` ${initials(c.task)} `}</Text>
                          <Text dimColor={queued} wrap="truncate-end">{` ${c.task}`}</Text>
                        </Box>
                        <Text dimColor>{` ${elapsedCard}`}</Text>
                      </Box>
                      <Box>
                        {isSweep ? (
                          <>
                            {Array.from({ length: meterW }, (_, i) => (
                              <Text color={i >= sweepAt && i < sweepAt + 3 ? GREEN : HAIR}>{i >= sweepAt && i < sweepAt + 3 ? '━' : '─'}</Text>
                            ))}
                            <Text dimColor>{'  ···'}</Text>
                          </>
                        ) : (
                          <>
                            <Text color={fill} dimColor={queued}>{'━'.repeat(m.filled)}</Text>
                            <Text color={HAIR}>{'─'.repeat(m.empty)}</Text>
                            <Text dimColor={queued}>{` ${String(percent).padStart(3)}%`}</Text>
                          </>
                        )}
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>
        )
      }

      body = (
        <Box key="live" flexDirection="column" gap={1}>
          {mission}
          {bar}
          {countsRow}
          {done}
          {grid}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {masthead}
        {rule}
        {sizeRow}
        {customBox}
        {bigBox}
        {info}
        {modelRow}
        {body}
      </Box>
    )
  })
}
