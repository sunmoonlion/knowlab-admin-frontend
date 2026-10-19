'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { AdminDraft, AdminRequest, Question } from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import { fetchDrafts, fetchQuestions, fetchRequests } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

// 创意、分身、专家三页共用（SDD 0037）：同一份数据（创意、分身、待回答的问题），各页按自己的事排。
export const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
export const KEY = ['admin', 'knowbots'] as const

export type Translate = ReturnType<typeof useTranslations<'knowbots'>>

export function problem(error: unknown): string {
  return error instanceof ApiClientError ? error.problem.code : 'unexpected'
}

/** 读不出来时说为什么：没有管理权限（403）要换账号，别的才是「刷新再试」（账 134）。 */
export function loadFailed(error: unknown, t: Translate): string {
  return error instanceof ApiClientError && error.status === 403
    ? t('noPermission')
    : t('loadFailed')
}

// 一个分身走到哪：待核出处、待发起、测试中、没过、过了待交付、已交付（孵化中的等孵化记录做出来再有）
export type Stage = 'none' | 'review' | 'start' | 'testing' | 'failed' | 'passed' | 'delivered'

export function stageOf(draft: AdminDraft | undefined): Stage {
  if (!draft) return 'none'
  if (draft.status === 'pending_test') return draft.rules_reviewed_by ? 'start' : 'review'
  return draft.status === 'testing'
    ? 'testing'
    : draft.status === 'failed'
      ? 'failed'
      : draft.status === 'passed'
        ? 'passed'
        : 'delivered'
}

export function newestFirst(a: AdminDraft, b: AdminDraft): number {
  return Number(b.version) - Number(a.version) || b.revision - a.revision
}

// 一个创意走到哪（管理端的视角：下一步该谁做什么）
export type IdeaStage = 'amend' | 'hatch' | 'waiting' | 'working' | 'expert'

export type Idea = {
  request: AdminRequest
  drafts: AdminDraft[] // 新的在前
  latest: AdminDraft | undefined
  stage: IdeaStage
  questions: Question[]
}

export type Avatar = {
  draft: AdminDraft
  request: AdminRequest | undefined
  stage: Stage
  latest: boolean // 是这个创意最新的分身（旧的只是历史）
  questions: Question[]
}

function ideaStageOf(request: AdminRequest, latest: AdminDraft | undefined, asks: Question[]) {
  if ((request.amendments ?? []).some((a) => a.status === 'open')) return 'amend'
  const stage = stageOf(latest)
  if (stage === 'none' || stage === 'failed') return 'hatch'
  if (asks.some((q) => q.route === 'user')) return 'waiting'
  return stage === 'delivered' ? 'expert' : 'working'
}

export const DRAFT_TODO: readonly Stage[] = ['review', 'start', 'passed', 'failed']

/** 三页共用的数据：创意、分身、问题。查询键相同，切页不重复取。 */
export function useKnowbots(enabled = true) {
  const requests = useQuery({ queryKey: [...KEY, 'requests'], queryFn: fetchRequests, enabled })
  const drafts = useQuery({
    queryKey: [...KEY, 'drafts'],
    queryFn: () => fetchDrafts(null),
    enabled,
  })
  const questions = useQuery({ queryKey: [...KEY, 'questions'], queryFn: fetchQuestions, enabled })
  const asks = questions.data ?? []
  const ideas: Idea[] = []
  const avatars: Avatar[] = []
  if (requests.data && drafts.data) {
    for (const request of requests.data) {
      const mine = drafts.data.filter((d) => d.request_id === request.request_id)
      mine.sort(newestFirst)
      const ids = new Set(mine.map((d) => d.draft_id))
      const theirs = asks.filter((q) => ids.has(q.draft_id))
      ideas.push({
        request,
        drafts: mine,
        latest: mine[0],
        stage: ideaStageOf(request, mine[0], theirs),
        questions: theirs,
      })
    }
    const byId = new Map(requests.data.map((r) => [r.request_id, r]))
    const latestOf = new Map(ideas.map((i) => [i.request.request_id, i.latest?.draft_id]))
    for (const draft of [...drafts.data].sort(newestFirst)) {
      avatars.push({
        draft,
        request: byId.get(draft.request_id),
        stage: stageOf(draft),
        latest: latestOf.get(draft.request_id) === draft.draft_id,
        questions: asks.filter((q) => q.draft_id === draft.draft_id),
      })
    }
  }
  return {
    ideas,
    avatars,
    error: requests.error ?? drafts.error,
    pending: requests.isPending || drafts.isPending,
  }
}

/** 要我们动手的条数：导航栏与治理控制台用（SDD 0037）。 */
export function todoCounts(ideas: Idea[], avatars: Avatar[]) {
  return {
    ideas: ideas.filter((i) => i.stage === 'amend' || i.stage === 'hatch').length,
    avatars: avatars.filter(
      (a) =>
        (a.latest && DRAFT_TODO.includes(a.stage)) || a.questions.some((q) => q.route !== 'user'),
    ).length,
    experts: avatars.filter((a) => a.stage === 'passed' && a.draft.last_error).length,
  }
}

/** 导航栏上的数：只有能进这三栏的角色才去取（取不到就不显示）。 */
export function useTodoCounts(enabled: boolean) {
  const { ideas, avatars, error, pending } = useKnowbots(enabled)
  return enabled && !error && !pending ? todoCounts(ideas, avatars) : null
}

/** 动作的结果：成了刷新三页共用的数据，没成说为什么（运营点了只有 admin 能做的要说清楚）。 */
export function useFeedback() {
  const t = useTranslations('knowbots')
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState<string | null>(null)
  const onError = (error: unknown) =>
    setFailed(
      error instanceof ApiClientError && error.status === 403
        ? t('adminOnly')
        : t('actionFailed', { code: problem(error) }),
    )
  const onDone = () => {
    setFailed(null)
    return queryClient.invalidateQueries({ queryKey: KEY })
  }
  return { failed, onError, onDone }
}

export type CardProps = {
  csrfToken: string
  onDone: () => Promise<unknown>
  onError: (error: unknown) => void
}

const TONE = {
  muted: 'bg-muted text-muted-foreground',
  todo: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  running: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  bad: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
} as const

export const STAGE_TONE: Record<Stage, keyof typeof TONE> = {
  none: 'muted',
  review: 'todo',
  start: 'todo',
  testing: 'running',
  failed: 'bad',
  passed: 'todo',
  delivered: 'good',
}

export const IDEA_TONE: Record<IdeaStage, keyof typeof TONE> = {
  amend: 'todo',
  hatch: 'todo',
  waiting: 'running',
  working: 'running',
  expert: 'good',
}

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', TONE[tone])}>
      {children}
    </span>
  )
}

export function StageBadge({ stage }: { stage: Stage }) {
  const t = useTranslations('knowbots')
  return <Badge tone={STAGE_TONE[stage]}>{t(`stage.${stage}`)}</Badge>
}

/** 一串步骤，走到第 at 步（从 0 起）；bad 时当前那一步标红。 */
export function Progress({
  steps,
  at,
  bad,
  label,
}: {
  steps: readonly string[]
  at: number
  bad?: boolean
  label: string
}) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'rounded-full border px-2.5 py-1',
              i < at && 'border-emerald-300 text-emerald-800 dark:text-emerald-300',
              i === at &&
                (bad
                  ? 'border-red-400 font-medium text-red-800 dark:text-red-300'
                  : 'border-primary bg-primary text-primary-foreground font-medium'),
              i > at && 'text-muted-foreground',
            )}
          >
            {i < at ? '✓ ' : ''}
            {s}
          </span>
          {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </li>
      ))}
    </ol>
  )
}

/** 左边的筛选：每个筛选带条数。 */
export function Filters<F extends string>({
  filters,
  value,
  onChange,
  count,
  label,
  name,
}: {
  filters: readonly F[]
  value: F
  onChange: (f: F) => void
  count: (f: F) => number
  label: string
  name: (f: F) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs',
            value === f ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
          )}
        >
          {name(f)} · {count(f)}
        </button>
      ))}
    </div>
  )
}

/** 列表里的一行。 */
export function Row({
  selected,
  onPick,
  children,
}: {
  selected: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onPick}
      className={cn(
        'bg-card w-full rounded-lg border p-3 text-left text-sm transition-colors',
        selected ? 'border-primary ring-primary/30 ring-2' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}
