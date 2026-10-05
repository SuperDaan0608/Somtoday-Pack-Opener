export type ChecklistTaskStatus = 'done' | 'active' | 'upcoming'

export type ChecklistTask = {
  id: string
  name: string
  status: ChecklistTaskStatus
  percent: number
  hasReported: boolean
}

export type ChecklistPhase = 'idle' | 'working' | 'needs-you' | 'stuck' | 'stopped' | 'done'

export type Checklist = {
  title: string
  phase: ChecklistPhase
  tasks: ChecklistTask[]
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number | null
  finishedAt: number | null
  isCollapsed: boolean
}

export type DockCardStatus = 'queued' | 'working' | 'done' | 'stuck'

export type DockCard = {
  id: string
  agentId: string | null
  task: string
  status: DockCardStatus
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

declare module 'claude-code' {
  interface PluginState {
    'clean-view': { cleanViewEnabled: boolean; checklist: Checklist; tick: number; dock: DockModel; dockTick: number }
  }
}
