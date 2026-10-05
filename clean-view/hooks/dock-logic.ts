// Agent Dock: everything that needs no `$`. dock.tsx holds every engine call.

export const SIZES = [1, 3, 5, 10, 20, 50, 100] as const
export const MAX_SIZE = 100
export const BIG_TEAM = 20

export type CardStatus = 'queued' | 'working' | 'done' | 'stuck'

export type DockCard = {
  id: string
  agentId: string | null
  task: string
  status: CardStatus
  percent: number
  hasReported: boolean
  startedAt: number | null
  finishedAt: number | null
}

export type DockModel = {
  size: number
  pendingSize: number | null
  isCustomOpen: boolean
  helperModel: 'cheap' | 'same'
  isFolded: boolean
  cards: DockCard[]
  doneAgents: string[]
  mission: string
  startedAt: number | null
  finishedAt: number | null
  agentCalls: number
  hasNudged: boolean
  hasMission: boolean
}

export const EMPTY_DOCK: DockModel = {
  size: 1,
  pendingSize: null,
  isCustomOpen: false,
  helperModel: 'cheap',
  isFolded: false,
  cards: [],
  doneAgents: [],
  mission: '',
  startedAt: null,
  finishedAt: null,
  agentCalls: 0,
  hasNudged: false,
  hasMission: false,
}

/** "10" -> 10, " 25 " -> 25; anything that is not a whole number from 1 to 100 -> null. */
export function parseSize(text: unknown): number | null {
  const s = typeof text === 'number' ? String(text) : typeof text === 'string' ? text.trim() : ''
  if (!/^\d{1,3}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= MAX_SIZE ? n : null
}

/** A saved size above 20 never carries into a new session. */
export function restoreSize(saved: unknown): number {
  const n = parseSize(saved)
  return n !== null && n <= BIG_TEAM ? n : 1
}

export function splitInstruction(n: number): string {
  return [
    `Agent Dock: Team Size is ${n}. Split this request into exactly ${n} independent pieces and launch one helper (the Agent tool) per piece, all ${n} in one message so they run in parallel.`,
    '- Find a real split, one helper per item (per store, per task, per file, per section). Never argue that it cannot be split and never pad with useless work.',
    '- Give each helper a short plain-English description of 3 to 5 words, for example "Price check: Panera".',
    '- In each helper\'s prompt add: "As you work, call report_progress with your task name and a percent at about 25, 50, 75 and 100. Do not call plan_steps."',
    '- When they finish, combine their results into one answer.',
  ].join('\n')
}

export function nudgeText(used: number, n: number): string {
  return `You used ${used} of ${n} helpers. Split the remaining work across the other ${n - used}, one helper per piece, all in parallel.`
}

export function capMessage(n: number): string {
  return `Team Size is ${n}: this request already has ${n} helpers. Finish with the helpers you have.`
}

/** The first clause of a request, about 40 characters, cut at a word. */
export function jobName(text: string): string {
  const clause = text.replace(/\s+/g, ' ').trim().split(/[.,;:!?\n]| - | — /)[0]?.trim() ?? ''
  if (clause === '') return 'Your request'
  const s = clause.charAt(0).toUpperCase() + clause.slice(1)
  if (s.length <= 40) return s
  const cut = s.slice(0, 40)
  const space = cut.lastIndexOf(' ')
  return (space > 12 ? cut.slice(0, space) : cut).trimEnd()
}

/** A helper's task name: 3 to 5 plain words. */
export function taskName(description: unknown): string {
  const words = String(description ?? '')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\S*[\\/]\S*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length === 0) return 'Helper task'
  const s = words.slice(0, 5).join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

export const isTerminal = (c: DockCard): boolean => c.status === 'done' || c.status === 'stuck'

export function counts(cards: readonly DockCard[]) {
  const n = { working: 0, queued: 0, done: 0, stuck: 0 }
  for (const c of cards) n[c.status] += 1
  return n
}

export function badge(cards: readonly DockCard[]): string {
  const n = counts(cards)
  const parts = [`${n.working} working`, `${n.queued} queued`, `${n.done} done`]
  if (n.stuck > 0) parts.push(`${n.stuck} stuck`)
  return parts.join(' · ')
}

export function phaseOf(cards: readonly DockCard[]): 'idle' | 'live' | 'complete' {
  if (cards.length === 0) return 'idle'
  return cards.every(isTerminal) ? 'complete' : 'live'
}

export function overallPercent(cards: readonly DockCard[]): number {
  if (cards.length === 0) return 0
  const sum = cards.reduce((t, c) => t + (isTerminal(c) ? 100 : c.percent), 0)
  return Math.round(sum / cards.length)
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = String(total % 60).padStart(2, '0')
  return `${Math.floor(total / 60)}:${s}`
}

export function took(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  return m === 0 ? `${total}s` : `${m}m ${total % 60}s`
}

export function summary(cards: readonly DockCard[], job: string, ms: number): string {
  const stuck = counts(cards).stuck
  return `${cards.length} agents finished ${job} in ${took(ms)}${stuck > 0 ? ` (${stuck} got stuck)` : ''}`
}

export function meter(percent: number, width: number): { filled: number; empty: number } {
  const p = Math.max(0, Math.min(100, percent))
  const filled = Math.round((p / 100) * width)
  return { filled, empty: width - filled }
}

export function infoLine(size: number, limit: number, helperModel: 'cheap' | 'same'): string {
  const split = size === 1 ? 'Claude decides how many helpers' : `Splits each request across ${size} helpers`
  const atOnce = size === 1 ? '' : `  ·  ${Math.min(size, limit)} at a time`
  return `${split}${atOnce}  ·  ${helperModel === 'cheap' ? 'Fast & Cheap' : 'Same model as you'}`
}

/** Every `#rrggbb` between two colours, `steps` of them. */
export function gradient(from: string, to: string, steps: number): string[] {
  const a = [1, 3, 5].map(i => parseInt(from.slice(i, i + 2), 16))
  const b = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16))
  return Array.from({ length: Math.max(1, steps) }, (_, k) => {
    const t = steps <= 1 ? 0 : k / (steps - 1)
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
  })
}

export function limitFrom(subagents: string | undefined, toolUse: string | undefined): number {
  const one = Number(subagents)
  const two = Number(toolUse)
  const a = Number.isFinite(one) && one > 0 ? one : 20
  const b = Number.isFinite(two) && two > 0 ? two : 10
  return Math.min(a, b)
}

// ------------------------------------------------------------ card edits

export function newCard(id: string, task: string): DockCard {
  return { id, agentId: null, task, status: 'queued', percent: 0, hasReported: false, startedAt: null, finishedAt: null }
}

const edit = (m: DockModel, f: (c: DockCard) => boolean, g: (c: DockCard) => DockCard): DockModel => ({
  ...m,
  cards: m.cards.map(c => (f(c) ? g(c) : c)),
})

export function addQueued(m: DockModel, id: string, task: string, now: number): DockModel {
  if (m.cards.some(c => c.id === id)) return m
  return {
    ...m,
    hasMission: true,
    mission: m.mission === '' ? 'Your request' : m.mission,
    startedAt: m.startedAt ?? now,
    finishedAt: null,
    cards: [...m.cards, newCard(id, task)],
  }
}

export function markWorking(m: DockModel, id: string, now: number): DockModel {
  return edit(m, c => c.id === id, c => ({ ...c, status: 'working', startedAt: now }))
}

export function markStuck(m: DockModel, id: string, now: number): DockModel {
  return edit(m, c => c.id === id, c => ({ ...c, status: 'stuck', finishedAt: now }))
}

export function dropCard(m: DockModel, id: string): DockModel {
  return { ...m, cards: m.cards.filter(c => c.id !== id) }
}

export function bindAgent(m: DockModel, id: string, agentId: string, now: number): DockModel {
  const isDone = m.doneAgents.includes(agentId)
  return edit(m, c => c.id === id, c => ({
    ...c,
    agentId,
    ...(isDone && c.status !== 'stuck' ? { status: 'done' as const, percent: 100, finishedAt: now } : {}),
  }))
}

export function finishCard(m: DockModel, id: string, now: number): DockModel {
  return edit(m, c => c.id === id && c.status !== 'stuck', c => ({ ...c, status: 'done', percent: 100, finishedAt: now }))
}

export function applyStop(m: DockModel, agentId: string, now: number): DockModel {
  if (!m.cards.some(c => c.agentId === agentId)) {
    return m.doneAgents.includes(agentId) ? m : { ...m, doneAgents: [...m.doneAgents, agentId] }
  }
  return edit(m, c => c.agentId === agentId && c.status !== 'stuck', c => ({ ...c, status: 'done', percent: 100, finishedAt: now }))
}

export function applyReport(m: DockModel, agentId: string, percent: number): DockModel {
  const p = Math.max(0, Math.min(100, Math.round(Number.isFinite(percent) ? percent : 0)))
  let at = m.cards.findIndex(c => c.agentId === agentId)
  if (at < 0) at = m.cards.findIndex(c => c.status === 'working' && c.agentId === null)
  if (at < 0) return m
  return {
    ...m,
    cards: m.cards.map((c, i) => (i === at ? { ...c, agentId, percent: p, hasReported: true } : c)),
  }
}

/** Stamps or clears the finish time as the cards settle. */
export function settle(m: DockModel, now: number): DockModel {
  const phase = phaseOf(m.cards)
  if (phase === 'complete' && m.finishedAt === null) return { ...m, finishedAt: now }
  if (phase !== 'complete' && m.finishedAt !== null) return { ...m, finishedAt: null }
  return m
}
