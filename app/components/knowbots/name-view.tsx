'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import type { Detail, Event, Summary } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { fetchDetail } from '@/lib/knowbots/client'

import { Amendments } from './reference'
import { Card, KEY, loadFailed, useWhen, type Translate } from './shared'

// 一个名称的详情页（SDD 0037 第九节）：顶上一行每个过程最新的一项；下面按时间排的记录，
// 每条写哪个过程、输入、输出、谁、何时，点了去那一栏看那一条。一生不是一条直线（测试跑着
// 时用户又改了创意），所以不写单一的「当前在哪段」。

export function NameView({ requestId }: { requestId: string }) {
  const t = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
  if (detail.isError)
    return <p className="text-destructive mt-6 text-sm">{loadFailed(detail.error, t)}</p>
  if (detail.isPending) return <p className="text-muted-foreground mt-6 text-sm">{t('loading')}</p>
  const life = detail.data
  return (
    <div className="mt-6 space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{life.title}</h2>
        <p className="text-muted-foreground text-sm break-all">
          {t('owner', { owner: life.owner_subject })} · {t('runtime', { runtime: life.runtime })}
        </p>
        <SummaryLine summary={life.summary} />
      </header>
      <Card title={t('name.timeline')}>
        <Timeline life={life} />
        {life.tests.some((x) => x.backfilled) ? (
          <p className="text-muted-foreground mt-3 text-xs">{t('tests.backfilled')}</p>
        ) : null}
      </Card>
      {life.amendments.length > 0 ? (
        <Card title={t('name.amendments')}>
          <Amendments amendments={life.amendments} />
        </Card>
      ) : null}
    </div>
  )
}

export function summaryParts(summary: Summary, t: Translate): string[] {
  const parts = [t('ideaVersion', { version: summary.version })]
  parts.push(
    summary.acceptance ? t(`summary.${summary.acceptance}`) : t('summary.acceptancePending'),
  )
  if (summary.draft) parts.push(t('draftLabel', { label: summary.draft }))
  if (summary.test)
    parts.push(
      `${t('testNumber', { number: summary.test.number })} ${t(`testStatus.${summary.test.status}`)}`,
    )
  if (summary.expert)
    parts.push(
      `${t('expertVersion', { version: summary.expert.version })} · ${t(`expertStage.${summary.expert.stage}`)}`,
    )
  return parts
}

function SummaryLine({ summary }: { summary: Summary }) {
  const t = useTranslations('knowbots')
  return (
    <p className="text-sm font-medium" aria-label={t('name.summary')}>
      {summaryParts(summary, t).join(' · ')}
    </p>
  )
}

type Target = { pathname: string; query: Record<string, string> }

/** 这条记录的输出在哪一栏、哪一条。 */
function targetOf(event: Event, life: Detail): Target | null {
  const s = (key: string) => (typeof event[key] === 'string' ? (event[key] as string) : '')
  switch (event.kind) {
    case 'version':
    case 'acceptance':
      return { pathname: '/acceptance', query: { item: `${life.request_id}:${event.version}` } }
    case 'draft':
    case 'review_requested':
    case 'review_answered':
      return { pathname: '/incubation', query: { item: s('draft_id') } }
    case 'test_started':
    case 'test_finished':
      return { pathname: '/tests', query: { item: s('test_id') } }
    default:
      return s('expert_id') ? { pathname: '/delivery', query: { item: s('expert_id') } } : null
  }
}

function Timeline({ life }: { life: Detail }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  if (life.timeline.length === 0) return <p className="text-muted-foreground">—</p>
  return (
    <ol className="space-y-2">
      {life.timeline.map((event, i) => {
        const target = targetOf(event, life)
        const line = eventLine(event, t)
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted-foreground w-36 shrink-0 text-xs">{when(event.at)}</span>
            {target ? (
              <Link href={target} className="underline underline-offset-2">
                {line}
              </Link>
            ) : (
              <span>{line}</span>
            )}
            {event.by ? <span className="text-muted-foreground text-xs">{event.by}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

/** 一条记录的话：哪个过程、输入 → 输出。 */
export function eventLine(event: Event, t: Translate): string {
  const v = (key: string) => {
    const value = event[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }
  switch (event.kind) {
    case 'version':
      return v('version') === '1'
        ? t('event.submitted')
        : t('event.revised', { version: v('version') })
    case 'acceptance':
      return (
        t(event.accepted ? 'event.accepted' : 'event.rejected', { version: v('version') }) +
        (event.trial ? ` · ${t('acceptance.trial')}` : '')
      )
    case 'draft':
      return t('event.draft', { version: v('request_version'), label: v('label') })
    case 'review_requested':
      return t('event.reviewRequested', { label: v('label') })
    case 'review_answered':
      return t(event.ok ? 'event.reviewOk' : 'event.reviewNotOk', { label: v('label') })
    case 'test_started':
      return t('event.testStarted', { label: v('label'), number: v('number') })
    case 'test_finished':
      return t('event.testFinished', {
        number: v('number'),
        status: t(`testStatus.${v('status')}` as never),
      })
    case 'expert':
      return (
        t('event.expert', { number: v('test_number') || '—', version: v('version') }) +
        (event.trial ? ` · ${t('trial')}` : '')
      )
    case 'returned':
      return t('event.returned', { version: v('version') })
    case 'user_decided':
      return t(event.accepted ? 'event.userAccepted' : 'event.userDeclined', {
        version: v('version'),
      })
    case 'reviewed':
      return event.approved
        ? t('event.approved', {
            version: v('version'),
            listing: t(`record.approved.${v('listing') === 'public' ? 'public' : 'self'}`),
          })
        : t('event.reviewRejected', { version: v('version') })
    case 'listed':
      return t('event.listed', { version: v('version') })
    case 'stopped':
      return t('event.stopped', { version: v('version') })
    default:
      return event.kind
  }
}
