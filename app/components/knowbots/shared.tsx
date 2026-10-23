'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { ExpertStage, TestStatus } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/api/client'
import { fetchCounts } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

// 受理、孵化、测试、交付四栏与详情页共用（SDD 0037 第七、第九节）。
export const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
export const KEY = ['admin', 'knowbots'] as const

export type Translate = ReturnType<typeof useTranslations<'knowbots'>>

export function problem(error: unknown): string {
  return error instanceof ApiClientError ? error.problem.code : 'unexpected'
}

/** 读不出来时说为什么：没有管理权限（403）要换账号，别的才是「刷新再试」（账 134）。 */
export function loadFailed(error: unknown, t: Translate): string {
  return error instanceof ApiClientError && error.status === 403
    ? t('noPermission')
    : t('loadFailed')
}

/** 左边栏旁的数：每栏「等我们」的条数。没有这几栏权限的账号取不到，就不显示。 */
export function useCounts(enabled: boolean) {
  const counts = useQuery({ queryKey: [...KEY, 'counts'], queryFn: fetchCounts, enabled })
  return enabled && counts.data ? counts.data : null
}

/** 动作的结果：成了刷新四栏共用的数据，没成说为什么（没有 knowlab:release 的要说清楚）。 */
export function useFeedback() {
  const t = useTranslations('knowbots')
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState<string | null>(null)
  const onError = (error: unknown) =>
    setFailed(
      error instanceof ApiClientError && error.status === 403
        ? t('adminOnly')
        : t('actionFailed', { code: problem(error) }),
    )
  const onDone = () => {
    setFailed(null)
    return queryClient.invalidateQueries({ queryKey: KEY })
  }
  return { failed, onError, onDone }
}

export type CardProps = {
  csrfToken: string
  onDone: () => Promise<unknown>
  onError: (error: unknown) => void
}

/** 时间写成「短日期 短时刻」；没有写一横。 */
export function useWhen() {
  const format = useFormatter()
  return (value: string | null | undefined) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

const TONE = {
  muted: 'bg-muted text-muted-foreground',
  todo: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  running: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  bad: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
} as const

export type Tone = keyof typeof TONE

export const TEST_TONE: Record<TestStatus, Tone> = {
  queued: 'running',
  running: 'running',
  waiting: 'todo',
  passed: 'good',
  failed: 'bad',
  platform_error: 'muted',
}

export const EXPERT_TONE: Record<ExpertStage, Tone> = {
  to_return: 'todo',
  awaiting_user: 'running',
  declined: 'muted',
  to_review: 'todo',
  rejected: 'bad',
  to_deliver: 'todo',
  listed: 'good',
  stopped: 'muted',
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', TONE[tone])}>
      {children}
    </span>
  )
}

/** 大类：每类带条数。 */
export function Filters<F extends string>({
  filters,
  value,
  onChange,
  count,
  label,
  name,
}: {
  filters: readonly F[]
  value: F
  onChange: (f: F) => void
  count: (f: F) => number
  label: string
  name: (f: F) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs',
            value === f ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
          )}
        >
          {name(f)} · {count(f)}
        </button>
      ))}
    </div>
  )
}

/** 列表里的一行。 */
export function Row({
  selected,
  onPick,
  children,
}: {
  selected: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onPick}
      className={cn(
        'bg-card w-full rounded-lg border p-3 text-left text-sm transition-colors',
        selected ? 'border-primary ring-primary/30 ring-2' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

/** 过程页里的一张卡片：标题、内容。 */
export function Card({
  title,
  children,
  className,
}: {
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('bg-card rounded-xl border p-4 text-sm shadow-sm', className)}>
      {title ? <h3 className="mb-2 font-medium">{title}</h3> : null}
      {children}
    </section>
  )
}

/**
 * 一栏的样子：左边大类与列表（都是过程），中间是选中那一条的过程页，右边栏放这个过程的输出。
 * 输入在过程页中间完整显示（SDD 0037 第二节第 1 条）。从详情页点进来带着 picked：先落在它
 * 所在的大类。
 */
export function ColumnLayout<F extends string, I>({
  title,
  filters,
  defaultFilter,
  initialFilter,
  items,
  categoryOf,
  keyOf,
  picked,
  onPick,
  renderRow,
  empty,
  children,
  error,
  pending,
  failed,
  actions,
}: {
  title: string
  filters: readonly F[]
  defaultFilter: F
  initialFilter?: F
  items: I[]
  categoryOf: (item: I) => F[]
  keyOf: (item: I) => string
  picked: string | null
  onPick: (key: string) => void
  renderRow: (item: I) => React.ReactNode
  empty: string
  children: (current: I | null) => React.ReactNode
  error: unknown
  pending: boolean
  failed: string | null
  actions?: React.ReactNode
}) {
  const t = useTranslations('knowbots')
  const [chosen, setChosen] = useState<F | null>(null)
  const pickedItem = items.find((item) => keyOf(item) === picked)
  const filter =
    chosen ??
    initialFilter ??
    (pickedItem ? categoryOf(pickedItem).find((f) => filters.includes(f)) : undefined) ??
    defaultFilter
  const shown = items.filter((item) => categoryOf(item).includes(filter))
  const current =
    (pickedItem && categoryOf(pickedItem).includes(filter) ? pickedItem : null) ?? shown[0] ?? null
  return (
    <div className="mt-6 space-y-4">
      {failed || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {failed ? (
            <p className="text-destructive text-sm" role="alert">
              {failed}
            </p>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm">{loadFailed(error, t)}</p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside aria-label={title} className="w-full space-y-3 lg:w-72 lg:shrink-0">
            <Filters
              filters={filters}
              value={filter}
              onChange={setChosen}
              count={(f) => items.filter((item) => categoryOf(item).includes(f)).length}
              label={t('category')}
              name={(f) => t(`categories.${f}` as never)}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">{empty}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((item) => (
                  <li key={keyOf(item)}>
                    <Row
                      selected={current !== null && keyOf(item) === keyOf(current)}
                      onPick={() => onPick(keyOf(item))}
                    >
                      {renderRow(item)}
                    </Row>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {children(current)}
        </div>
      )}
    </div>
  )
}

/** 过程页顶上：标题、徽标、这个名称的详情页链接。 */
export function ProcessHeader({
  title,
  badge,
  requestId,
  owner,
}: {
  title: React.ReactNode
  badge?: React.ReactNode
  requestId: string
  owner: string
}) {
  const t = useTranslations('knowbots')
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge}
      </div>
      <p className="text-muted-foreground text-sm break-all">
        {t('owner', { owner })} ·{' '}
        <Link href={`/names/${requestId}`} className="underline underline-offset-2">
          {t('toName')}
        </Link>
      </p>
    </header>
  )
}
