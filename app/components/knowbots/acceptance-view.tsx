'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CHECKS, type AcceptanceItem, type FormalItem, type LightItem } from '@/contracts/knowbots'
import { accept, decideLight, fetchAcceptance } from '@/lib/knowbots/client'

import { AcceptanceSheet, VersionBody } from './reference'
import {
  Badge,
  Card,
  ColumnLayout,
  FIELD,
  KEY,
  ProcessHeader,
  useFeedback,
  useWhen,
  type CardProps,
} from './shared'
import { SidePanel } from './side-panel'

// 受理（SDD 0037 第四节）：选创意的某一版，查三样——是不是投资建议类（C-L5 不做的不受理）、
// 用户声明的测试数据有没有权用（C-L2）、归不归这类专家能做的范围（C-L1：方法只来自用户），
// 写受理单。不受理写明理由，用户改创意出新版本再受理。受理单写了不改。只列作者请了平台孵化的
// （SDD 0046 第四节）。另有轻受理：作者把自己出的一版交平台测这一次，只看那一位准专家，接或不接。

const FILTERS = ['pending', 'accepted', 'rejected'] as const
type Filter = (typeof FILTERS)[number]

const keyOf = (item: AcceptanceItem) =>
  item.acceptance_kind === 'light'
    ? `light:${item.grant.grant_id}`
    : `${item.request_id}:${item.version}`
// 轻受理的三种并进同一组筛选
const FILTER_OF = {
  pending: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  light_pending: 'pending',
  light_accepted: 'accepted',
  light_declined: 'rejected',
} as const

export function AcceptanceView({
  csrfToken,
  picked: initialPick,
  category,
}: {
  csrfToken: string
  picked?: string
  category?: Filter
}) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const board = useQuery({ queryKey: [...KEY, 'board', 'acceptance'], queryFn: fetchAcceptance })
  const { failed, onError, onDone } = useFeedback()
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  return (
    <ColumnLayout
      title={t('columns.acceptance')}
      filters={FILTERS}
      defaultFilter="pending"
      initialFilter={category}
      items={board.data ?? []}
      categoryOf={(item) => [FILTER_OF[item.category]]}
      keyOf={keyOf}
      picked={picked}
      onPick={setPicked}
      empty={t('empty.acceptance')}
      error={board.error}
      pending={board.isPending}
      failed={failed}
      renderRow={(item) =>
        item.acceptance_kind === 'light' ? (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {item.title} · {t('draftLabel', { label: item.draft.label })}
              </span>
              <Badge
                tone={
                  item.category === 'light_pending'
                    ? 'todo'
                    : item.category === 'light_accepted'
                      ? 'good'
                      : 'bad'
                }
              >
                {t(`light.categories.${item.category}`)}
              </Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {t('light.row')} · {item.owner_subject} · {when(item.grant.granted_at)}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {item.title} · {t('ideaVersion', { version: item.version })}
              </span>
              <Badge
                tone={
                  item.category === 'pending'
                    ? 'todo'
                    : item.category === 'accepted'
                      ? 'good'
                      : 'bad'
                }
              >
                {t(`categories.${item.category}`)}
              </Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {item.owner_subject} · {when(item.created_at)}
            </span>
          </>
        )
      }
    >
      {(current) =>
        current?.acceptance_kind === 'light' ? (
          <LightProcess
            key={keyOf(current)}
            item={current}
            csrfToken={csrfToken}
            onDone={onDone}
            onError={onError}
          />
        ) : current ? (
          <AcceptanceProcess
            key={keyOf(current)}
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

function AcceptanceProcess({ item, ...props }: CardProps & { item: FormalItem }) {
  const t = useTranslations('knowbots')
  return (
    <>
      <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
        <ProcessHeader
          title={`${item.title} · ${t('ideaVersion', { version: item.version })}`}
          requestId={item.request_id}
          owner={item.owner_subject}
        />
        {/* 输入：选中的这一版创意，完整显示 */}
        <Card title={t('input.idea', { version: item.version })}>
          <VersionBody version={item} />
        </Card>
        {item.acceptance ? (
          <Card>
            <p className="text-muted-foreground">{t('acceptance.done')}</p>
          </Card>
        ) : (
          <AcceptanceForm item={item} {...props} />
        )}
      </section>
      <SidePanel
        label={t('output')}
        tabs={[
          {
            key: 'acceptance',
            label: t('outputs.acceptance'),
            content: item.acceptance ? (
              <AcceptanceSheet acceptance={item.acceptance} />
            ) : (
              <p className="text-muted-foreground">{t('acceptance.none')}</p>
            ),
          },
        ]}
      />
    </>
  )
}

function AcceptanceForm({ item, csrfToken, onDone, onError }: CardProps & { item: FormalItem }) {
  const t = useTranslations('knowbots')
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(CHECKS.map((c) => [c, { ok: false, note: '' }])),
  )
  const [reason, setReason] = useState('')
  const decide = useMutation({
    mutationFn: (accepted: boolean) =>
      accept(item.request_id, item.version, { checks, accepted, reason: reason.trim() }, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const allOk = CHECKS.every((c) => checks[c]?.ok)
  const set = (code: string, change: Partial<{ ok: boolean; note: string }>) =>
    setChecks((old) => ({ ...old, [code]: { ...old[code]!, ...change } }))
  return (
    <Card title={t('acceptance.title')}>
      <p className="text-muted-foreground mb-3">{t('acceptance.hint')}</p>
      <ul className="space-y-3">
        {CHECKS.map((code) => (
          <li key={code} className="space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checks[code]?.ok ?? false}
                onChange={(e) => set(code, { ok: e.target.checked })}
              />
              {t(`acceptance.check.${code}`)}
            </label>
            <input
              className={FIELD}
              aria-label={t('acceptance.note', { check: t(`acceptance.check.${code}`) })}
              maxLength={500}
              placeholder={t('acceptance.notePlaceholder')}
              value={checks[code]?.note ?? ''}
              onChange={(e) => set(code, { note: e.target.value })}
            />
          </li>
        ))}
      </ul>
      <label className="mt-3 block">
        {t('acceptance.reason')}
        <textarea
          className={FIELD}
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="primary-button"
          disabled={!allOk || decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          {t('acceptance.accept')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!reason.trim() || decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          {t('acceptance.reject')}
        </button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{t('acceptance.rule')}</p>
    </Card>
  )
}

// 轻受理：只看作者交来的这一位准专家与这次的上限；接了进测试栏待发起（仍在作者的电脑上、用作者的
// key 跑），不接写理由。看不到创意、之前的草稿与问答。
function LightProcess({ item, csrfToken, onDone, onError }: CardProps & { item: LightItem }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const [reason, setReason] = useState('')
  const decide = useMutation({
    mutationFn: (accepted: boolean) =>
      decideLight(
        item.grant.grant_id,
        accepted ? { accepted } : { accepted, reason: reason.trim() },
        csrfToken,
      ),
    onSuccess: () => onDone(),
    onError,
  })
  return (
    <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
      <ProcessHeader
        title={`${item.title} · ${t('draftLabel', { label: item.draft.label })}`}
        requestId={item.request_id}
        owner={item.owner_subject}
      />
      <Card title={t('light.title')}>
        <p className="text-muted-foreground">{t('light.hint')}</p>
        <p>
          {t('light.budget', { budget: item.grant.budget_limit })} ·{' '}
          {t('light.asked', { at: when(item.grant.granted_at) ?? '—' })}
        </p>
        {item.grant.state === 'pending' ? (
          <>
            <label className="mt-3 block">
              {t('light.reason')}
              <textarea
                className={FIELD}
                rows={2}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="primary-button"
                disabled={decide.isPending}
                onClick={() => decide.mutate(true)}
              >
                {t('light.accept')}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!reason.trim() || decide.isPending}
                onClick={() => decide.mutate(false)}
              >
                {t('light.decline')}
              </button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground mt-2">
            {t(`light.state.${item.grant.state}`, { reason: item.grant.reason ?? '' })}
          </p>
        )}
      </Card>
    </section>
  )
}
