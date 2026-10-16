'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Question } from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import {
  answerQuestion,
  fetchQuestions,
  questionToUser,
  type AnswerInput,
} from '@/lib/knowbots/client'

const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
const KEY = ['admin', 'knowbots'] as const

// 测试中待人决定的问题（SDD 0027 §3.4，有人值守）。审批与跑法层面的由我们答；
// 投资判断转给用户本人（C-L1），拿不准的一律转给用户；转给用户的这里只看不答。
export function OpenQuestions({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbots.questions')
  const client = useQueryClient()
  const list = useQuery({ queryKey: [...KEY, 'questions'], queryFn: fetchQuestions })
  const [failed, setFailed] = useState<string | null>(null)
  const done = () => {
    setFailed(null)
    return client.invalidateQueries({ queryKey: KEY })
  }
  const onError = (error: unknown) =>
    setFailed(
      t('failed', { code: error instanceof ApiClientError ? error.problem.code : 'unexpected' }),
    )
  const answer = useMutation({
    mutationFn: ({ id, value }: { id: string; value: AnswerInput }) =>
      answerQuestion(id, value, csrfToken),
    onSuccess: done,
    onError,
  })
  const route = useMutation({
    mutationFn: (id: string) => questionToUser(id, csrfToken),
    onSuccess: done,
    onError,
  })

  if (list.isPending || list.isError || list.data.length === 0) return null
  return (
    <section aria-label={t('title')} className="space-y-3">
      <h2 className="font-medium">{t('title')}</h2>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      {list.data.map((q) => (
        <QuestionCard
          key={q.question_id}
          question={q}
          busy={answer.isPending || route.isPending}
          onAnswer={(value) => answer.mutate({ id: q.question_id, value })}
          onToUser={() => route.mutate(q.question_id)}
        />
      ))}
    </section>
  )
}

type CardProps = {
  question: Question
  busy: boolean
  onAnswer: (value: AnswerInput) => void
  onToUser: () => void
}

function QuestionCard({ question: q, busy, onAnswer, onToUser }: CardProps) {
  const t = useTranslations('knowbots.questions')
  const [text, setText] = useState('')
  return (
    <article className="rounded-xl border border-amber-300 p-4 text-sm">
      <p className="text-muted-foreground">
        {t(`kind.${q.kind}`)} · {q.title} · {t('where', { case: q.case_id, version: q.version })}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{q.text}</p>
      {q.last_error ? <p className="text-destructive">{q.last_error}</p> : null}
      {q.route === 'user' ? (
        <p className="text-muted-foreground mt-2">{t('withUser')}</p>
      ) : q.kind === 'tool_approval' ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => onAnswer({ decision: 'approve' })}
          >
            {t('approve')}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => onAnswer({ decision: 'deny' })}
          >
            {t('deny')}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {q.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => onAnswer({ option_id: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
          {q.allow_free_text ? (
            <label className="block">
              {t('ownWords')}
              <textarea
                className={FIELD}
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            {q.allow_free_text ? (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !text.trim()}
                onClick={() => onAnswer({ text: text.trim() })}
              >
                {t('answer')}
              </button>
            ) : null}
            <button type="button" className="secondary-button" disabled={busy} onClick={onToUser}>
              {t('toUser')}
            </button>
          </div>
          <p className="text-muted-foreground text-xs">{t('judgementHint')}</p>
        </div>
      )}
    </article>
  )
}
