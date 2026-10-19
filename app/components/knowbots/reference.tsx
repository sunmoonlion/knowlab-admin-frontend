'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { AdminDraft, Amendment, CaseResult, RequestDetail } from '@/contracts/knowbots'
import { declineAmendment, fetchManifest } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

import { FIELD, KEY, loadFailed, type CardProps } from './shared'

// 对照材料与测试报告：创意页、分身页、专家页的右边折叠栏和主栏共用（SDD 0037）。

export function Report({ draft }: { draft: AdminDraft }) {
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

export function CaseLine({ c }: { c: CaseResult }) {
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

export function RuleSources({ draft }: { draft: AdminDraft }) {
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

/** 规则出处页签：谁核过，逐条出处。 */
export function Rules({ draft }: { draft: AdminDraft | undefined }) {
  const t = useTranslations('knowbots')
  if (!draft) return <p className="text-muted-foreground">{t('noDraftYet')}</p>
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        {draft.rules_reviewed_by
          ? t('reviewedBy', { who: draft.rules_reviewed_by })
          : t('notReviewed')}
      </p>
      <RuleSources draft={draft} />
    </div>
  )
}

/** 清单原文：只读、可复制。 */
export function ManifestText({ draftId }: { draftId: string }) {
  const t = useTranslations('knowbots')
  const [copied, setCopied] = useState(false)
  const doc = useQuery({
    queryKey: [...KEY, 'manifest', draftId],
    queryFn: () => fetchManifest(draftId),
  })
  if (doc.isPending) return <p className="text-muted-foreground">{t('loading')}</p>
  if (doc.isError) return <p className="text-destructive">{loadFailed(doc.error, t)}</p>
  const text = JSON.stringify(doc.data, null, 2)
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="secondary-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? t('copied') : t('copy')}
      </button>
      <pre className="bg-muted max-h-[60vh] overflow-auto rounded-md p-3 text-xs">{text}</pre>
    </div>
  )
}

export function Method({ detail }: { detail: RequestDetail }) {
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

export function Cases({ cases }: { cases: RequestDetail['cases'] }) {
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

export function Datasets({ detail }: { detail: RequestDetail }) {
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

/** 用户写的补充方法（SDD 0035）：每条要么用进下一个分身的出处，要么写理由不照做。 */
export function Amendments({
  amendments,
  csrfToken,
  onDone,
  onError,
  canRelease = true,
}: CardProps & { amendments: Amendment[]; canRelease?: boolean }) {
  const t = useTranslations('knowbots')
  if (amendments.length === 0) return <p className="text-muted-foreground">{t('noAmendments')}</p>
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">{t('amendments.title')}</p>
      <ul className="divide-y">
        {amendments.map((a) => (
          <li key={a.amendment_id} className="space-y-1 py-2 first:pt-0 last:pb-0">
            <p className="whitespace-pre-wrap">{a.text}</p>
            <p className="text-muted-foreground text-xs">
              {a.status === 'used'
                ? t('amendments.status.used', { revision: a.used_in_revision ?? 0 })
                : a.status === 'declined'
                  ? t('amendments.status.declined', { reason: a.declined_reason ?? '' }) +
                    (a.declined_by ? t('amendments.declinedBy', { who: a.declined_by }) : '')
                  : t('amendments.status.open')}
            </p>
            {a.status !== 'declined' ? (
              <p className="font-mono text-xs break-all">
                {t('amendments.cite', { ref: `amendment:${a.amendment_id}` })}
              </p>
            ) : null}
            {/* 不照做只有 admin 能做（SDD 0035 §二.6），运营不显示按钮，后端照样把关 */}
            {a.status === 'open' && canRelease ? (
              <Decline
                amendmentId={a.amendment_id}
                csrfToken={csrfToken}
                onDone={onDone}
                onError={onError}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Decline({ amendmentId, csrfToken, onDone, onError }: CardProps & { amendmentId: string }) {
  const t = useTranslations('knowbots')
  const [reason, setReason] = useState('')
  const decline = useMutation({
    mutationFn: () => declineAmendment(amendmentId, reason.trim(), csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-60 flex-1 text-xs">
        {t('amendments.reason')}
        <input
          className={FIELD}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={decline.isPending || !reason.trim()}
        onClick={() => decline.mutate()}
      >
        {t('amendments.decline')}
      </button>
    </div>
  )
}

export function Answered({ detail }: { detail: RequestDetail }) {
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

export function History({ drafts }: { drafts: AdminDraft[] }) {
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
