'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Detail, Draft, IncubationItem } from '@/contracts/knowbots'
import { createDraft, draftAction, fetchDetail, fetchIncubation } from '@/lib/knowbots/client'

import { AnsweredList, Datasets, ManifestText, Rules, VersionBody } from './reference'
import {
  Badge,
  Card,
  ColumnLayout,
  FIELD,
  KEY,
  ProcessHeader,
  loadFailed,
  useFeedback,
  useWhen,
  type CardProps,
  type Tone,
} from './shared'
import { SidePanel } from './side-panel'

// 孵化（SDD 0037 第四节）：选受理了的创意版本，写清单、校验、孵出准专家；可以请用户审核
// （web端「审核」里一条待办），核出处后才能测。本期孵化照旧是手工贴清单（SDD 0029 以后接
// 辅助、自动孵化），「孵化中（等用户审核、回答）」这一类先有位置。

const FILTERS = ['todo', 'in_progress', 'done'] as const
type Filter = (typeof FILTERS)[number]

const keyOf = (item: IncubationItem) =>
  item.draft ? item.draft.draft_id : `todo:${item.request_id}`

export function draftTone(draft: Draft): Tone {
  if (draft.user_review?.state === 'pending') return 'running'
  if (draft.user_review?.state === 'not_ok' || draft.status === 'failed') return 'bad'
  if (draft.status === 'passed') return 'good'
  return draft.status === 'testing' ? 'running' : 'todo'
}

export function draftState(draft: Draft, t: ReturnType<typeof useTranslations<'knowbots'>>) {
  if (draft.user_review?.state === 'pending') return t('draftState.reviewPending')
  if (draft.user_review?.state === 'not_ok') return t('draftState.reviewRejected')
  if (draft.status === 'pending_test')
    return draft.blocked === 'version_taken'
      ? t('draftState.versionTaken')
      : draft.rules_reviewed_by
        ? t('draftState.ready')
        : t('draftState.toReview')
  return t(`draftStatus.${draft.status}`)
}

export function IncubationView({
  csrfToken,
  picked: initialPick,
  category,
}: {
  csrfToken: string
  picked?: string
  category?: Filter
}) {
  const t = useTranslations('knowbots')
  const board = useQuery({ queryKey: [...KEY, 'board', 'incubation'], queryFn: fetchIncubation })
  const { failed, onError, onDone } = useFeedback()
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  // 正在给哪个名称孵化（从准专家那里点「再孵化」）
  const [hatching, setHatching] = useState<string | null>(null)
  const props = { csrfToken, onDone, onError }
  return (
    <ColumnLayout
      title={t('columns.incubation')}
      filters={FILTERS}
      defaultFilter="todo"
      initialFilter={category}
      items={board.data ?? []}
      categoryOf={(item) => [item.category]}
      keyOf={keyOf}
      picked={picked}
      onPick={(key) => {
        setHatching(null)
        setPicked(key)
      }}
      empty={t('empty.incubation')}
      error={board.error}
      pending={board.isPending}
      failed={failed}
      renderRow={(item) =>
        item.draft ? (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{t('draftLabel', { label: item.draft.label })}</span>
              <Badge tone={draftTone(item.draft)}>{draftState(item.draft, t)}</Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {item.title} · {t('fromIdea', { version: item.draft.request_version })}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{item.title}</span>
              <Badge tone="todo">{t('categories.todo')}</Badge>
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {item.owner_subject} ·{' '}
              {t('latestAccepted', { version: item.latest_accepted ?? item.latest_version })}
            </span>
          </>
        )
      }
    >
      {(current) =>
        !current ? null : hatching === current.request_id || !current.draft ? (
          <Hatch
            key={`hatch:${current.request_id}`}
            item={current}
            onCreated={async (draftId) => {
              await onDone()
              setHatching(null)
              setPicked(draftId)
            }}
            onCancel={current.draft ? () => setHatching(null) : undefined}
            {...props}
          />
        ) : (
          <DraftProcess
            key={current.draft.draft_id}
            item={current}
            draft={current.draft}
            onHatch={() => setHatching(current.request_id)}
            {...props}
          />
        )
      }
    </ColumnLayout>
  )
}

function useDetail(requestId: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
}

/** 写清单时要对照的：用户的数据（绑定照它写）、测试中用户答过的问题（进规则出处）。 */
function Materials({ detail }: { detail: Detail }) {
  const t = useTranslations('knowbots')
  return (
    <>
      <details className="bg-card rounded-xl border p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-medium">
          {t('tabs.datasets')} · {detail.datasets.length}
        </summary>
        <div className="mt-3">
          <Datasets datasets={detail.datasets} />
        </div>
      </details>
      <details className="bg-card rounded-xl border p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-medium">
          {t('tabs.answered')} · {detail.answered.length}
        </summary>
        <div className="mt-3">
          <AnsweredList answered={detail.answered} />
        </div>
      </details>
    </>
  )
}

/** 孵化：选受理了的创意版本（默认最新的），读它的原文，贴清单孵出准专家。 */
function Hatch({
  item,
  onCreated,
  onCancel,
  csrfToken,
  onError,
}: CardProps & {
  item: IncubationItem
  onCreated: (draftId: string) => Promise<void>
  onCancel?: () => void
}) {
  const t = useTranslations('knowbots')
  const detail = useDetail(item.request_id)
  const accepted = (detail.data?.versions ?? []).filter((v) => v.acceptance?.accepted)
  const [chosen, setChosen] = useState<number | null>(null)
  const version =
    accepted.find((v) => v.version === chosen) ?? accepted[accepted.length - 1] ?? null
  const [manifest, setManifest] = useState('')
  const [badJson, setBadJson] = useState(false)
  const create = useMutation({
    mutationFn: (doc: unknown) =>
      createDraft(item.request_id, doc, version?.version ?? 0, csrfToken),
    onSuccess: async (made) => {
      setManifest('')
      await onCreated(made.draft_id)
    },
    onError,
  })
  return (
    <section aria-label={t('hatch.title')} className="min-w-0 flex-1 space-y-4">
      <ProcessHeader
        title={`${t('hatch.title')} · ${item.title}`}
        requestId={item.request_id}
        owner={item.owner_subject}
      />
      {detail.isError ? (
        <p className="text-destructive text-sm">{loadFailed(detail.error, t)}</p>
      ) : detail.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : !version ? (
        <Card>
          <p className="text-muted-foreground">{t('hatch.noAccepted')}</p>
        </Card>
      ) : (
        <>
          <Card title={t('hatch.pick')}>
            <select
              className={FIELD}
              aria-label={t('hatch.pick')}
              value={version.version}
              onChange={(e) => setChosen(Number(e.target.value))}
            >
              {accepted.map((v) => (
                <option key={v.version} value={v.version}>
                  {t('ideaVersion', { version: v.version })}
                </option>
              ))}
            </select>
          </Card>
          {/* 输入：选中的这一版创意，完整显示（规则出处只认这一版里的句子） */}
          <Card title={t('input.idea', { version: version.version })}>
            <VersionBody version={version} />
          </Card>
          <Materials detail={detail.data} />
          <Card title={t('hatch.manual')}>
            <p className="text-muted-foreground mb-3">{t('hatch.hint')}</p>
            <label className="block">
              {t('manifest')}
              <textarea
                className={`${FIELD} font-mono text-xs`}
                rows={10}
                value={manifest}
                onChange={(e) => {
                  setBadJson(false)
                  setManifest(e.target.value)
                }}
              />
            </label>
            {badJson ? (
              <p className="text-destructive mt-2" role="alert">
                {t('badJson')}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="primary-button"
                disabled={!manifest.trim() || create.isPending}
                onClick={() => {
                  let doc: unknown
                  try {
                    doc = JSON.parse(manifest)
                  } catch {
                    setBadJson(true)
                    return
                  }
                  create.mutate(doc)
                }}
              >
                {t('createDraft')}
              </button>
              {onCancel ? (
                <button type="button" className="secondary-button" onClick={onCancel}>
                  {t('hatch.cancel')}
                </button>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </section>
  )
}

/** 一位准专家：请用户审核、核出处；它出自的那一版创意在中间完整显示，准专家本身在右边。 */
function DraftProcess({
  item,
  draft,
  onHatch,
  csrfToken,
  onDone,
  onError,
}: CardProps & { item: IncubationItem; draft: Draft; onHatch: () => void }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const detail = useDetail(item.request_id)
  const version = detail.data?.versions.find((v) => v.version === draft.request_version)
  const act = useMutation({
    mutationFn: (action: 'review-request' | 'rules-review') =>
      draftAction(draft.draft_id, action, csrfToken),
    onSuccess: () => onDone(),
    onError,
  })
  const review = draft.user_review
  return (
    <>
      <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
        <ProcessHeader
          title={`${t('draftLabel', { label: draft.label })} · ${item.title}`}
          badge={<Badge tone={draftTone(draft)}>{draftState(draft, t)}</Badge>}
          requestId={item.request_id}
          owner={item.owner_subject}
        />
        <Card title={t('incubation.next')}>
          {draft.status === 'pending_test' ? (
            <div className="space-y-3">
              {/* 请用户审核：可选；请了就等用户答完才能测 */}
              {review ? (
                <p>
                  {review.state === 'pending'
                    ? t('incubation.reviewWaiting', { at: when(review.requested_at) })
                    : review.state === 'ok'
                      ? t('incubation.reviewOk')
                      : t('incubation.reviewNotOk', { note: review.note ?? '' })}
                </p>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={act.isPending}
                  onClick={() => act.mutate('review-request')}
                >
                  {t('incubation.askUser')}
                </button>
              )}
              {draft.rules_reviewed_by ? (
                <p className="text-muted-foreground">
                  {t('reviewedBy', { who: draft.rules_reviewed_by })}
                </p>
              ) : review?.state !== 'not_ok' ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">{t('reviewHint')}</p>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={act.isPending}
                    onClick={() => act.mutate('rules-review')}
                  >
                    {t('review')}
                  </button>
                </div>
              ) : null}
              {draft.blocked === 'version_taken' ? (
                <p className="text-amber-800 dark:text-amber-300">{t('blocked.version_taken')}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground">{draftState(draft, t)}</p>
          )}
          <div className="mt-3">
            <button type="button" className="secondary-button" onClick={onHatch}>
              {t('hatch.again')}
            </button>
          </div>
        </Card>
        {/* 输入：它出自的那一版创意 */}
        {version ? (
          <Card title={t('input.idea', { version: version.version })}>
            <VersionBody version={version} />
          </Card>
        ) : detail.isError ? (
          <p className="text-destructive text-sm">{loadFailed(detail.error, t)}</p>
        ) : null}
      </section>
      <SidePanel
        label={t('output')}
        tabs={[
          {
            key: 'rules',
            label: t('outputs.rules'),
            count: draft.rule_sources.length,
            content: <Rules draft={draft} />,
          },
          {
            key: 'manifest',
            label: t('outputs.manifest'),
            content: <ManifestText draftId={draft.draft_id} />,
          },
        ]}
      />
    </>
  )
}
