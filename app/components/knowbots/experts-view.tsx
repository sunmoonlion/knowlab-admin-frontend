'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { draftAction, fetchRequestDetail } from '@/lib/knowbots/client'

import { Picker, rememberPick, type PickerGroup } from './picker'
import { Method, Rules } from './reference'
import {
  Badge,
  KEY,
  loadFailed,
  useFeedback,
  useKnowbots,
  type Avatar,
  type CardProps,
} from './shared'
import { SidePanel } from './side-panel'

// 专家（SDD 0037）：测试通过、交付到 knowmart 的各版本；交付没成功的在这里重试。
// 停用、删除另做（成品的状态机在 0027）。

// 选择框里交付没成功的在前（要我们重试），然后是可用的
const GROUPS = ['failed', 'live'] as const

function isExpert(a: Avatar): boolean {
  return a.stage === 'delivered' || a.stage === 'passed'
}

export function ExpertsView({
  csrfToken,
  picked: initialPick,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const { avatars, error, pending } = useKnowbots()
  const { failed, onError, onDone } = useFeedback()
  const experts = avatars.filter(isExpert)
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  const groups: PickerGroup[] = GROUPS.map((g) => ({
    key: g,
    label: t(`experts.filters.${g}`),
    items: experts
      .filter((a) => (g === 'live') === (a.stage === 'delivered'))
      .map((a) => ({
        id: a.draft.draft_id,
        title: a.draft.name ?? a.draft.title,
        sub: `${t('experts.version', { version: a.draft.version })} · ${t('owner', { owner: a.draft.owner_subject })}`,
        badge: <Badge tone={g === 'live' ? 'good' : 'bad'}>{t(`experts.filters.${g}`)}</Badge>,
      })),
  }))
  const first = groups.flatMap((g) => g.items)[0]?.id
  const current =
    experts.find((a) => a.draft.draft_id === picked) ??
    experts.find((a) => a.draft.draft_id === first) ??
    null

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
        <>
          <Picker
            label={t('experts.title')}
            groups={groups}
            value={current?.draft.draft_id ?? null}
            onPick={(id) => {
              setPicked(id)
              rememberPick({ draft: id })
            }}
          />
          {current ? (
            <div className="flex flex-col items-start gap-6 lg:flex-row">
              <Workspace
                key={current.draft.draft_id}
                expert={current}
                versions={experts.filter((a) => a.draft.request_id === current.draft.request_id)}
                csrfToken={csrfToken}
                onDone={onDone}
                onError={onError}
              />
            </div>
          ) : null}
        </>
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
