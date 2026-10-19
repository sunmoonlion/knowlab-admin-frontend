'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { fetchRequestDetail } from '@/lib/knowbots/client'

import { OpenQuestions } from './open-questions'
import { Picker, rememberPick, type PickerGroup } from './picker'
import { Amendments, Answered, Cases, Datasets, Method } from './reference'
import {
  Badge,
  IDEA_TONE,
  KEY,
  Progress,
  StageBadge,
  loadFailed,
  stageOf,
  useFeedback,
  useKnowbots,
  type CardProps,
  type Idea,
} from './shared'
import { SidePanel } from './side-panel'

// 创意（SDD 0037）：用户交来的方法、验收用例、数据，之后写的补充方法也挂在这里。
// 这一页处理补充（用进出处或不照做）、看它孵化过哪些分身；孵化本身在分身页做。
// 选哪个创意用页面顶上的选择框，中间整块是它的详情。

type Group = 'todo' | 'waiting' | 'working' | 'expert'
const GROUPS: readonly Group[] = ['todo', 'waiting', 'working', 'expert']

function groupOf(idea: Idea): Group {
  return idea.stage === 'amend' || idea.stage === 'hatch' ? 'todo' : idea.stage
}

const RANK: Record<Idea['stage'], number> = {
  amend: 0,
  hatch: 1,
  waiting: 2,
  working: 3,
  expert: 4,
}

export function IdeasView({
  csrfToken,
  picked: initialPick,
  canRelease = true,
}: {
  csrfToken: string
  picked?: string
  canRelease?: boolean
}) {
  const t = useTranslations('knowbots')
  const { ideas, error, pending } = useKnowbots()
  const { failed, onError, onDone } = useFeedback()
  const [picked, setPicked] = useState<string | null>(initialPick ?? null)
  const sorted = [...ideas].sort(
    (a, b) =>
      RANK[a.stage] - RANK[b.stage] ||
      (b.request.created_at ?? '').localeCompare(a.request.created_at ?? ''),
  )
  const label: Record<Group, string> = {
    todo: t('ideaFilters.todo'),
    waiting: t('ideaFilters.waiting'),
    working: t('ideaStage.working'),
    expert: t('ideaFilters.expert'),
  }
  const groups: PickerGroup[] = GROUPS.map((g) => ({
    key: g,
    label: label[g],
    items: sorted
      .filter((i) => groupOf(i) === g)
      .map((i) => ({
        id: i.request.request_id,
        title: i.request.title,
        sub:
          t('owner', { owner: i.request.owner_subject }) +
          (i.latest
            ? ` · ${t('draft', { version: i.latest.version, revision: i.latest.revision })} · ${t(`stage.${stageOf(i.latest)}`)}`
            : ''),
        badge: <Badge tone={IDEA_TONE[i.stage]}>{t(`ideaStage.${i.stage}`)}</Badge>,
      })),
  }))
  // 没点名的：要我们动手的第一件，没有就最近的
  const first = groups.flatMap((g) => g.items)[0]?.id
  const current =
    ideas.find((i) => i.request.request_id === picked) ??
    ideas.find((i) => i.request.request_id === first) ??
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
      ) : ideas.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRequests')}</p>
      ) : (
        <>
          <Picker
            label={t('requestsTitle')}
            groups={groups}
            value={current?.request.request_id ?? null}
            onPick={(id) => {
              setPicked(id)
              rememberPick({ request: id })
            }}
          />
          {current ? (
            <div className="flex flex-col items-start gap-6 lg:flex-row">
              <Workspace
                key={current.request.request_id}
                idea={current}
                csrfToken={csrfToken}
                canRelease={canRelease}
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

function Workspace({ idea, ...props }: CardProps & { idea: Idea }) {
  const t = useTranslations('knowbots')
  const { request, drafts, stage, questions } = idea
  const detail = useQuery({
    queryKey: [...KEY, 'request', request.request_id],
    queryFn: () => fetchRequestDetail(request.request_id),
  })
  const latestStage = stageOf(idea.latest)
  return (
    <>
      <section aria-label={request.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{request.title}</h2>
            <Badge tone={IDEA_TONE[stage]}>{t(`ideaStage.${stage}`)}</Badge>
          </div>
          <p className="text-muted-foreground text-sm break-all">
            {t('meta', { owner: request.owner_subject, runtime: request.runtime })}
          </p>
          <Progress
            steps={['submit', 'hatch', 'test', 'expert'].map((s) => t(`ideaSteps.${s}`))}
            // 还没有分身：在孵化；有分身在测或没通过：在测试（没通过标红）；出了专家：都走完
            at={stage === 'expert' ? 4 : latestStage === 'none' ? 1 : 2}
            bad={latestStage === 'failed'}
            label={t('progress')}
          />
        </header>
        <div className="bg-card space-y-3 rounded-xl border p-4 text-sm shadow-sm">
          <h3 className="font-medium">{t(`ideaNext.${stage}`)}</h3>
          <Link
            href={{ pathname: '/avatars', query: { hatch: request.request_id } }}
            className="primary-button inline-block"
          >
            {t('hatch.forIdea')}
          </Link>
        </div>
        {detail.data && (detail.data.amendments?.length ?? 0) > 0 ? (
          <section
            className="bg-card rounded-xl border p-4 text-sm shadow-sm"
            aria-label={t('tabs.amendments')}
          >
            <h3 className="mb-2 font-medium">{t('tabs.amendments')}</h3>
            <Amendments amendments={detail.data.amendments ?? []} {...props} />
          </section>
        ) : null}
        <OpenQuestions questions={questions} csrfToken={props.csrfToken} />
        <section
          className="bg-card rounded-xl border p-4 text-sm shadow-sm"
          aria-label={t('avatarsOfIdea')}
        >
          <h3 className="mb-2 font-medium">{t('avatarsOfIdea')}</h3>
          {drafts.length === 0 ? (
            <p className="text-muted-foreground">{t('noDraftYet')}</p>
          ) : (
            <ul className="divide-y">
              {drafts.map((d) => {
                const cases = d.report?.cases ?? []
                return (
                  <li key={d.draft_id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link
                      href={{ pathname: '/avatars', query: { draft: d.draft_id } }}
                      className="font-medium underline underline-offset-2"
                    >
                      {t('draft', { version: d.version, revision: d.revision })}
                    </Link>
                    <StageBadge stage={stageOf(d)} />
                    {cases.length > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {t('casesPassed', {
                          met: cases.filter((c) => c.status === 'passed').length,
                          total: cases.length,
                        })}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        {detail.isError ? (
          <p className="text-destructive text-sm">{loadFailed(detail.error, t)}</p>
        ) : null}
      </section>
      {detail.data ? (
        <SidePanel
          label={t('reference')}
          tabs={[
            { key: 'method', label: t('tabs.method'), content: <Method detail={detail.data} /> },
            {
              key: 'cases',
              label: t('tabs.cases'),
              count: detail.data.cases.length,
              content: <Cases cases={detail.data.cases} />,
            },
            {
              key: 'datasets',
              label: t('tabs.datasets'),
              count: detail.data.datasets.length,
              content: <Datasets detail={detail.data} />,
            },
            {
              key: 'answered',
              label: t('tabs.answered'),
              count: detail.data.answered.length,
              content: <Answered detail={detail.data} />,
            },
          ]}
        />
      ) : null}
    </>
  )
}
