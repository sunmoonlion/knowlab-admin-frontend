'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type {
  AdminDraft,
  AdminRequest,
  CaseResult,
  Question,
  RequestDetail,
} from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import {
  createDraft,
  draftAction,
  fetchDrafts,
  fetchQuestions,
  fetchRequestDetail,
  fetchRequests,
  reviewRules,
  startTest,
} from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

import { OpenQuestions } from './open-questions'

const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
const KEY = ['admin', 'knowbots'] as const

type Translate = ReturnType<typeof useTranslations<'knowbots'>>

function problem(error: unknown): string {
  return error instanceof ApiClientError ? error.problem.code : 'unexpected'
}

/** 读不出来时说为什么：没有管理权限（403）要换账号，别的才是「刷新再试」（账 134）。 */
function loadFailed(error: unknown, t: Translate): string {
  return error instanceof ApiClientError && error.status === 403
    ? t('noPermission')
    : t('loadFailed')
}

// 一个想法走到哪一步：没有草稿、待核出处、待发起、测试中、没过、过了待交付、已交付
type Stage = 'none' | 'review' | 'start' | 'testing' | 'failed' | 'passed' | 'delivered'
const FILTERS = ['all', 'todo', 'testing', 'failed', 'delivered'] as const
type Filter = (typeof FILTERS)[number]
// 列表里谁排前面：有人等着回答的、在跑的、要我们动手的，最后是做完的
const RANK: Record<Stage, number> = {
  testing: 1,
  passed: 2,
  review: 3,
  start: 3,
  none: 4,
  failed: 5,
  delivered: 6,
}

function stageOf(draft: AdminDraft | undefined): Stage {
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

function newestFirst(a: AdminDraft, b: AdminDraft): number {
  return Number(b.version) - Number(a.version) || b.revision - a.revision
}

type Item = {
  request: AdminRequest
  drafts: AdminDraft[] // 新的在前
  latest: AdminDraft | undefined
  stage: Stage
  questions: Question[]
}

function matches(item: Item, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'todo')
    return item.questions.length > 0 || ['none', 'review', 'start', 'passed'].includes(item.stage)
  return item.stage === filter
}

// 专家草稿（SDD 0027）：左边是用户的提交，右边一次只看一个想法——下一步要做的事、
// 测试结果、待回答的问题都在最上面，方法原文、用例、数据、规则出处、历次草稿放在页签里。
// 我们的运营在这里建草稿、逐条核规则出处（C-L1）、发起测试、刷新结果（通过即交付 knowmart）。
export function KnowbotDrafts({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbots')
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const requests = useQuery({ queryKey: [...KEY, 'requests'], queryFn: fetchRequests })
  const drafts = useQuery({ queryKey: [...KEY, 'drafts'], queryFn: () => fetchDrafts(null) })
  const questions = useQuery({ queryKey: [...KEY, 'questions'], queryFn: fetchQuestions })
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: KEY })
  // 运营点了只有 admin 能做的（建草稿、核出处、交付、退回）：说清楚，不只给代码
  const onError = (error: unknown) =>
    setFailed(
      error instanceof ApiClientError && error.status === 403
        ? t('adminOnly')
        : t('actionFailed', { code: problem(error) }),
    )
  const onDone = () => {
    setFailed(null)
    return refreshAll()
  }

  const loadError = requests.error ?? drafts.error
  const items: Item[] =
    requests.data && drafts.data
      ? requests.data
          .map((request) => {
            const mine = drafts.data.filter((d) => d.request_id === request.request_id)
            mine.sort(newestFirst)
            const ids = new Set(mine.map((d) => d.draft_id))
            return {
              request,
              drafts: mine,
              latest: mine[0],
              stage: stageOf(mine[0]),
              questions: (questions.data ?? []).filter((q) => ids.has(q.draft_id)),
            }
          })
          .sort(
            (a, b) =>
              (a.questions.length ? 0 : RANK[a.stage]) - (b.questions.length ? 0 : RANK[b.stage]) ||
              (b.request.created_at ?? '').localeCompare(a.request.created_at ?? ''),
          )
      : []
  const shown = items.filter((i) => matches(i, filter))
  const current = items.find((i) => i.request.request_id === picked) ?? shown[0] ?? items[0] ?? null

  return (
    <div className="mt-6 space-y-4">
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      {loadError ? (
        <p className="text-destructive text-sm">{loadFailed(loadError, t)}</p>
      ) : requests.isPending || drafts.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRequests')}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside aria-label={t('requestsTitle')} className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filter')}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    filter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent',
                  )}
                >
                  {t(`filters.${f}`)} · {items.filter((i) => matches(i, f)).length}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('noMatch')}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((item) => (
                  <li key={item.request.request_id}>
                    <RequestRow
                      item={item}
                      selected={item.request.request_id === current?.request.request_id}
                      onPick={() => setPicked(item.request.request_id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {current ? (
            <Workspace
              key={current.request.request_id}
              item={current}
              csrfToken={csrfToken}
              onDone={onDone}
              onError={onError}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function RequestRow({
  item,
  selected,
  onPick,
}: {
  item: Item
  selected: boolean
  onPick: () => void
}) {
  const t = useTranslations('knowbots')
  const { request, latest, stage, questions } = item
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
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium">{request.title}</span>
        <StageBadge stage={stage} />
      </span>
      <span
        className="text-muted-foreground mt-1 block truncate text-xs"
        title={request.owner_subject}
      >
        {t('owner', { owner: request.owner_subject })}
      </span>
      {latest || questions.length > 0 ? (
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {latest ? t('draft', { version: latest.version, revision: latest.revision }) : null}
          {questions.length > 0 ? (
            <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
              {t('questionsWaiting', { n: questions.length })}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  )
}

const BADGE: Record<Stage, string> = {
  none: 'bg-muted text-muted-foreground',
  review: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  start: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  testing: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  failed: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  passed: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  delivered: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
}

function StageBadge({ stage }: { stage: Stage }) {
  const t = useTranslations('knowbots')
  return (
    <span
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', BADGE[stage])}
    >
      {t(`stage.${stage}`)}
    </span>
  )
}

type CardProps = {
  csrfToken: string
  onDone: () => Promise<unknown>
  onError: (error: unknown) => void
}

const STEPS = ['create', 'review', 'test', 'deliver'] as const
const STEP_AT: Record<Stage, number> = {
  none: 0,
  review: 1,
  start: 2,
  testing: 2,
  failed: 2,
  passed: 3,
  delivered: 4,
}

function Workspace({ item, csrfToken, onDone, onError }: CardProps & { item: Item }) {
  const t = useTranslations('knowbots')
  const { request, latest, stage, questions } = item
  const detail = useQuery({
    queryKey: [...KEY, 'request', request.request_id],
    queryFn: () => fetchRequestDetail(request.request_id),
  })
  const at = STEP_AT[stage]
  return (
    <section aria-label={request.title} className="min-w-0 space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{request.title}</h2>
          <StageBadge stage={stage} />
        </div>
        <p className="text-muted-foreground text-sm break-all">
          {t('meta', { owner: request.owner_subject, runtime: request.runtime })}
          {latest ? ` · ${t('draft', { version: latest.version, revision: latest.revision })}` : ''}
        </p>
        <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label={t('progress')}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span
                aria-current={i === at ? 'step' : undefined}
                className={cn(
                  'rounded-full border px-2.5 py-1',
                  i < at && 'border-emerald-300 text-emerald-800 dark:text-emerald-300',
                  i === at &&
                    (stage === 'failed'
                      ? 'border-red-400 font-medium text-red-800 dark:text-red-300'
                      : 'border-primary bg-primary text-primary-foreground font-medium'),
                  i > at && 'text-muted-foreground',
                )}
              >
                {i < at ? '✓ ' : ''}
                {t(`steps.${s}`)}
              </span>
              {i < STEPS.length - 1 ? <span className="text-muted-foreground">→</span> : null}
            </li>
          ))}
        </ol>
      </header>
      {/* 没过：先看为什么没过，再在下面建下一稿 */}
      {stage === 'failed' && latest?.report ? <Report draft={latest} /> : null}
      <NextStep
        draft={latest}
        stage={stage}
        requestId={request.request_id}
        csrfToken={csrfToken}
        onDone={onDone}
        onError={onError}
      />
      <OpenQuestions questions={questions} csrfToken={csrfToken} />
      {stage !== 'failed' && latest?.report ? <Report draft={latest} /> : null}
      {detail.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : detail.isError ? (
        <p className="text-destructive text-sm">{loadFailed(detail.error, t)}</p>
      ) : (
        <Reference detail={detail.data} drafts={item.drafts} />
      )}
    </section>
  )
}

/** 现在该做的那一件事，连同要填的、要看的，都在这一张卡片里。 */
function NextStep({
  draft,
  stage,
  requestId,
  csrfToken,
  onDone,
  onError,
}: CardProps & { draft: AdminDraft | undefined; stage: Stage; requestId: string }) {
  const t = useTranslations('knowbots')
  const [again, setAgain] = useState(false)
  const title = stage === 'delivered' && again ? t('next.revise') : t(`next.${stage}`)
  return (
    <div className="bg-card rounded-xl border p-4 text-sm shadow-sm">
      <h3 className="font-medium">{title}</h3>
      {draft?.last_error ? <p className="text-destructive mt-1">{draft.last_error}</p> : null}
      <div className="mt-3">
        {stage === 'none' || stage === 'failed' || (stage === 'delivered' && again) ? (
          <ManifestForm
            requestId={requestId}
            csrfToken={csrfToken}
            onDone={onDone}
            onError={onError}
          />
        ) : stage === 'delivered' ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground">
              {draft?.knowbot_id
                ? t('deliveredAs', { id: draft.knowbot_id })
                : t('stage.delivered')}
            </p>
            <button type="button" className="secondary-button" onClick={() => setAgain(true)}>
              {t('reviseButton')}
            </button>
          </div>
        ) : draft ? (
          <DraftActions
            draft={draft}
            stage={stage}
            csrfToken={csrfToken}
            onDone={onDone}
            onError={onError}
          />
        ) : null}
      </div>
    </div>
  )
}

function DraftActions({
  draft,
  stage,
  csrfToken,
  onDone,
  onError,
}: CardProps & { draft: AdminDraft; stage: Stage }) {
  const t = useTranslations('knowbots')
  const format = useFormatter()
  const [budget, setBudget] = useState('20')
  const [timeout, setTimeoutSeconds] = useState('1800')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (stage !== 'testing') return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [stage])
  const act = useMutation({
    mutationFn: async (action: 'review' | 'test' | 'refresh' | 'deliver' | 'reset') => {
      if (action === 'review') return reviewRules(draft.draft_id, csrfToken)
      if (action === 'test')
        return startTest(
          draft.draft_id,
          { budget_limit: budget, timeout_seconds: Number(timeout) },
          csrfToken,
        )
      return draftAction(draft.draft_id, action, csrfToken)
    },
    onSuccess: (_, action) => {
      if (action === 'refresh') {
        setRefreshedAt(new Date())
        setNow(Date.now())
      }
      return onDone()
    },
    onError,
  })
  const busy = act.isPending

  if (stage === 'review')
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">{t('reviewHint')}</p>
        <RuleSources draft={draft} />
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => act.mutate('review')}
        >
          {t('review')}
        </button>
      </div>
    )
  if (stage === 'start')
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          {t('reviewedBy', { who: draft.rules_reviewed_by ?? '' })}
          {draft.run_attempts > 0 ? ` · ${t('attempts', { n: draft.run_attempts })}` : ''}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-40">
            {t('budget')}
            <input className={FIELD} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="w-40">
            {t('timeout')}
            <input
              className={FIELD}
              inputMode="numeric"
              value={timeout}
              onChange={(e) => setTimeoutSeconds(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('test')}
          >
            {t('startTest')}
          </button>
        </div>
        <p className="text-muted-foreground text-xs">{t('startHint')}</p>
      </div>
    )
  if (stage === 'testing') {
    // 开跑时间以运行方的为准；运行方还没开跑（已受理）就照说，不拿提交时间冒充（账 136 第 ②）
    const running = draft.run_running_since ? new Date(draft.run_running_since) : null
    const submitted = draft.run_started_at ? new Date(draft.run_started_at) : null
    const when = (at: Date) => format.dateTime(at, { dateStyle: 'short', timeStyle: 'short' })
    const queued = draft.progress?.queued_behind
    return (
      <div className="space-y-3">
        <p>
          {draft.run_status === 'accepted'
            ? t('acceptedWaiting')
            : running
              ? t('runningSince', {
                  at: when(running),
                  minutes: Math.max(0, Math.floor((now - running.getTime()) / 60_000)),
                })
              : submitted
                ? t('submittedAt', { at: when(submitted) })
                : t('stage.testing')}
          {draft.run_attempts > 0 ? ` · ${t('attempts', { n: draft.run_attempts })}` : ''}
        </p>
        {draft.progress ? (
          <p className="font-medium" aria-label={t('progressNow')}>
            {queued
              ? t('queuedLine', {
                  case: draft.progress.case_id,
                  done: draft.progress.cases_done + 1,
                  total: draft.progress.cases_total,
                })
              : t('progressLine', {
                  case: draft.progress.case_id,
                  done: draft.progress.cases_done + 1,
                  total: draft.progress.cases_total,
                  step: draft.progress.step,
                  steps: draft.progress.steps_total,
                  title: draft.progress.step_title,
                  attempt: draft.progress.attempt,
                })}
            {' · '}
            {t('spentSoFar', {
              amount: format.number(Number(draft.progress.spent), { maximumFractionDigits: 2 }),
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('refresh')}
          >
            {t('refresh')}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => act.mutate('reset')}
          >
            {t('reset')}
          </button>
          {refreshedAt ? (
            <span className="text-muted-foreground text-xs">
              {t('refreshedAt', { at: format.dateTime(refreshedAt, { timeStyle: 'medium' }) })}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">{t('testingHint')}</p>
      </div>
    )
  }
  // 过了但交付没成功
  return (
    <button
      type="button"
      className="primary-button"
      disabled={busy}
      onClick={() => act.mutate('deliver')}
    >
      {t('deliver')}
    </button>
  )
}

function ManifestForm({
  requestId,
  csrfToken,
  onDone,
  onError,
}: CardProps & { requestId: string }) {
  const t = useTranslations('knowbots')
  const [manifest, setManifest] = useState('')
  const [badJson, setBadJson] = useState(false)
  const create = useMutation({
    mutationFn: (doc: unknown) => createDraft(requestId, doc, csrfToken),
    onSuccess: async () => {
      setManifest('')
      await onDone()
    },
    onError,
  })
  return (
    <div className="space-y-3">
      <label className="block">
        {t('manifest')}
        <textarea
          className={`${FIELD} font-mono text-xs`}
          rows={8}
          value={manifest}
          onChange={(e) => {
            setBadJson(false)
            setManifest(e.target.value)
          }}
        />
      </label>
      {badJson ? (
        <p className="text-destructive" role="alert">
          {t('badJson')}
        </p>
      ) : null}
      <button
        type="button"
        className="primary-button"
        disabled={!manifest.trim() || create.isPending}
        onClick={() => {
          let doc: unknown
          try {
            doc = JSON.parse(manifest)
          } catch {
            setBadJson(true)
            return
          }
          create.mutate(doc)
        }}
      >
        {t('createDraft')}
      </button>
    </div>
  )
}

function Report({ draft }: { draft: AdminDraft }) {
  const t = useTranslations('knowbots')
  const format = useFormatter()
  const report = draft.report
  if (!report) return null
  return (
    <section className="bg-card rounded-xl border p-4 text-sm shadow-sm" aria-label={t('report')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {t('report')} · {t('draft', { version: draft.version, revision: draft.revision })}
        </h3>
        <p className="text-muted-foreground text-xs">
          {/* 跑着的时候结果里的花费只算跑完的用例（常是 0），不显示；跑到哪、花了多少看上面的进度 */}
          {report.cost && report.finished_at
            ? t('spent', {
                amount: format.number(Number(report.cost.spent), { maximumFractionDigits: 2 }),
              })
            : null}
          {report.cost && report.finished_at ? ' · ' : null}
          {report.finished_at
            ? t('finishedAt', {
                at: format.dateTime(new Date(report.finished_at), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })
            : null}
        </p>
      </div>
      {report.cases.length === 0 ? (
        <p className="text-muted-foreground mt-2">{t('noCaseYet')}</p>
      ) : (
        <ul className="mt-3 divide-y" aria-label={t('report')}>
          {report.cases.map((c) => (
            <CaseLine key={c.case_id} c={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

const CASE_TONE: Record<CaseResult['status'], string> = {
  passed: 'text-emerald-700 dark:text-emerald-400',
  failed: 'text-red-700 dark:text-red-400',
  needs_human: 'text-amber-700 dark:text-amber-400',
  error: 'text-red-700 dark:text-red-400',
}

function CaseLine({ c }: { c: CaseResult }) {
  const t = useTranslations('knowbots')
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <p>
        <span className="font-mono">{c.case_id}</span> ·{' '}
        <span className={cn('font-medium', CASE_TONE[c.status])}>
          {t(`caseStatus.${c.status}`)}
        </span>
        {c.expectations.length > 0
          ? ` · ${t('expectationsMet', { met: c.expectations.filter(Boolean).length, total: c.expectations.length })}`
          : ''}
      </p>
      {c.steps
        .filter((s) => !s.accepted)
        .map((s) => (
          <div key={s.step_id} className="text-muted-foreground mt-1">
            <p>{t('failedStep', { step: s.step_id, checks: s.failed_checks.join('、') || '—' })}</p>
            {s.details?.length ? (
              <ul className="list-disc pl-5 text-xs">
                {s.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      {c.note ? <p className="text-muted-foreground mt-1">{c.note}</p> : null}
    </li>
  )
}

function RuleSources({ draft }: { draft: AdminDraft }) {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      {draft.rule_sources.map((s, i) => (
        <li key={i}>
          {s.rule} — {s.source}：{s.ref}
        </li>
      ))}
    </ol>
  )
}

const TABS = ['method', 'cases', 'datasets', 'rules', 'answered', 'history'] as const
type Tab = (typeof TABS)[number]

/** 要对照着看的东西：一次看一页，不往下堆。 */
function Reference({ detail, drafts }: { detail: RequestDetail; drafts: AdminDraft[] }) {
  const t = useTranslations('knowbots')
  const [tab, setTab] = useState<Tab>('method')
  const latest = drafts[0]
  const count: Partial<Record<Tab, number>> = {
    cases: detail.cases.length,
    datasets: detail.datasets.length,
    rules: latest?.rule_sources.length ?? 0,
    answered: detail.answered.length,
    history: drafts.length,
  }
  return (
    <section className="bg-card rounded-xl border text-sm shadow-sm">
      <div
        role="tablist"
        aria-label={t('reference')}
        className="flex flex-wrap gap-1 border-b px-2 pt-2"
      >
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`kb-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`kb-panel-${k}`}
            onClick={() => setTab(k)}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-3 py-2',
              tab === k ? 'border-primary font-medium' : 'text-muted-foreground border-transparent',
            )}
          >
            {t(`tabs.${k}`)}
            {count[k] !== undefined ? ` · ${count[k]}` : ''}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`kb-panel-${tab}`} aria-labelledby={`kb-tab-${tab}`} className="p-4">
        {tab === 'method' ? <Method detail={detail} /> : null}
        {tab === 'cases' ? <Cases cases={detail.cases} /> : null}
        {tab === 'datasets' ? <Datasets detail={detail} /> : null}
        {tab === 'rules' ? (
          latest ? (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                {latest.rules_reviewed_by
                  ? t('reviewedBy', { who: latest.rules_reviewed_by })
                  : t('notReviewed')}
              </p>
              <RuleSources draft={latest} />
            </div>
          ) : (
            <p className="text-muted-foreground">{t('noDraftYet')}</p>
          )
        ) : null}
        {tab === 'answered' ? <Answered detail={detail} /> : null}
        {tab === 'history' ? <History drafts={drafts} /> : null}
      </div>
    </section>
  )
}

function Method({ detail }: { detail: RequestDetail }) {
  const t = useTranslations('knowbots')
  const { idea } = detail
  if (idea.kind === 'skill')
    return (
      <pre className="bg-muted overflow-x-auto rounded-md p-3 whitespace-pre-wrap">
        {idea.skill}
      </pre>
    )
  return (
    <dl className="space-y-3">
      {(Object.keys(idea.answers) as (keyof typeof idea.answers)[]).map((k) => (
        <div key={k}>
          <dt className="text-muted-foreground">{t(`q.${k}`)}</dt>
          <dd className="whitespace-pre-wrap">{idea.answers[k]}</dd>
        </div>
      ))}
    </dl>
  )
}

type Expectation = {
  artifact?: unknown
  path?: unknown
  kind?: unknown
  value?: unknown
  tolerance?: unknown
}

function caseShape(raw: Record<string, unknown>) {
  const input = (raw.input ?? {}) as { question?: unknown }
  const expectations = Array.isArray(raw.expectations) ? (raw.expectations as Expectation[]) : []
  return {
    id: String(raw.case_id ?? ''),
    question: typeof input.question === 'string' ? input.question : null,
    expectations,
  }
}

function Cases({ cases }: { cases: RequestDetail['cases'] }) {
  const t = useTranslations('knowbots')
  if (cases.length === 0) return <p className="text-muted-foreground">{t('noCases')}</p>
  return (
    <ul className="space-y-4">
      {cases.map((raw, i) => {
        const c = caseShape(raw)
        return (
          <li key={c.id || i}>
            <p>
              <span className="font-mono">{c.id}</span>
              {c.question ? ` · ${c.question}` : ''}
            </p>
            {c.expectations.length > 0 ? (
              <table className="mt-1 w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-2 font-normal">{t('expect.where')}</th>
                    <th className="py-1 pr-2 font-normal">{t('expect.how')}</th>
                    <th className="py-1 pr-2 font-normal">{t('expect.value')}</th>
                    <th className="py-1 font-normal">{t('expect.tolerance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.expectations.map((e, j) => (
                    <tr key={j} className="border-t">
                      <td className="py-1 pr-2 font-mono break-all">
                        {String(e.artifact ?? '')} / {String(e.path ?? '')}
                      </td>
                      <td className="py-1 pr-2">{String(e.kind ?? '')}</td>
                      <td className="py-1 pr-2 break-all">{String(e.value ?? '')}</td>
                      <td className="py-1">{e.tolerance == null ? '—' : String(e.tolerance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function Datasets({ detail }: { detail: RequestDetail }) {
  const t = useTranslations('knowbots')
  const { datasets } = detail
  if (datasets.length === 0) return <p className="text-muted-foreground">{t('noDatasets')}</p>
  const bindings = datasets.map((d) => ({
    dataset_id: d.dataset_id,
    version: d.version,
    sha256: d.sha256,
  }))
  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {datasets.map((d) => (
          <li key={d.dataset_id} className="font-mono text-xs break-all">
            {d.name} ·{' '}
            {JSON.stringify({ dataset_id: d.dataset_id, version: d.version, sha256: d.sha256 })}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t('bindingsHint')}</p>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
        {JSON.stringify(bindings, null, 2)}
      </pre>
    </div>
  )
}

function Answered({ detail }: { detail: RequestDetail }) {
  const t = useTranslations('knowbots')
  if (detail.answered.length === 0)
    return <p className="text-muted-foreground">{t('noAnswered')}</p>
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">{t('answeredTitle')}</p>
      <ul className="space-y-1">
        {detail.answered.map((a) => (
          <li key={a.question_id}>
            {a.text} → {a.answer?.text ?? a.answer?.option_id ?? a.answer?.decision} ·{' '}
            {a.answered_by === 'user'
              ? t('answeredBy.user')
              : a.route_reason
                ? t('answeredBy.operatorWhy', { reason: a.route_reason })
                : t('answeredBy.operator')}
          </li>
        ))}
      </ul>
    </div>
  )
}

function History({ drafts }: { drafts: AdminDraft[] }) {
  const t = useTranslations('knowbots')
  if (drafts.length === 0) return <p className="text-muted-foreground">{t('noDraftYet')}</p>
  return (
    <ul className="divide-y">
      {drafts.map((d) => {
        const cases = d.report?.cases ?? []
        return (
          <li key={d.draft_id} className="py-2 first:pt-0 last:pb-0">
            <p>
              {t('draft', { version: d.version, revision: d.revision })} · {t(`status.${d.status}`)}
              {d.run_attempts > 0 ? ` · ${t('attempts', { n: d.run_attempts })}` : ''}
              {cases.length > 0
                ? ` · ${t('casesPassed', { met: cases.filter((c) => c.status === 'passed').length, total: cases.length })}`
                : ''}
            </p>
            {d.last_error ? <p className="text-destructive text-xs">{d.last_error}</p> : null}
            {cases.length > 0 ? (
              <details className="mt-1">
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  {t('showReport')}
                </summary>
                <ul className="mt-1 divide-y">
                  {cases.map((c) => (
                    <CaseLine key={c.case_id} c={c} />
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
