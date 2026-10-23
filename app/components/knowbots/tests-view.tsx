'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { Draft, Test, TestItem } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { fetchQuestions, fetchTests, startTest, testAction } from '@/lib/knowbots/client'

import { draftState, draftTone } from './incubation-view'
import { OpenQuestions } from './open-questions'
import { TestOutputs } from './outputs'
import { ManifestText, Report, Rules } from './reference'
import {
  Badge,
  Card,
  ColumnLayout,
  FIELD,
  KEY,
  ProcessHeader,
  TEST_TONE,
  useFeedback,
  useWhen,
  type CardProps,
} from './shared'
import { SidePanel } from './side-panel'

// 测试（SDD 0037 第四节）：选核过出处的准专家，定预算与超时，发起就是一个新编号；平台跑，
// 刷新看进度、补取产出。平台出错（含超时、开跑失败）结束这一次，准专家回到待测，再测是新编号；
// 专家自己没做对，才再孵化。通过即出专家，到「交付」交回用户。

const FILTERS = ['to_start', 'queued', 'running', 'waiting', 'finished'] as const
type Filter = (typeof FILTERS)[number]

const keyOf = (item: TestItem) =>
  item.test ? item.test.test_id : `draft:${item.draft?.draft_id ?? item.request_id}`

export function TestsView({
  csrfToken,
  picked: initialPick,
  category,
}: {
  csrfToken: string
  picked?: string
  category?: Filter
}) {
  const t = useTranslations('knowbots')
  const board = useQuery({ queryKey: [...KEY, 'board', 'tests'], queryFn: fetchTests })
  const questions = useQuery({ queryKey: [...KEY, 'questions'], queryFn: fetchQuestions })
  const { failed, onError, onDone } = useFeedback()
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  const props = { csrfToken, onDone, onError }
  return (
    <ColumnLayout
      title={t('columns.tests')}
      filters={FILTERS}
      defaultFilter="to_start"
      initialFilter={category}
      items={board.data ?? []}
      categoryOf={(item) => [item.category]}
      keyOf={keyOf}
      picked={picked}
      onPick={setPicked}
      empty={t('empty.tests')}
      error={board.error}
      pending={board.isPending}
      failed={failed}
      renderRow={(item) =>
        item.test ? (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {t('testLabel', { number: item.test.number, label: item.test.label ?? '—' })}
              </span>
              <Badge tone={TEST_TONE[item.test.status]}>
                {t(`testStatus.${item.test.status}`)}
              </Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">{item.title}</span>
          </>
        ) : item.draft ? (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{t('draftLabel', { label: item.draft.label })}</span>
              <Badge tone={item.draft.blocked ? 'muted' : 'todo'}>
                {item.draft.blocked
                  ? t(`blockedShort.${item.draft.blocked}`)
                  : t('draftState.ready')}
              </Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">{item.title}</span>
          </>
        ) : null
      }
    >
      {(current) =>
        !current ? null : current.test ? (
          <TestProcess
            key={current.test.test_id}
            item={current}
            test={current.test}
            questions={(questions.data ?? []).filter((q) => q.draft_id === current.test?.draft_id)}
            {...props}
          />
        ) : current.draft ? (
          <StartProcess
            key={current.draft.draft_id}
            item={current}
            draft={current.draft}
            {...props}
          />
        ) : null
      }
    </ColumnLayout>
  )
}

/** 待发起：输入是这位准专家（规则出处、清单），定预算与超时，发起。 */
function StartProcess({
  item,
  draft,
  csrfToken,
  onDone,
  onError,
}: CardProps & { item: TestItem; draft: Draft }) {
  const t = useTranslations('knowbots')
  const [budget, setBudget] = useState('20')
  const [timeout, setTimeoutSeconds] = useState('1800')
  const start = useMutation({
    mutationFn: () =>
      startTest(
        draft.draft_id,
        { budget_limit: budget, timeout_seconds: Number(timeout) },
        csrfToken,
      ),
    onSuccess: () => onDone(),
    onError,
  })
  return (
    <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
      <ProcessHeader
        title={`${t('draftLabel', { label: draft.label })} · ${item.title}`}
        badge={<Badge tone={draftTone(draft)}>{draftState(draft, t)}</Badge>}
        requestId={item.request_id}
        owner={item.owner_subject}
      />
      <Card title={t('tests.start')}>
        {draft.blocked ? (
          <p className="text-amber-800 dark:text-amber-300">
            {t(`blocked.${draft.blocked}`)}{' '}
            {draft.blocked === 'rules_not_reviewed' ? (
              <Link
                href={{ pathname: '/incubation', query: { item: draft.draft_id } }}
                className="underline underline-offset-2"
              >
                {t('toIncubation')}
              </Link>
            ) : null}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-end gap-3">
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
            disabled={Boolean(draft.blocked) || start.isPending}
            onClick={() => start.mutate()}
          >
            {t('startTest')}
          </button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">{t('startHint')}</p>
      </Card>
      {/* 输入：选中的准专家 */}
      <Card title={t('input.draft', { label: draft.label })}>
        <Rules draft={draft} />
        <details className="mt-3">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t('outputs.manifest')}
          </summary>
          <div className="mt-2">
            <ManifestText draftId={draft.draft_id} />
          </div>
        </details>
      </Card>
    </section>
  )
}

/** 一次测试：在跑的看进度、刷新、判定卡住；结束了的看结论。结果与产出在右边。 */
function TestProcess({
  item,
  test,
  questions,
  ...props
}: CardProps & {
  item: TestItem
  test: Test
  questions: Parameters<typeof OpenQuestions>[0]['questions']
}) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const active = ['queued', 'running', 'waiting'].includes(test.status)
  return (
    <>
      <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
        <ProcessHeader
          title={`${t('testLabel', { number: test.number, label: test.label ?? '—' })} · ${item.title}`}
          badge={<Badge tone={TEST_TONE[test.status]}>{t(`testStatus.${test.status}`)}</Badge>}
          requestId={item.request_id}
          owner={item.owner_subject}
        />
        <Card>
          <p className="text-muted-foreground">
            {t('tests.meta', {
              at: when(test.started_at),
              who: test.started_by ?? '—',
              budget: test.budget_limit ?? '—',
              timeout: test.timeout_seconds ?? '—',
            })}
          </p>
          {test.backfilled ? (
            <p className="text-muted-foreground mt-1 text-xs">{t('tests.backfilled')}</p>
          ) : null}
          {active ? (
            <Running test={test} {...props} />
          ) : (
            <div className="mt-2 space-y-1">
              <p>{t(`tests.ended.${test.status}` as never)}</p>
              {test.error ? <p className="text-destructive text-xs">{test.error}</p> : null}
              {test.finished_at ? (
                <p className="text-muted-foreground text-xs">
                  {t('finishedAt', { at: when(test.finished_at) })}
                </p>
              ) : null}
              {test.status === 'passed' ? (
                <Link href="/delivery" className="underline underline-offset-2">
                  {t('toDelivery')}
                </Link>
              ) : null}
            </div>
          )}
        </Card>
        {active ? <OpenQuestions questions={questions} csrfToken={props.csrfToken} /> : null}
      </section>
      <SidePanel
        label={t('output')}
        tabs={[
          {
            key: 'report',
            label: t('outputs.report'),
            count: test.report?.cases.length ?? 0,
            content: (
              <div className="space-y-4">
                <Report test={test} />
                <TestOutputs test={test} {...props} />
              </div>
            ),
          },
        ]}
      />
    </>
  )
}

function Running({ test, csrfToken, onDone, onError }: CardProps & { test: Test }) {
  const t = useTranslations('knowbots')
  const format = useFormatter()
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const act = useMutation({
    mutationFn: (action: 'refresh' | 'reset') => testAction(test.test_id, action, csrfToken),
    onSuccess: (_, action) => {
      if (action === 'refresh') {
        setRefreshedAt(new Date())
        setNow(Date.now())
      }
      return onDone()
    },
    onError,
  })
  // 开跑时间以运行方的为准；还没开跑（已受理）就照说，不拿提交时间冒充（账 136 第 ②）
  const running = test.run_running_since ? new Date(test.run_running_since) : null
  const at = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' })
  const progress = test.progress
  return (
    <div className="mt-2 space-y-3">
      <p>
        {test.run_status === 'accepted' || test.status === 'queued'
          ? test.run_blocked === 'computer_offline'
            ? t('blockedOffline')
            : test.run_blocked === 'folder_not_ready'
              ? t('blockedFolder')
              : t('acceptedWaiting')
          : test.status === 'waiting'
            ? t('tests.waiting')
            : running
              ? t('runningSince', {
                  at: at(running),
                  minutes: Math.max(0, Math.floor((now - running.getTime()) / 60_000)),
                })
              : t('testStatus.running')}
      </p>
      {progress ? (
        <p className="font-medium" aria-label={t('progressNow')}>
          {progress.queued_behind
            ? t('queuedLine', {
                case: progress.case_id,
                done: progress.cases_done + 1,
                total: progress.cases_total,
              })
            : t('progressLine', {
                case: progress.case_id,
                done: progress.cases_done + 1,
                total: progress.cases_total,
                step: progress.step,
                steps: progress.steps_total,
                title: progress.step_title ?? '',
                attempt: progress.attempt ?? 1,
              })}
          {' · '}
          {t('spentSoFar', {
            amount: format.number(Number(progress.spent), { maximumFractionDigits: 2 }),
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="primary-button"
          disabled={act.isPending}
          onClick={() => act.mutate('refresh')}
        >
          {t('refresh')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={act.isPending}
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
