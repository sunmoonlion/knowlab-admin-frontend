'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { draftAction, fetchRequestDetail } from '@/lib/knowbots/client'

import { Method, Rules } from './reference'
import {
  Badge,
  Filters,
  KEY,
  Row,
  loadFailed,
  useFeedback,
  useKnowbots,
  type Avatar,
  type CardProps,
} from './shared'
import { SidePanel } from './side-panel'

// 专家（SDD 0037）：测试通过、交付到 knowmart 的各版本；交付没成功的在这里重试。
// 停用、删除另做（成品的状态机在 0027）。

const FILTERS = ['live', 'failed'] as const
type Filter = (typeof FILTERS)[number]

function isExpert(a: Avatar): boolean {
  return a.stage === 'delivered' || a.stage === 'passed'
}

function matches(a: Avatar, filter: Filter): boolean {
  return filter === 'live' ? a.stage === 'delivered' : a.stage === 'passed'
}

export function ExpertsView({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbots')
  const { avatars, error, pending } = useKnowbots()
  const { failed, onError, onDone } = useFeedback()
  const experts = avatars.filter(isExpert)
  // 没选过：有交付没成功的先看那些
  const [chosen, setFilter] = useState<Filter | null>(null)
  const filter = chosen ?? (experts.some((a) => a.stage === 'passed') ? 'failed' : 'live')
  const [picked, setPicked] = useState<string | null>(null)
  const shown = experts.filter((a) => matches(a, filter))
  const current = experts.find((a) => a.draft.draft_id === picked) ?? shown[0] ?? experts[0] ?? null

  return (
    <div className="mt-6 space-y-4">
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm">{loadFailed(error, t)}</p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : experts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('experts.none')}</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside aria-label={t('experts.title')} className="w-full space-y-3 lg:w-72 lg:shrink-0">
            <Filters
              filters={FILTERS}
              value={filter}
              onChange={setFilter}
              count={(f) => experts.filter((a) => matches(a, f)).length}
              label={t('filter')}
              name={(f) => t(`experts.filters.${f}`)}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('noMatch')}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((a) => (
                  <li key={a.draft.draft_id}>
                    <Row
                      selected={a.draft.draft_id === current?.draft.draft_id}
                      onPick={() => setPicked(a.draft.draft_id)}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-medium">{a.draft.name ?? a.draft.title}</span>
                        <Badge tone={a.stage === 'delivered' ? 'good' : 'bad'}>
                          {t(`experts.filters.${a.stage === 'delivered' ? 'live' : 'failed'}`)}
                        </Badge>
                      </span>
                      <span className="text-muted-foreground mt-1 block truncate text-xs">
                        {t('experts.version', { version: a.draft.version })} ·{' '}
                        {t('owner', { owner: a.draft.owner_subject })}
                      </span>
                    </Row>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {current ? (
            <Workspace
              key={current.draft.draft_id}
              expert={current}
              versions={experts.filter((a) => a.draft.request_id === current.draft.request_id)}
              csrfToken={csrfToken}
              onDone={onDone}
              onError={onError}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function Workspace({
  expert,
  versions,
  csrfToken,
  onDone,
  onError,
}: CardProps & { expert: Avatar; versions: Avatar[] }) {
  const t = useTranslations('knowbots')
  const format = useFormatter()
  const { draft } = expert
  const detail = useQuery({
    queryKey: [...KEY, 'request', draft.request_id],
    queryFn: () => fetchRequestDetail(draft.request_id),
  })
  const retry = useMutation({
    mutationFn: () => draftAction(draft.draft_id, 'deliver', csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  return (
    <>
      <section aria-label={draft.name ?? draft.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">{draft.name ?? draft.title}</h2>
          <p className="text-muted-foreground text-sm break-all">
            {t('meta', { owner: draft.owner_subject, runtime: draft.runtime })}
          </p>
        </header>
        <div className="bg-card space-y-2 rounded-xl border p-4 text-sm shadow-sm">
          {expert.stage === 'delivered' ? (
            <>
              <p>
                {t('experts.version', { version: draft.version })}
                {draft.knowbot_id ? ` · ${t('experts.knowbotId', { id: draft.knowbot_id })}` : ''}
              </p>
              {draft.delivered_at ? (
                <p className="text-muted-foreground">
                  {t('experts.deliveredAt', {
                    at: format.dateTime(new Date(draft.delivered_at), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-medium">{t('experts.deliveryFailed')}</p>
              {draft.last_error ? <p className="text-destructive">{draft.last_error}</p> : null}
              <button
                type="button"
                className="primary-button"
                disabled={retry.isPending}
                onClick={() => retry.mutate()}
              >
                {t('deliver')}
              </button>
            </>
          )}
          <p>
            <Link
              href={{ pathname: '/avatars', query: { draft: draft.draft_id } }}
              className="underline underline-offset-2"
            >
              {t('experts.from', {
                avatar: t('draft', { version: draft.version, revision: draft.revision }),
              })}
            </Link>
          </p>
        </div>
        {versions.length > 1 ? (
          <section
            className="bg-card rounded-xl border p-4 text-sm shadow-sm"
            aria-label={t('experts.versions')}
          >
            <h3 className="mb-2 font-medium">{t('experts.versions')}</h3>
            <ul className="space-y-1">
              {versions.map((v) => (
                <li key={v.draft.draft_id}>
                  {t('experts.version', { version: v.draft.version })} ·{' '}
                  {t('draft', { version: v.draft.version, revision: v.draft.revision })} ·{' '}
                  {t(`status.${v.draft.status}`)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
      <SidePanel
        label={t('reference')}
        tabs={[
          ...(detail.data
            ? [{ key: 'method', label: t('tabs.method'), content: <Method detail={detail.data} /> }]
            : []),
          {
            key: 'rules',
            label: t('tabs.rules'),
            count: draft.rule_sources.length,
            content: <Rules draft={draft} />,
          },
        ]}
      />
    </>
  )
}
