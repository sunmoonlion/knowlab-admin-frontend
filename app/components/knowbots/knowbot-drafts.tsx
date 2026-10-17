'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  DRAFT_STATUSES,
  type AdminDraft,
  type AdminRequest,
  type CaseResult,
  type DraftStatus,
} from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import {
  createDraft,
  draftAction,
  fetchDrafts,
  fetchRequestDetail,
  fetchRequests,
  reviewRules,
  startTest,
} from '@/lib/knowbots/client'

import { OpenQuestions } from './open-questions'

const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
const KEY = ['admin', 'knowbots'] as const

type Translate = ReturnType<typeof useTranslations<'knowbots'>>

function problem(error: unknown): string {
  return error instanceof ApiClientError ? error.problem.code : 'unexpected'
}

/** 读不出来时说为什么：没有管理权限（403）要换账号，别的才是「刷新再试」（账 134）。 */
function loadFailed(error: unknown, t: Translate): string {
  return error instanceof ApiClientError && error.status === 403 ? t('noPermission') : t('loadFailed')
}

// 分身草稿（SDD 0027）：我们的运营在这里看用户的提交与方法原文、建草稿、逐条核规则出处（C-L1）、
// 发起测试（预算上限与超时）、刷新结果（通过即交付 knowmart）、重试交付、把超时的测试退回。
export function KnowbotDrafts({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbots')
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<DraftStatus | null>('pending_test')
  const [failed, setFailed] = useState<string | null>(null)
  const drafts = useQuery({
    queryKey: [...KEY, 'drafts', status],
    queryFn: () => fetchDrafts(status),
  })
  const requests = useQuery({ queryKey: [...KEY, 'requests'], queryFn: fetchRequests })
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: KEY })
  const onError = (error: unknown) => setFailed(t('actionFailed', { code: problem(error) }))

  return (
    <div className="mt-6 space-y-8">
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      <OpenQuestions csrfToken={csrfToken} />
      <section aria-label={t('draftsTitle')} className="space-y-3">
        <h2 className="font-medium">{t('draftsTitle')}</h2>
        <label className="block max-w-xs text-sm">
          {t('filter')}
          <select
            className={FIELD}
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value || null) as DraftStatus | null)}
          >
            <option value="">{t('all')}</option>
            {DRAFT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {drafts.isPending ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : drafts.isError ? (
          <p className="text-destructive text-sm">{loadFailed(drafts.error, t)}</p>
        ) : drafts.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noDrafts')}</p>
        ) : (
          drafts.data.map((d) => (
            <DraftCard
              key={d.draft_id}
              draft={d}
              csrfToken={csrfToken}
              onDone={() => {
                setFailed(null)
                return refreshAll()
              }}
              onError={onError}
            />
          ))
        )}
      </section>
      <section aria-label={t('requestsTitle')} className="space-y-3">
        <h2 className="font-medium">{t('requestsTitle')}</h2>
        {requests.isPending ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : requests.isError ? (
          <p className="text-destructive text-sm">{loadFailed(requests.error, t)}</p>
        ) : requests.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noRequests')}</p>
        ) : (
          requests.data.map((r) => (
            <RequestCard
              key={r.request_id}
              request={r}
              csrfToken={csrfToken}
              onDone={() => {
                setFailed(null)
                return refreshAll()
              }}
              onError={onError}
            />
          ))
        )}
      </section>
    </div>
  )
}

type CardProps = {
  csrfToken: string
  onDone: () => Promise<unknown>
  onError: (error: unknown) => void
}

function DraftCard({ draft, csrfToken, onDone, onError }: CardProps & { draft: AdminDraft }) {
  const t = useTranslations('knowbots')
  const [budget, setBudget] = useState('20')
  const [timeout, setTimeoutSeconds] = useState('1800')
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
    onSuccess: onDone,
    onError,
  })
  const busy = act.isPending
  return (
    <article className="bg-card rounded-xl border p-4 text-sm shadow-sm">
      <h3 className="font-medium">
        {draft.title} · {t('draft', { version: draft.version, revision: draft.revision })}
      </h3>
      <p className="text-muted-foreground">
        {t('meta', { owner: draft.owner_subject, runtime: draft.runtime })} ·{' '}
        {t(`status.${draft.status}`)}
        {draft.run_attempts > 0 ? ` · ${t('attempts', { n: draft.run_attempts })}` : ''}
      </p>
      {draft.last_error ? <p className="text-destructive">{draft.last_error}</p> : null}
      <h4 className="mt-3 font-medium">{t('ruleSources')}</h4>
      <ul className="list-disc pl-5">
        {draft.rule_sources.map((s, i) => (
          <li key={i}>
            {s.rule} — {s.source}：{s.ref}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1">
        {draft.rules_reviewed_by
          ? t('reviewedBy', { who: draft.rules_reviewed_by })
          : t('notReviewed')}
      </p>
      {draft.report ? <Report cases={draft.report.cases} t={t} /> : null}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {draft.status === 'pending_test' && !draft.rules_reviewed_by ? (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('review')}
          >
            {t('review')}
          </button>
        ) : null}
        {draft.status === 'pending_test' && draft.rules_reviewed_by ? (
          <>
            <label>
              {t('budget')}
              <input className={FIELD} value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label>
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
          </>
        ) : null}
        {draft.status === 'testing' ? (
          <>
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
          </>
        ) : null}
        {draft.status === 'passed' ? (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('deliver')}
          >
            {t('deliver')}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function Report({ cases, t }: { cases: CaseResult[]; t: Translate }) {
  return (
    <ul className="mt-3 space-y-1 border-l pl-3" aria-label={t('report')}>
      {cases.map((c) => (
        <li key={c.case_id}>
          {c.case_id} · {t(`caseStatus.${c.status}`)}
          {c.expectations.length > 0
            ? ` · ${t('expectationsMet', { met: c.expectations.filter(Boolean).length, total: c.expectations.length })}`
            : ''}
          {c.steps
            .filter((s) => !s.accepted)
            .map((s) => (
              <p key={s.step_id} className="text-muted-foreground">
                {t('failedStep', { step: s.step_id, checks: s.failed_checks.join('、') || '—' })}
              </p>
            ))}
          {c.note ? <p className="text-muted-foreground">{c.note}</p> : null}
        </li>
      ))}
    </ul>
  )
}

function RequestCard({
  request,
  csrfToken,
  onDone,
  onError,
}: CardProps & { request: AdminRequest }) {
  const t = useTranslations('knowbots')
  const [open, setOpen] = useState(false)
  const latest = request.drafts.at(-1)
  return (
    <article className="bg-card rounded-xl border p-4 text-sm shadow-sm">
      <h3 className="font-medium">{request.title}</h3>
      <p className="text-muted-foreground">
        {t('meta', { owner: request.owner_subject, runtime: request.runtime })} ·{' '}
        {latest ? t(`status.${latest.status}`) : t('noDraftYet')}
      </p>
      <button type="button" className="secondary-button mt-2" onClick={() => setOpen(!open)}>
        {open ? t('hide') : t('open')}
      </button>
      {open ? (
        <RequestDetailPanel
          requestId={request.request_id}
          csrfToken={csrfToken}
          onDone={onDone}
          onError={onError}
        />
      ) : null}
    </article>
  )
}

function RequestDetailPanel({
  requestId,
  csrfToken,
  onDone,
  onError,
}: CardProps & { requestId: string }) {
  const t = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'request', requestId],
    queryFn: () => fetchRequestDetail(requestId),
  })
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
  if (detail.isPending) return <p className="text-muted-foreground mt-2">{t('loading')}</p>
  if (detail.isError) return <p className="text-destructive mt-2">{loadFailed(detail.error, t)}</p>
  const { idea, cases, datasets, answered } = detail.data
  return (
    <div className="mt-3 space-y-3">
      <h4 className="font-medium">{t('method')}</h4>
      {idea.kind === 'skill' ? (
        <pre className="bg-muted overflow-x-auto rounded-md p-3 whitespace-pre-wrap">
          {idea.skill}
        </pre>
      ) : (
        <dl className="space-y-2">
          {(Object.keys(idea.answers) as (keyof typeof idea.answers)[]).map((k) => (
            <div key={k}>
              <dt className="text-muted-foreground">{t(`q.${k}`)}</dt>
              <dd className="whitespace-pre-wrap">{idea.answers[k]}</dd>
            </div>
          ))}
        </dl>
      )}
      <h4 className="font-medium">{t('datasets')}</h4>
      {datasets.length === 0 ? (
        <p className="text-muted-foreground">{t('noDatasets')}</p>
      ) : (
        <ul className="space-y-1">
          {datasets.map((d) => (
            <li key={d.dataset_id} className="font-mono text-xs">
              {d.name} ·{' '}
              {JSON.stringify({ dataset_id: d.dataset_id, version: d.version, sha256: d.sha256 })}
            </li>
          ))}
        </ul>
      )}
      {answered.length > 0 ? (
        <>
          <h4 className="font-medium">{t('answeredTitle')}</h4>
          <ul className="space-y-1">
            {answered.map((a) => (
              <li key={a.question_id}>
                {a.text} → {a.answer?.text ?? a.answer?.option_id ?? a.answer?.decision} ·{' '}
                {t(`answeredBy.${a.answered_by ?? 'operator'}`)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h4 className="font-medium">{t('cases')}</h4>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
        {JSON.stringify(cases, null, 2)}
      </pre>
      <label className="block">
        {t('manifest')}
        <textarea
          className={`${FIELD} font-mono`}
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
