'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CHECKS, type AcceptanceItem } from '@/contracts/knowbots'
import { accept, fetchAcceptance } from '@/lib/knowbots/client'

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
// 写受理单。不受理写明理由，用户改创意出新版本再受理。受理单写了不改。

const FILTERS = ['pending', 'accepted', 'rejected'] as const
type Filter = (typeof FILTERS)[number]

const keyOf = (item: AcceptanceItem) => `${item.request_id}:${item.version}`

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
      categoryOf={(item) => [item.category]}
      keyOf={keyOf}
      picked={picked}
      onPick={setPicked}
      empty={t('empty.acceptance')}
      error={board.error}
      pending={board.isPending}
      failed={failed}
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">
              {item.title} · {t('ideaVersion', { version: item.version })}
            </span>
            <Badge
              tone={
                item.category === 'pending' ? 'todo' : item.category === 'accepted' ? 'good' : 'bad'
              }
            >
              {t(`categories.${item.category}`)}
            </Badge>
          </span>
          <span className="text-muted-foreground mt-1 block truncate text-xs">
            {item.owner_subject} · {when(item.created_at)}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? (
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

function AcceptanceProcess({ item, ...props }: CardProps & { item: AcceptanceItem }) {
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

function AcceptanceForm({
  item,
  csrfToken,
  onDone,
  onError,
}: CardProps & { item: AcceptanceItem }) {
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
