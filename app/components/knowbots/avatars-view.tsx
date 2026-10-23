'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { AdminDraft, RequestDetail } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import {
  createDraft,
  draftAction,
  fetchRequestDetail,
  reviewRules,
  startTest,
} from '@/lib/knowbots/client'

import { OpenQuestions } from './open-questions'
import { TestOutputs } from './outputs'
import {
  Amendments,
  Answered,
  Cases,
  Datasets,
  History,
  ManifestText,
  Method,
  Report,
  RuleSources,
  Rules,
} from './reference'
import {
  DRAFT_TODO,
  FIELD,
  Filters,
  KEY,
  Progress,
  Row,
  StageBadge,
  loadFailed,
  useFeedback,
  useKnowbots,
  type Avatar,
  type CardProps,
  type Idea,
  type Stage,
} from './shared'
import { SidePanel, type PanelTab } from './side-panel'

// 分身（SDD 0037）：一个分身一生四段——孵化、核出处、测试、交付，都在这一页。
// 孵化现在只有手工孵化（贴专家清单）；以后的辅助、自动孵化，出处表、缺口、清单候选各版都加进「孵化」这一块。

const FILTERS = ['all', 'todo', 'testing', 'failed', 'delivered'] as const
type Filter = (typeof FILTERS)[number]

// 列表里谁排前面：有问题等我们答的、在跑的、要我们动手的，最后是做完的与旧的
function rank(a: Avatar): number {
  if (a.questions.some((q) => q.route !== 'user')) return 0
  if (a.stage === 'testing') return 1
  if (a.latest && DRAFT_TODO.includes(a.stage)) return 2
  return a.latest ? 3 : 4
}

function matches(a: Avatar, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'todo') return rank(a) === 0 || rank(a) === 2
  return a.stage === filter
}

const STEP_AT: Record<Stage, number> = {
  none: 0,
  review: 1,
  start: 2,
  testing: 2,
  failed: 2,
  passed: 3,
  delivered: 4,
}

export function AvatarsView({
  csrfToken,
  picked: initialPick,
  hatchFor,
  canRelease = true,
}: {
  csrfToken: string
  picked?: string
  hatchFor?: string
  canRelease?: boolean
}) {
  const t = useTranslations('knowbots')
  const { ideas, avatars, error, pending } = useKnowbots()
  const { failed, onError, onDone } = useFeedback()
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  // 正在孵化哪个创意（null = 没在孵化）
  const [hatching, setHatching] = useState<string | null>(hatchFor ?? null)

  const sorted = [...avatars].sort((a, b) => rank(a) - rank(b))
  const shown = sorted.filter((a) => matches(a, filter))
  const current = sorted.find((a) => a.draft.draft_id === picked) ?? shown[0] ?? sorted[0] ?? null

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {failed ? (
          <p className="text-destructive text-sm" role="alert">
            {failed}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="primary-button"
          disabled={ideas.length === 0}
          onClick={() =>
            setHatching(current?.draft.request_id ?? ideas[0]?.request.request_id ?? null)
          }
        >
          {t('hatch.button')}
        </button>
      </div>
      {error ? (
        <p className="text-destructive text-sm">{loadFailed(error, t)}</p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside aria-label={t('avatarsTitle')} className="w-full space-y-3 lg:w-72 lg:shrink-0">
            <Filters
              filters={FILTERS}
              value={filter}
              onChange={setFilter}
              count={(f) => sorted.filter((a) => matches(a, f)).length}
              label={t('filter')}
              name={(f) => t(`filters.${f}`)}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {avatars.length === 0 ? t('noAvatars') : t('noMatch')}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map((a) => (
                  <li key={a.draft.draft_id}>
                    <Row
                      selected={!hatching && a.draft.draft_id === current?.draft.draft_id}
                      onPick={() => {
                        setHatching(null)
                        setPicked(a.draft.draft_id)
                      }}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-medium">
                          {t('draft', { version: a.draft.version, revision: a.draft.revision })}
                        </span>
                        <StageBadge stage={a.stage} />
                      </span>
                      <span className="text-muted-foreground mt-1 block truncate text-xs">
                        {a.draft.title}
                        {a.latest ? '' : ` · ${t('superseded')}`}
                      </span>
                      {a.questions.length > 0 ? (
                        <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">
                          {t('questionsWaiting', { n: a.questions.length })}
                        </span>
                      ) : null}
                    </Row>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {hatching ? (
            <Hatch
              key={hatching}
              ideas={ideas}
              requestId={hatching}
              onPick={setHatching}
              onCancel={() => setHatching(null)}
              onCreated={async (draftId) => {
                await onDone()
                setHatching(null)
                setFilter('all')
                setPicked(draftId)
              }}
              csrfToken={csrfToken}
              canRelease={canRelease}
              onDone={onDone}
              onError={onError}
            />
          ) : current ? (
            <Workspace
              key={current.draft.draft_id}
              avatar={current}
              history={
                ideas.find((i) => i.request.request_id === current.draft.request_id)?.drafts ?? []
              }
              onHatch={setHatching}
              csrfToken={csrfToken}
              canRelease={canRelease}
              onDone={onDone}
              onError={onError}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

/** 这个创意的对照材料：孵化时、看分身时都开在右边。 */
function ideaTabs(
  t: ReturnType<typeof useTranslations<'knowbots'>>,
  detail: RequestDetail,
  props: CardProps,
): PanelTab[] {
  return [
    { key: 'method', label: t('tabs.method'), content: <Method detail={detail} /> },
    {
      key: 'cases',
      label: t('tabs.cases'),
      count: detail.cases.length,
      content: <Cases cases={detail.cases} />,
    },
    {
      key: 'datasets',
      label: t('tabs.datasets'),
      count: detail.datasets.length,
      content: <Datasets detail={detail} />,
    },
    {
      key: 'amendments',
      label: t('tabs.amendments'),
      count: detail.amendments?.length ?? 0,
      content: <Amendments amendments={detail.amendments ?? []} {...props} />,
    },
    {
      key: 'answered',
      label: t('tabs.answered'),
      count: detail.answered.length,
      content: <Answered detail={detail} />,
    },
  ]
}

function useDetail(requestId: string) {
  return useQuery({
    queryKey: [...KEY, 'request', requestId],
    queryFn: () => fetchRequestDetail(requestId),
  })
}

/** 孵化：选创意，现在是手工孵化——贴专家清单、校验、孵出。 */
function Hatch({
  ideas,
  requestId,
  onPick,
  onCancel,
  onCreated,
  ...props
}: CardProps & {
  ideas: Idea[]
  requestId: string
  onPick: (id: string) => void
  onCancel: () => void
  onCreated: (draftId: string) => Promise<void>
}) {
  const t = useTranslations('knowbots')
  const detail = useDetail(requestId)
  return (
    <>
      <section aria-label={t('hatch.title')} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-2">
          <h2 className="text-lg font-semibold">{t('hatch.title')}</h2>
          <Progress
            steps={['hatch', 'review', 'test', 'deliver'].map((s) => t(`steps.${s}`))}
            at={0}
            label={t('progress')}
          />
        </header>
        <div className="bg-card space-y-3 rounded-xl border p-4 text-sm shadow-sm">
          <label className="block">
            {t('hatch.pick')}
            <select className={FIELD} value={requestId} onChange={(e) => onPick(e.target.value)}>
              {ideas.map((i) => (
                <option key={i.request.request_id} value={i.request.request_id}>
                  {i.request.title} · {i.request.owner_subject}
                </option>
              ))}
            </select>
          </label>
          <h3 className="font-medium">{t('hatch.manual')}</h3>
          <p className="text-muted-foreground">{t('hatch.hint')}</p>
          <ManifestForm requestId={requestId} onCreated={onCreated} {...props} />
          <button type="button" className="secondary-button" onClick={onCancel}>
            {t('hatch.cancel')}
          </button>
        </div>
      </section>
      {detail.data ? (
        <SidePanel label={t('reference')} tabs={ideaTabs(t, detail.data, props)} />
      ) : null}
    </>
  )
}

function ManifestForm({
  requestId,
  csrfToken,
  onCreated,
  onError,
}: CardProps & { requestId: string; onCreated: (draftId: string) => Promise<void> }) {
  const t = useTranslations('knowbots')
  const [manifest, setManifest] = useState('')
  const [badJson, setBadJson] = useState(false)
  const create = useMutation({
    mutationFn: (doc: unknown) => createDraft(requestId, doc, csrfToken),
    onSuccess: async (made) => {
      setManifest('')
      await onCreated(made.draft_id)
    },
    onError,
  })
  return (
    <div className="space-y-3">
      <label className="block">
        {t('manifest')}
        <textarea
          className={`${FIELD} font-mono text-xs`}
          rows={10}
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

function Workspace({
  avatar,
  history,
  onHatch,
  ...props
}: CardProps & { avatar: Avatar; history: AdminDraft[]; onHatch: (requestId: string) => void }) {
  const t = useTranslations('knowbots')
  const { draft, stage, questions } = avatar
  const detail = useDetail(draft.request_id)
  const tabs: PanelTab[] = [
    {
      key: 'rules',
      label: t('tabs.rules'),
      count: draft.rule_sources.length,
      content: <Rules draft={draft} />,
    },
    {
      key: 'manifest',
      label: t('tabs.manifest'),
      content: <ManifestText draftId={draft.draft_id} />,
    },
    ...(detail.data ? ideaTabs(t, detail.data, props) : []),
    {
      key: 'history',
      label: t('tabs.history'),
      count: history.length,
      content: <History drafts={history} />,
    },
  ]
  return (
    <>
      <section aria-label={draft.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {t('draft', { version: draft.version, revision: draft.revision })} · {draft.title}
            </h2>
            <StageBadge stage={stage} />
          </div>
          <p className="text-muted-foreground text-sm break-all">
            {t('meta', { owner: draft.owner_subject, runtime: draft.runtime })} ·{' '}
            <Link
              href={{ pathname: '/ideas', query: { request: draft.request_id } }}
              className="underline underline-offset-2"
            >
              {t('toIdea')}
            </Link>
          </p>
          <Progress
            steps={['hatch', 'review', 'test', 'deliver'].map((s) => t(`steps.${s}`))}
            at={STEP_AT[stage]}
            bad={stage === 'failed'}
            label={t('progress')}
          />
        </header>
        {/* 没过：先看为什么没过、交回了什么，再孵化下一个 */}
        {stage === 'failed' && draft.report ? <Report draft={draft} /> : null}
        {stage === 'failed' ? <TestOutputs draft={draft} {...props} /> : null}
        <NextStep avatar={avatar} onHatch={onHatch} {...props} />
        <OpenQuestions questions={questions} csrfToken={props.csrfToken} />
        {stage !== 'failed' && draft.report ? <Report draft={draft} /> : null}
        {stage !== 'failed' ? <TestOutputs draft={draft} {...props} /> : null}
        {detail.isError ? (
          <p className="text-destructive text-sm">{loadFailed(detail.error, t)}</p>
        ) : null}
      </section>
      <SidePanel label={t('reference')} tabs={tabs} />
    </>
  )
}

/** 现在该做的那一件事，连同要填的、要看的，都在这一张卡片里。 */
function NextStep({
  avatar,
  onHatch,
  ...props
}: CardProps & { avatar: Avatar; onHatch: (requestId: string) => void }) {
  const t = useTranslations('knowbots')
  const { draft, stage, latest } = avatar
  const title =
    !latest && (stage === 'failed' || stage === 'delivered')
      ? t('next.superseded')
      : t(`next.${stage}`)
  return (
    <div className="bg-card rounded-xl border p-4 text-sm shadow-sm">
      <h3 className="font-medium">{title}</h3>
      {draft.last_error ? <p className="text-destructive mt-1">{draft.last_error}</p> : null}
      <div className="mt-3">
        {stage === 'failed' || stage === 'delivered' ? (
          <div className="flex flex-wrap items-center gap-3">
            {stage === 'delivered' ? (
              <p className="text-muted-foreground">
                {draft.knowbot_id
                  ? t('deliveredAs', { id: draft.knowbot_id })
                  : t('stage.delivered')}
              </p>
            ) : null}
            {latest ? (
              <button
                type="button"
                className={stage === 'failed' ? 'primary-button' : 'secondary-button'}
                onClick={() => onHatch(draft.request_id)}
              >
                {stage === 'failed' ? t('hatch.next') : t('reviseButton')}
              </button>
            ) : null}
          </div>
        ) : (
          <DraftActions draft={draft} stage={stage} {...props} />
        )}
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

  // 建这个分身前用户写的补充还没处理：核对出处按不了，后端同样挡（SDD 0035 §二.5）
  const blocking = draft.amendments_open ?? []
  const newer = draft.amendments_newer ?? 0
  const newerLine =
    newer > 0 ? <p className="text-muted-foreground">{t('newerAmendments', { n: newer })}</p> : null
  if (stage === 'review')
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">{t('reviewHint')}</p>
        <RuleSources draft={draft} />
        {blocking.length > 0 ? (
          <div className="text-amber-800 dark:text-amber-300" role="status">
            <p>{t('reviewBlocked')}</p>
            <ul className="list-disc pl-5 font-mono text-xs">
              {blocking.map((id) => (
                <li key={id}>amendment:{id}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {newerLine}
        <button
          type="button"
          className="primary-button"
          disabled={busy || blocking.length > 0}
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
        {newerLine}
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
            ? draft.run_blocked === 'computer_offline'
              ? t('blockedOffline')
              : draft.run_blocked === 'folder_not_ready'
                ? t('blockedFolder')
                : t('acceptedWaiting')
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
        {newerLine}
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
