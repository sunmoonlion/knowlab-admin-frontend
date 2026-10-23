'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type {
  Acceptance,
  Amendment,
  Answered,
  CaseResult,
  Dataset,
  Draft,
  Idea,
  Test,
  Version,
} from '@/contracts/knowbots'
import { fetchManifest } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

import { KEY, loadFailed, useWhen } from './shared'

// 各过程的输入与输出怎么显示：四栏的过程页（输入）、右边栏（输出）、详情页共用（SDD 0037）。

/** 测试结果：每条用例过没过、没过的步与原因。 */
export function Report({ test }: { test: Test }) {
  const t = useTranslations('knowbots')
  const format = useFormatter()
  const report = test.report
  if (!report) return <p className="text-muted-foreground">{t('noCaseYet')}</p>
  return (
    <div aria-label={t('report')}>
      <p className="text-muted-foreground text-xs">
        {/* 跑着的时候结果里的花费只算跑完的用例（常是 0），不显示 */}
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
      {report.cases.length === 0 ? (
        <p className="text-muted-foreground mt-2">{t('noCaseYet')}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {report.cases.map((c) => (
            <CaseLine key={c.case_id} c={c} />
          ))}
        </ul>
      )}
    </div>
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

/** 规则出处：谁核过，逐条出处（出自创意第几版的哪一句）。 */
export function Rules({ draft }: { draft: Draft }) {
  const t = useTranslations('knowbots')
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        {draft.rules_reviewed_by
          ? t('reviewedBy', { who: draft.rules_reviewed_by })
          : t('notReviewed')}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        {draft.rule_sources.map((s, i) => (
          <li key={i}>
            {s.rule} — {s.source}：{s.ref}
          </li>
        ))}
      </ol>
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

export function Method({ idea }: { idea: Idea }) {
  const t = useTranslations('knowbots')
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

export function Cases({ cases }: { cases: Record<string, unknown>[] }) {
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

/** 创意的一个版本：方法与用例（受理、孵化时在过程页中间完整显示）。 */
export function VersionBody({ version }: { version: Version }) {
  const t = useTranslations('knowbots')
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs">{t('tabs.method')}</h4>
        <Method idea={version.idea} />
      </div>
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs">{t('tabs.cases')}</h4>
        <Cases cases={version.cases} />
      </div>
    </div>
  )
}

/** 受理单：三样各自的结论与说明、受理与否、理由、谁、何时。 */
export function AcceptanceSheet({ acceptance }: { acceptance: Acceptance }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  return (
    <div className="space-y-2">
      <p className="font-medium">
        {acceptance.accepted ? t('acceptance.accepted') : t('acceptance.rejected')}
        {acceptance.trial ? ` · ${t('acceptance.trial')}` : ''}
      </p>
      <ul className="space-y-1">
        {Object.entries(acceptance.checks).map(([code, check]) => (
          <li key={code}>
            {check.ok ? '✓' : '✗'} {t(`acceptance.check.${code}` as never)}
            {check.note ? `：${check.note}` : ''}
          </li>
        ))}
      </ul>
      {acceptance.reason ? (
        <p>{t('acceptance.reasonLine', { reason: acceptance.reason })}</p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {t('byAt', { who: acceptance.decided_by, at: when(acceptance.decided_at) })}
      </p>
    </div>
  )
}

export function Datasets({ datasets }: { datasets: Dataset[] }) {
  const t = useTranslations('knowbots')
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

/** 旧的补充方法（SDD 0035，已取消）：只读，出处照旧可查。 */
export function Amendments({ amendments }: { amendments: Amendment[] }) {
  const t = useTranslations('knowbots')
  if (amendments.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">{t('amendments.title')}</p>
      <ul className="divide-y">
        {amendments.map((a) => (
          <li key={a.amendment_id} className="space-y-1 py-2 first:pt-0 last:pb-0">
            <p className="whitespace-pre-wrap">{a.text}</p>
            <p className="text-muted-foreground text-xs">
              {a.status === 'used'
                ? t('amendments.status.used', { revision: a.used_in_revision ?? 0 })
                : a.status === 'declined'
                  ? t('amendments.status.declined', { reason: a.declined_reason ?? '' })
                  : t('amendments.status.open')}
            </p>
            <p className="font-mono text-xs break-all">amendment:{a.amendment_id}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AnsweredList({ answered }: { answered: Answered[] }) {
  const t = useTranslations('knowbots')
  if (answered.length === 0) return <p className="text-muted-foreground">{t('noAnswered')}</p>
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">{t('answeredTitle')}</p>
      <ul className="space-y-1">
        {answered.map((a) => (
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
