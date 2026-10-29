'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Detail, Draft, IncubationItem } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { draftAction, fetchDetail, fetchIncubation, handBack } from '@/lib/knowbots/client'

import { AnsweredList, ManifestText, Rules, VersionBody } from './reference'
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

// 孵化（SDD 0037 第四节；专家孵化方案第十二节）：作者请了平台孵化、受理过的名称，在同一个
// 编辑器里改工作稿——改的都是提议，作者接受了才算；出一版是平台模式的准专家。可以请用户看
// （web端「待办」里一条），核出处后才能测。做完把草稿交还作者。贴清单的老做法已删（decisions 10-29）。

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

/** 写清单时要对照的：测试中用户答过的问题（进规则出处）。清单 v2 不绑数据（测试集另记）。 */
function Materials({ detail }: { detail: Detail }) {
  const t = useTranslations('knowbots')
  return (
    <details className="bg-card rounded-xl border p-4 text-sm shadow-sm">
      <summary className="cursor-pointer font-medium">
        {t('tabs.answered')} · {detail.answered.length}
      </summary>
      <div className="mt-3">
        <AnsweredList answered={detail.answered} />
      </div>
    </details>
  )
}

/** 孵化：读受理了的创意版本，到工作稿里改（改的是提议）、出一版；做完交还作者。 */
function Hatch({
  item,
  onCancel,
  csrfToken,
  onDone,
  onError,
}: CardProps & {
  item: IncubationItem
  onCancel?: () => void
}) {
  const t = useTranslations('knowbots')
  const detail = useDetail(item.request_id)
  const accepted = (detail.data?.versions ?? []).filter((v) => v.acceptance?.accepted)
  const [chosen, setChosen] = useState<number | null>(null)
  const version =
    accepted.find((v) => v.version === chosen) ?? accepted[accepted.length - 1] ?? null
  const [confirmBack, setConfirmBack] = useState(false)
  const back = useMutation({
    mutationFn: () => handBack(item.request_id, csrfToken),
    onSuccess: () => onDone(),
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
          <Card title={t('hatch.editor')}>
            <p className="text-muted-foreground mb-3">{t('hatch.editorHint')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/names/${item.request_id}/workdraft`}
                className="primary-button inline-block"
              >
                {t('hatch.openEditor')}
              </Link>
              {onCancel ? (
                <button type="button" className="secondary-button" onClick={onCancel}>
                  {t('hatch.cancel')}
                </button>
              ) : null}
            </div>
          </Card>
          <Card title={t('hatch.handBack')}>
            <p className="text-muted-foreground mb-3">{t('hatch.handBackHint')}</p>
            {confirmBack ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="primary-button"
                  disabled={back.isPending}
                  onClick={() => back.mutate()}
                >
                  {t('hatch.handBackYes')}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmBack(false)}
                >
                  {t('hatch.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmBack(true)}
              >
                {t('hatch.handBack')}
              </button>
            )}
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
