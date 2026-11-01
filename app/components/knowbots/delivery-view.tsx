'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Delivery, DeliveryItem, Expert } from '@/contracts/knowbots'
import {
  fetchCategories,
  fetchDelivery,
  fetchDetail,
  retryDelivery,
  returnExpert,
  reviewDelivery,
  startRerun,
  stopExpert,
  voidDelivery,
} from '@/lib/knowbots/client'

import { TestOutputs } from './outputs'
import { Report } from './reference'
import {
  Badge,
  Card,
  ColumnLayout,
  EXPERT_TONE,
  FIELD,
  KEY,
  ProcessHeader,
  useFeedback,
  useWhen,
  type CardProps,
} from './shared'
import { SidePanel } from './side-panel'

// 交付（SDD 0037 第五节、0046 第五节）：平台孵化、平台测的先交回作者；作者「提交交付」（定自用或
// 公开、授权审核员看这次交付）就过了用户同意门。自用的能自动查的已经自动查过，查不过才到这里；
// 公开的完整审核，自助测的要先由平台发起重跑（在作者的账号下、作者的电脑上），审核员看重跑的
// 结论、不看原始数据。过的时候选类目（公开的必须选），交 knowmart（失败可重试）；自用转公开也
// 在这里审。上架了的可以停用。「全部专家」列出每个名称的每一版。

const FILTERS = ['to_return', 'awaiting_user', 'to_review', 'listed', 'not_listed', 'all'] as const
type Filter = (typeof FILTERS)[number]

export function DeliveryView({
  csrfToken,
  picked: initialPick,
  category,
}: {
  csrfToken: string
  picked?: string
  category?: Filter
}) {
  const t = useTranslations('knowbots')
  const board = useQuery({ queryKey: [...KEY, 'board', 'delivery'], queryFn: fetchDelivery })
  const { failed, onError, onDone } = useFeedback()
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  return (
    <ColumnLayout
      title={t('columns.delivery')}
      filters={FILTERS}
      defaultFilter="to_return"
      initialFilter={category}
      items={board.data ?? []}
      categoryOf={(item) => [item.category as Filter, 'all']}
      keyOf={(item) => item.expert_id}
      picked={picked}
      onPick={setPicked}
      empty={t('empty.delivery')}
      error={board.error}
      pending={board.isPending}
      failed={failed}
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">
              {item.title} · {t('expertVersion', { version: item.version })}
            </span>
            <Badge tone={EXPERT_TONE[item.stage]}>{t(`expertStage.${item.stage}`)}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block truncate text-xs">
            {item.test_number
              ? t('fromTest', { number: item.test_number, label: item.label ?? '—' })
              : t('draftLabel', { label: item.label ?? '—' })}
            {item.trial ? ` · ${t('trial')}` : ''}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? (
          <ExpertProcess
            key={current.expert_id}
            item={current}
            csrfToken={csrfToken}
            onDone={onDone}
            onError={onError}
          />
        ) : null
      }
    </ColumnLayout>
  )
}

function ExpertProcess({ item, ...props }: CardProps & { item: DeliveryItem }) {
  const t = useTranslations('knowbots')
  // 输入：出这版专家的那次测试（结果、成稿与各步交回物）
  const detail = useQuery({
    queryKey: [...KEY, 'detail', item.request_id],
    queryFn: () => fetchDetail(item.request_id),
  })
  const test = detail.data?.tests.find((x) => x.test_id === item.test_id)
  return (
    <>
      <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
        <ProcessHeader
          title={`${item.title} · ${t('expertVersion', { version: item.version })}`}
          badge={<Badge tone={EXPERT_TONE[item.stage]}>{t(`expertStage.${item.stage}`)}</Badge>}
          requestId={item.request_id}
          owner={item.owner_subject}
        />
        <Card title={t('delivery.next')}>
          <Actions expert={item} {...props} />
        </Card>
        <Card
          title={
            item.test_number
              ? t('input.test', { number: item.test_number, label: item.label ?? '—' })
              : t('input.noTest')
          }
        >
          {test ? (
            <div className="space-y-4">
              <Report test={test} />
              {/* 自助测的：平台的人看不到成稿与交回物（SDD 0046 第三节） */}
              {test.mode === 'platform' ? <TestOutputs test={test} {...props} /> : null}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('delivery.noTestRecord')}</p>
          )}
        </Card>
      </section>
      <SidePanel
        label={t('output')}
        tabs={[{ key: 'record', label: t('outputs.delivery'), content: <Record expert={item} /> }]}
      />
    </>
  )
}

/** 现在这一版要做的那一件事。 */
function Actions({ expert, csrfToken, onDone, onError }: CardProps & { expert: Expert }) {
  const t = useTranslations('knowbots')
  const [stopReason, setStopReason] = useState('')
  const back = useMutation({
    mutationFn: () => returnExpert(expert.expert_id, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const stop = useMutation({
    mutationFn: () => stopExpert(expert.expert_id, stopReason.trim(), csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const busy = back.isPending || stop.isPending
  const open = expert.deliveries.find(
    (d) => d.status === 'reviewing' || (d.status === 'approved' && !d.delivered_at),
  )
  if (open) {
    return (
      <OpenDelivery
        key={open.delivery_id}
        delivery={open}
        csrfToken={csrfToken}
        onDone={onDone}
        onError={onError}
      />
    )
  }
  switch (expert.stage) {
    case 'to_return':
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground">{t('delivery.returnHint')}</p>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => back.mutate()}
          >
            {t('delivery.return')}
          </button>
        </div>
      )
    case 'awaiting_user':
      return <p className="text-muted-foreground">{t('delivery.awaitingUser')}</p>
    case 'listed':
      return (
        <div className="space-y-2">
          {expert.market_status === 'held' ? (
            <p className="text-destructive" role="status">
              {t('delivery.held', { reason: expert.held_reason ?? '' })}
            </p>
          ) : null}
          <p className="text-muted-foreground">{t('delivery.stopHint')}</p>
          <label className="block">
            {t('delivery.stopReason')}
            <input
              className={FIELD}
              maxLength={500}
              value={stopReason}
              onChange={(e) => setStopReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !stopReason.trim()}
            onClick={() => stop.mutate()}
          >
            {t('delivery.stop')}
          </button>
        </div>
      )
    default:
      return <p className="text-muted-foreground">{t(`expertStage.${expert.stage}`)}</p>
  }
}

/** 一次没走完的交付：看作者定的自用或公开、自动查与许可预查、重跑结论，审；审过没交成的重试。 */
function OpenDelivery({
  delivery,
  csrfToken,
  onDone,
  onError,
}: CardProps & { delivery: Delivery }) {
  const t = useTranslations('knowbots')
  const tt = useTranslations('knowbots.testStatus')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const categories = useQuery({ queryKey: [...KEY, 'categories'], queryFn: fetchCategories })
  const review = useMutation({
    mutationFn: (approved: boolean) =>
      reviewDelivery(
        delivery.delivery_id,
        { approved, reason: reason.trim(), category: approved && category ? category : null },
        csrfToken,
      ),
    onSuccess: () => onDone(),
    onError,
  })
  const rerun = useMutation({
    mutationFn: () => startRerun(delivery.delivery_id, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const retry = useMutation({
    mutationFn: () => retryDelivery(delivery.delivery_id, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const annul = useMutation({
    mutationFn: () => voidDelivery(delivery.delivery_id, reason.trim(), csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const busy = review.isPending || rerun.isPending || retry.isPending || annul.isPending
  const findings = delivery.auto_check?.findings ?? []
  const rerunDone = delivery.rerun?.status === 'passed'
  // 没跑过、或上一次平台出错的才能发起；没通过的只能审成不过（重跑花作者的钱）
  const canRerun = !delivery.rerun || delivery.rerun.status === 'platform_error'
  const canApprove =
    (!delivery.needs_rerun || rerunDone) && (delivery.listing === 'self' || category !== '')
  if (delivery.status === 'approved') {
    return (
      <div className="space-y-2">
        {delivery.delivery_error ? (
          <p className="text-destructive">{delivery.delivery_error}</p>
        ) : null}
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => retry.mutate()}
        >
          {t('deliver')}
        </button>
        {/* 一直交不成（如审后作者改低了许可，knowmart 一直拒）：作废，不再挡这一版 */}
        <p className="text-muted-foreground">{t('delivery.voidHint')}</p>
        <label className="block">
          {t('delivery.reason')}
          <textarea
            className={FIELD}
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => annul.mutate()}
        >
          {t('delivery.void')}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-3" data-testid="open-delivery">
      <p>
        {t(delivery.conversion ? 'delivery.conversion' : `delivery.listing.${delivery.listing}`)}
        {' · '}
        {t(`delivery.testMode.${delivery.test_mode}`)}
      </p>
      {delivery.auto_check ? (
        <p>
          {delivery.auto_check.passed
            ? t('delivery.autoPassed')
            : t('delivery.autoFailed', {
                items: findings
                  .map((f) =>
                    t(`delivery.finding.${f.kind}`, {
                      word: f.word ?? '',
                      case: f.case_id ?? '',
                    }),
                  )
                  .join('；'),
              })}
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {delivery.bindings.length === 0
          ? t('delivery.noBindings')
          : delivery.binding_problem
            ? t('delivery.bindingProblem', { problem: delivery.binding_problem })
            : t('delivery.bindingsOk', { count: delivery.bindings.length })}
      </p>
      {delivery.needs_rerun ? (
        <div className="space-y-2">
          <p>
            {delivery.rerun
              ? t('delivery.rerunLine', {
                  number: delivery.rerun.number,
                  status: tt(delivery.rerun.status),
                })
              : t('delivery.rerunNeeded', { budget: delivery.budget_limit ?? '—' })}
          </p>
          {delivery.rerun?.report ? (
            <ul className="text-muted-foreground text-xs">
              {delivery.rerun.report.cases.map((c) => (
                <li key={c.case_id}>
                  {c.case_id}：{c.status}
                </li>
              ))}
            </ul>
          ) : null}
          {canRerun ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => rerun.mutate()}
            >
              {t('delivery.startRerun')}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-muted-foreground">{t('delivery.reviewHint')}</p>
      <label className="block">
        {t(delivery.listing === 'public' ? 'delivery.categoryNeeded' : 'delivery.category')}
        <select
          className={FIELD}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t('delivery.category')}
        >
          <option value="">{t('delivery.categoryNone')}</option>
          {(categories.data ?? []).map((code) => (
            <option key={code} value={code}>
              {t.has(`catalog.${code}`) ? t(`catalog.${code}`) : code}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t('delivery.reason')}
        <textarea
          className={FIELD}
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="primary-button"
          disabled={busy || !canApprove}
          onClick={() => review.mutate(true)}
        >
          {t('delivery.approve')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => review.mutate(false)}
        >
          {t('delivery.reject')}
        </button>
      </div>
    </div>
  )
}

/** 输出：交回记录、用户同意门、运营审核、上架、停用，各自谁、何时。 */
function Record({ expert }: { expert: Expert }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const rows: [string, string][] = [
    [
      t('record.returned'),
      expert.returned_at
        ? t('byAt', { who: expert.returned_by ?? '—', at: when(expert.returned_at) })
        : t('record.notYet'),
    ],
    [
      t('record.userGate'),
      expert.user_accepted === null
        ? expert.trial
          ? t('trialGates')
          : t('record.notYet')
        : `${expert.user_accepted ? t('record.accepted') : t('record.declined')} · ${t('byAt', {
            who: expert.user_decided_by ?? '—',
            at: when(expert.user_decided_at),
          })}`,
    ],
    [
      t('record.review'),
      expert.review_approved === null
        ? expert.trial
          ? t('trialGates')
          : t('record.notYet')
        : `${
            expert.review_approved
              ? t(`record.approved.${expert.review_listing ?? 'self'}`)
              : t('record.rejected', { reason: expert.review_reason ?? '' })
          } · ${t('byAt', { who: expert.reviewed_by ?? '—', at: when(expert.reviewed_at) })}`,
    ],
    [
      t('record.listed'),
      expert.listed_at
        ? t('record.listedLine', {
            at: when(expert.listed_at),
            id: expert.knowbot_id ?? '—',
            status:
              expert.listing_status && t.has(`listingStatus.${expert.listing_status}`)
                ? t(`listingStatus.${expert.listing_status}`)
                : (expert.listing_status ?? '—'),
          })
        : (expert.delivery_error ?? t('record.notYet')),
    ],
    [
      t('record.stopped'),
      expert.stopped_at
        ? `${t('byAt', { who: expert.stopped_by ?? '—', at: when(expert.stopped_at) })} · ${expert.stop_reason ?? ''}`
        : '—',
    ],
  ]
  return (
    <dl className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
