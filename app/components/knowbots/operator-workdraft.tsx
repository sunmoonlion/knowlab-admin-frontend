'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Proposal, Step, Workdraft, WorkdraftBody } from '@/contracts/workdraft'
import { Link } from '@/i18n/navigation'
import {
  fetchOperatorRounds,
  fetchOperatorWorkdraft,
  previewOperator,
  propose,
  publishOperator,
  startOperatorRound,
  withdrawProposal,
} from '@/lib/knowbots/client'
import { toProposals } from '@/lib/knowbots/proposals'
import { freshId, newStep, withoutStep } from '@/lib/knowbots/workdraft'

import { Card, FIELD, KEY, useFeedback, useWhen } from './shared'
import { Field, Group, MarksContext } from './workdraft-cells'
import { StepEditor } from './workdraft-step'

// 平台孵化的工作稿（专家孵化方案第十二节；decisions 10-29）：和作者用的是同一套格子，只是平台人员
// 改的不直接进稿——改完写一句理由「提交为提议」，作者在 web端逐条接受了才算；出处照样只认作者。
// 格子都有作者的出处了，平台点「出一版」，准专家记平台模式。也可以在作者设的上限内发起一轮 AI
// （在作者的电脑上、用作者的 key），建议直接给作者处理。挑数据、「高级」平台人员不提议。

const INPUT = `${FIELD} mt-0`

export function OperatorWorkdraft({
  requestId,
  csrfToken,
}: {
  requestId: string
  csrfToken: string
}) {
  const t = useTranslations('operatorWorkdraft')
  const loaded = useQuery({
    queryKey: [...KEY, 'operator-workdraft', requestId],
    queryFn: () => fetchOperatorWorkdraft(requestId),
  })
  if (loaded.isError)
    return (
      <p className="text-destructive mt-6 text-sm" role="alert">
        {t('loadFailed')}
      </p>
    )
  if (!loaded.data) return <p className="text-muted-foreground mt-6 text-sm">{t('loading')}</p>
  return (
    <Editor
      key={loaded.data.revision}
      server={loaded.data}
      requestId={requestId}
      csrfToken={csrfToken}
    />
  )
}

function Editor({
  server,
  requestId,
  csrfToken,
}: {
  server: Workdraft
  requestId: string
  csrfToken: string
}) {
  const t = useTranslations('operatorWorkdraft')
  const tw = useTranslations('workdraft')
  const when = useWhen()
  const client = useQueryClient()
  const { failed, onError, onDone } = useFeedback()
  const [body, setBody] = useState<WorkdraftBody>(server.body)
  const [reason, setReason] = useState('')
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const { proposals: drafted, skipped } = toProposals(server.body, body, reason.trim())
  const preview = useQuery({
    queryKey: [...KEY, 'operator-preview', requestId, server.revision],
    queryFn: () => previewOperator(requestId),
    placeholderData: keepPreviousData,
  })
  const rounds = useQuery({
    queryKey: [...KEY, 'operator-rounds', requestId],
    queryFn: () => fetchOperatorRounds(requestId),
  })
  const refresh = () =>
    client.invalidateQueries({ queryKey: [...KEY, 'operator-workdraft', requestId] })
  const send = useMutation({
    mutationFn: () => propose(requestId, drafted, csrfToken),
    onSuccess: async () => {
      setReason('')
      setMessage(t('sent', { n: drafted.length }))
      await onDone()
      await refresh()
    },
    onError,
  })
  const withdraw = useMutation({
    mutationFn: (proposalId: string) => withdrawProposal(requestId, proposalId, csrfToken),
    onSuccess: async () => {
      await onDone()
      await refresh()
    },
    onError,
  })
  const publish = useMutation({
    mutationFn: () => publishOperator(requestId, csrfToken),
    onSuccess: async (made) => {
      setMessage(t('published', { version: made.version, revision: made.revision }))
      await onDone()
    },
    onError,
  })
  const round = useMutation({
    mutationFn: (action: 'draft' | 'revise') =>
      startOperatorRound(
        requestId,
        action === 'revise' ? { action, instruction: instruction.trim() } : { action },
        csrfToken,
      ),
    onSuccess: async () => {
      setInstruction('')
      setMessage(t('roundStarted'))
      await rounds.refetch()
    },
    onError,
  })
  const edit = (change: (b: WorkdraftBody) => WorkdraftBody) => setBody((b) => change(b))
  const setStep = (step: Step) =>
    edit((b) => ({ ...b, steps: b.steps.map((s) => (s.id === step.id ? step : s)) }))
  const move = (id: string, by: -1 | 1) =>
    edit((b) => {
      const steps = [...b.steps]
      const index = steps.findIndex((s) => s.id === id)
      const to = index + by
      if (index < 0 || to < 0 || to >= steps.length) return b
      ;[steps[index], steps[to]] = [steps[to], steps[index]]
      return { ...b, steps }
    })
  const pending = (server.proposals ?? []).filter((p) => p.state === 'pending')
  const problems = preview.data?.problems ?? []

  return (
    <MarksContext.Provider value={{ problems, origins: server.origins }}>
      <div className="mt-6 space-y-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">{server.title}</h2>
          <Link href={`/names/${requestId}`} className="text-sm underline underline-offset-2">
            {t('backToName')}
          </Link>
        </header>
        <p className="text-muted-foreground text-sm">{t('intro')}</p>
        {message ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-destructive text-sm">
            {failed}
          </p>
        ) : null}

        <Card title={t('send.title', { n: drafted.length })}>
          {skipped.length ? (
            <p className="text-amber-800 dark:text-amber-300">{t('send.skipped')}</p>
          ) : null}
          <label className="block">
            {t('send.reason')}
            <textarea
              className={FIELD}
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="primary-button"
              disabled={drafted.length === 0 || !reason.trim() || send.isPending}
              onClick={() => send.mutate()}
            >
              {t('send.submit')}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={drafted.length === 0}
              onClick={() => setBody(server.body)}
            >
              {t('send.reset')}
            </button>
          </div>
        </Card>

        <Card title={t('pending.title', { n: pending.length })}>
          {pending.length === 0 ? (
            <p className="text-muted-foreground">{t('pending.none')}</p>
          ) : (
            <ul className="space-y-2" aria-label={t('pending.title', { n: pending.length })}>
              {pending.map((p) => (
                <PendingProposal
                  key={p.proposal_id}
                  proposal={p}
                  at={when(p.proposed_at)}
                  busy={withdraw.isPending}
                  onWithdraw={() => withdraw.mutate(p.proposal_id)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('ai.title')}>
          <p className="text-muted-foreground">{t('ai.hint')}</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <button
              type="button"
              className="secondary-button"
              disabled={round.isPending}
              onClick={() => round.mutate('draft')}
            >
              {t('ai.draft')}
            </button>
            <input
              className={`${INPUT} w-72`}
              aria-label={t('ai.instruction')}
              placeholder={t('ai.instruction')}
              maxLength={4000}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!instruction.trim() || round.isPending}
              onClick={() => round.mutate('revise')}
            >
              {t('ai.revise')}
            </button>
          </div>
          {(rounds.data ?? []).length ? (
            <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
              {(rounds.data ?? []).map((r) => (
                <li key={r.incubation_id}>
                  {t('ai.round', {
                    n: r.round,
                    status: tw(`ai.status.${r.status}` as never),
                    spent: r.spent ?? '—',
                    limit: r.budget_limit,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title={tw('expert.title')}>
          <Field label={tw('expert.name')} path="name" filled={Boolean(body.name.trim())}>
            {(a11y) => (
              <input
                {...a11y}
                className={INPUT}
                maxLength={80}
                value={body.name}
                onChange={(e) => edit((b) => ({ ...b, name: e.target.value }))}
              />
            )}
          </Field>
          <Field label={tw('expert.tagline')} path="tagline" filled={Boolean(body.tagline.trim())}>
            {(a11y) => (
              <input
                {...a11y}
                className={INPUT}
                maxLength={200}
                value={body.tagline}
                onChange={(e) => edit((b) => ({ ...b, tagline: e.target.value }))}
              />
            )}
          </Field>
          {(
            [
              ['does', 'expert.does'],
              ['does_not', 'expert.doesNot'],
              ['elsewhere', 'expert.elsewhere'],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={tw(label)}
              path={`scope/${key}`}
              filled={Boolean(body.scope[key].trim())}
            >
              {(a11y) => (
                <textarea
                  {...a11y}
                  className={INPUT}
                  rows={2}
                  maxLength={2000}
                  value={body.scope[key]}
                  onChange={(e) =>
                    edit((b) => ({ ...b, scope: { ...b.scope, [key]: e.target.value } }))
                  }
                />
              )}
            </Field>
          ))}
        </Card>

        <Group title={tw('steps.title')} path="steps">
          {body.steps.length === 0 ? (
            <p className="text-muted-foreground text-sm">{tw('steps.none')}</p>
          ) : null}
          <div className="space-y-4">
            {body.steps.map((step, index) => (
              <StepEditor
                key={step.id}
                step={step}
                number={index + 1}
                count={body.steps.length}
                earlier={body.steps.slice(0, index)}
                onChange={setStep}
                onMove={(by) => move(step.id, by)}
                onRemove={() => edit((b) => withoutStep(b, step.id))}
              />
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              edit((b) => ({
                ...b,
                steps: [
                  ...b.steps,
                  newStep(
                    freshId(
                      'step',
                      b.steps.map((s) => s.id),
                    ),
                  ),
                ],
              }))
            }
          >
            {tw('steps.add')}
          </button>
        </Group>

        <Card title={t('publish.title')}>
          {problems.length ? (
            <ul className="text-destructive list-disc space-y-0.5 pl-5 text-xs">
              {problems.map((p, i) => (
                <li key={i}>
                  {p.path ? <code className="mr-1">{p.path}</code> : null}
                  {p.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('publish.ready')}</p>
          )}
          <button
            type="button"
            className="primary-button mt-2"
            disabled={problems.length > 0 || drafted.length > 0 || publish.isPending}
            onClick={() => publish.mutate()}
          >
            {t('publish.submit')}
          </button>
          {drafted.length > 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">{t('publish.unsent')}</p>
          ) : null}
        </Card>
      </div>
    </MarksContext.Provider>
  )
}

function PendingProposal({
  proposal: p,
  at,
  busy,
  onWithdraw,
}: {
  proposal: Proposal
  at: string | null
  busy: boolean
  onWithdraw: () => void
}) {
  const t = useTranslations('operatorWorkdraft')
  const tw = useTranslations('workdraft.ai')
  const shown =
    p.value === undefined || p.value === null
      ? ''
      : typeof p.value === 'string'
        ? p.value
        : JSON.stringify(p.value, null, 2)
  return (
    <li className="space-y-1 rounded-lg border p-2 text-xs">
      <p className="font-medium">
        <code>{p.path}</code> · {tw(`op.${p.op}`)}
      </p>
      {shown ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{shown}</pre> : null}
      <p className="text-muted-foreground">
        {t('pending.line', { reason: p.reason, by: p.proposed_by ?? '—', at: at ?? '—' })}
      </p>
      <button type="button" className="secondary-button" disabled={busy} onClick={onWithdraw}>
        {t('pending.withdraw')}
      </button>
    </li>
  )
}
