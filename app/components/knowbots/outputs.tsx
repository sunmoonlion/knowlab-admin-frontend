'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import type { AdminDraft, CaseOutputs, StepOutput } from '@/contracts/knowbots'
import { fetchOutputs } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

import { Markdown } from './markdown'
import { KEY, loadFailed } from './shared'

// 每条用例的成稿与各步交回物（SDD 0037）：写清单的测试人员看了才验证得了这一稿
// （所有者 2026-10-19「草稿毕竟要测试人员写啊，看不到成稿如何验证草稿」）。
// 用例跑完、刷新结果后才有；没过的那一步给最后一次交回的原文和没过的验收。

const OUTCOME_TONE: Record<StepOutput['outcome'], string> = {
  accepted: 'text-emerald-700 dark:text-emerald-400',
  rejected: 'text-red-700 dark:text-red-400',
  failed: 'text-red-700 dark:text-red-400',
  over_budget: 'text-amber-700 dark:text-amber-400',
  cancelled: 'text-muted-foreground',
  running: 'text-muted-foreground',
  not_reached: 'text-muted-foreground',
}

export function TestOutputs({ draft }: { draft: AdminDraft }) {
  const t = useTranslations('knowbots.outputs')
  const tk = useTranslations('knowbots')
  const format = useFormatter()
  const finished = (draft.report?.cases.length ?? 0) > 0
  const outputs = useQuery({
    queryKey: [...KEY, 'outputs', draft.draft_id, draft.report?.cases.length ?? 0],
    queryFn: () => fetchOutputs(draft.draft_id),
    enabled: Boolean(draft.run_id) && finished,
  })
  if (!draft.run_id || !finished) return null
  return (
    <section className="bg-card rounded-xl border p-4 text-sm shadow-sm" aria-label={t('title')}>
      <h3 className="font-medium">{t('title')}</h3>
      {outputs.isPending ? (
        <p className="text-muted-foreground mt-2">{tk('loading')}</p>
      ) : outputs.isError ? (
        <p className="text-destructive mt-2">{loadFailed(outputs.error, tk)}</p>
      ) : outputs.data.cases.length === 0 ? (
        <p className="text-muted-foreground mt-2">{t('none')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {outputs.data.cases.map((c, i) => (
            <details key={c.case_id} open={i === 0} className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2">
                <span className="font-mono">{c.case_id}</span>
                {c.fetched_at ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {t('fetchedAt', {
                      at: format.dateTime(new Date(c.fetched_at), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                ) : null}
              </summary>
              <div className="space-y-3 border-t px-3 py-3">
                {c.outputs ? <CaseBody outputs={c.outputs} /> : <p>{c.note ?? t('none')}</p>}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

function CaseBody({ outputs }: { outputs: CaseOutputs }) {
  const t = useTranslations('knowbots.outputs')
  const steps = outputs.steps ?? []
  return (
    <>
      {outputs.error ? (
        <p className="text-destructive">{t('error', { error: outputs.error })}</p>
      ) : null}
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs">
          {t('deliverable')}
          {outputs.deliverable ? ` · ${outputs.deliverable.path}` : ''}
        </h4>
        {outputs.deliverable ? (
          <div className="bg-background max-h-[70vh] overflow-y-auto rounded-md border p-3">
            {outputs.deliverable.truncated ? (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{t('truncated')}</p>
            ) : null}
            <Markdown>{outputs.deliverable.text}</Markdown>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {t('noDeliverable', { why: outputs.deliverable_note ?? '—' })}
          </p>
        )}
      </div>
      {steps.length > 0 ? (
        <div>
          <h4 className="text-muted-foreground mb-1 text-xs">{t('steps')}</h4>
          <ul className="space-y-1">
            {steps.map((s) => (
              <li key={s.step_id}>
                <StepBlock step={s} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

function StepBlock({ step }: { step: StepOutput }) {
  const t = useTranslations('knowbots.outputs')
  const failedChecks = (step.checks ?? []).filter((c) => c.passed === false)
  const hasBody =
    step.artifact != null ||
    step.artifact_omitted_bytes != null ||
    Boolean(step.returned_raw) ||
    (step.checks ?? []).length > 0
  const head = (
    <>
      <span className="font-mono text-xs">{step.step_id}</span>
      {step.title ? ` · ${step.title}` : ''}
      {' · '}
      <span className={cn('font-medium', OUTCOME_TONE[step.outcome])}>
        {t(`outcome.${step.outcome}`)}
      </span>
    </>
  )
  if (!hasBody) return <p className="px-2 py-1">{head}</p>
  return (
    <details open={step.outcome === 'rejected'} className="rounded-md border">
      <summary className="cursor-pointer px-2 py-1">{head}</summary>
      <div className="space-y-2 border-t p-2">
        {(step.checks ?? []).length > 0 ? (
          <ul className="space-y-0.5 text-xs">
            {(step.checks ?? []).map((c, i) => (
              <li key={i} className={cn(c.passed === false && 'text-red-700 dark:text-red-400')}>
                {c.passed === true ? '✓' : c.passed === false ? '✗' : '·'} {c.label}
                {c.passed === false && c.message ? `：${c.message}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {failedChecks.length === 0 && step.outcome === 'rejected' ? (
          <p className="text-xs">{t('rejectedNoCheck')}</p>
        ) : null}
        {step.artifact_omitted_bytes != null ? (
          <p className="text-muted-foreground text-xs">
            {t('omitted', { bytes: step.artifact_omitted_bytes })}
          </p>
        ) : step.artifact != null ? (
          <pre className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs">
            {JSON.stringify(step.artifact, null, 2)}
          </pre>
        ) : null}
        {step.returned_raw ? (
          <div>
            <p className="text-muted-foreground text-xs">{t('raw')}</p>
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
              {step.returned_raw}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  )
}
