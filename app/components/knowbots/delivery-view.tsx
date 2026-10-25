'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { DeliveryItem, Expert } from '@/contracts/knowbots'
import {
  expertAction,
  fetchDelivery,
  fetchDetail,
  reviewExpert,
  stopExpert,
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

// 交付（SDD 0037 第五节）：交回（通知用户，用户同意门开始）→ 用户要了 → 运营审核（自用，或
// 发布主体有资质的公开）→ 交 knowmart（失败可重试）。上架了的可以停用。「全部专家」列出每个
// 名称的每一版：出自哪次测试、两道门的结论、上架没有、停用没有。

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
              <TestOutputs test={test} {...props} />
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
  const [reason, setReason] = useState('')
  const [stopReason, setStopReason] = useState('')
  const act = useMutation({
    mutationFn: (action: 'return' | 'deliver') => expertAction(expert.expert_id, action, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const review = useMutation({
    mutationFn: (body: { approved: boolean; listing: 'self' | 'public' | null }) =>
      reviewExpert(expert.expert_id, { ...body, reason: reason.trim() }, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const stop = useMutation({
    mutationFn: () => stopExpert(expert.expert_id, stopReason.trim(), csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const busy = act.isPending || review.isPending || stop.isPending
  const reviewForm = (
    <div className="space-y-2">
      <p className="text-muted-foreground">{t('delivery.reviewHint')}</p>
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
          disabled={busy}
          onClick={() => review.mutate({ approved: true, listing: 'self' })}
        >
          {t('delivery.approveSelf')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => review.mutate({ approved: true, listing: 'public' })}
        >
          {t('delivery.approvePublic')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => review.mutate({ approved: false, listing: null })}
        >
          {t('delivery.reject')}
        </button>
      </div>
    </div>
  )
  switch (expert.stage) {
    case 'to_return':
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground">{t('delivery.returnHint')}</p>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('return')}
          >
            {t('delivery.return')}
          </button>
        </div>
      )
    case 'awaiting_user':
      return <p className="text-muted-foreground">{t('delivery.awaitingUser')}</p>
    case 'to_review':
      return reviewForm
    case 'to_deliver':
      return (
        <div className="space-y-2">
          {expert.delivery_error ? (
            <p className="text-destructive">{expert.delivery_error}</p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act.mutate('deliver')}
          >
            {t('deliver')}
          </button>
        </div>
      )
    case 'listed':
      return (
        <div className="space-y-4">
          {/* 试行期上架、没审过的：补一次运营审核记录（不再交付） */}
          {expert.trial && !expert.reviewed_at ? (
            <div className="space-y-2">
              <p>{t('delivery.backfillReview')}</p>
              {reviewForm}
            </div>
          ) : null}
          {/* 补审判了不通过、停用没成：照实说，下面的停用可以重试（Fable 评审 D02） */}
          {expert.trial && expert.review_approved === false ? (
            <p role="alert" className="text-destructive">
              {t('delivery.backfillRejectedNotStopped')}
            </p>
          ) : null}
          <div className="space-y-2">
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
        </div>
      )
    default:
      return <p className="text-muted-foreground">{t(`expertStage.${expert.stage}`)}</p>
  }
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
