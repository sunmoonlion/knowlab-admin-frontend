'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Step, Suggestion, WorkdraftBody } from '@/contracts/workdraft'
import { placed } from '@/lib/knowbots/workdraft'

import { Card } from './shared'

// 工作稿格子旁边的「AI 建议」（专家孵化方案第 8.3、9.1 节）：改成什么、理由、出处（照实标「这是 AI
// 的提议」、出自我创意里的哪句原话、出自我答过的缺口），三个按钮：接受、改了再接受、不要；出处核
// 不上的只能改了再接受。加一步的建议在步骤列表里显示为待接受的新步；放不到格子旁边的列在顶上。

const BOX = 'w-full rounded-md border bg-transparent px-3 py-1.5 text-sm'

export type Choice = 'accept' | 'accept_edited' | 'reject'

type Suggestions = {
  // 还没处理的建议：按它显示在哪（home）分好
  at: (home: string) => Suggestion[]
  busy: boolean
  decide: (suggestion: Suggestion, choice: Choice, value?: unknown) => void
}

export const SuggestionsContext = createContext<Suggestions>({
  at: () => [],
  busy: false,
  decide: () => undefined,
})

const NEW_STEP = /^steps\/([^/]+)$/

/**
 * 一条建议显示在哪：一步整块的在那一步的头上；加一步（还没有这一步）的是待接受的新步
 * （`new-step`）；页面上有这一格的在这一格旁边；一组里加一条的在那一组；都不是的列在顶上
 * （`elsewhere`）。
 */
export function homeOf(suggestion: Suggestion, body: WorkdraftBody): string {
  const { path } = suggestion
  const step = NEW_STEP.exec(path)
  if (step) {
    const there = body.steps.some((s) => s.id === step[1])
    if (there) return path
    return suggestion.op === 'add' ? 'new-step' : 'elsewhere'
  }
  if (placed(path, body)) return path
  const parent = path.split('/').slice(0, -1).join('/')
  if (parent.split('/').length === 3 && placed(parent, body)) return parent
  return 'elsewhere'
}

/** 这一处（格子、一组、一步的头上）的 AI 建议。 */
export function SuggestionsAt({ home }: { home: string }) {
  const { at } = useContext(SuggestionsContext)
  const found = at(home)
  if (found.length === 0) return null
  return (
    <div className="space-y-2">
      {found.map((s) => (
        <SuggestionBox key={s.id} suggestion={s} />
      ))}
    </div>
  )
}

function shown(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/** 一条 AI 建议：改成什么、理由、出处，三个按钮。 */
export function SuggestionBox({ suggestion: s }: { suggestion: Suggestion }) {
  const t = useTranslations('workdraft.ai')
  const { busy, decide } = useContext(SuggestionsContext)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(() => shown(s.value))
  const [bad, setBad] = useState(false)
  const structured = s.value !== undefined && s.value !== null && typeof s.value !== 'string'
  const needsValue = s.op === 'set' || s.op === 'add'
  const submit = () => {
    if (!needsValue) return decide(s, 'accept_edited')
    if (!structured) return decide(s, 'accept_edited', text)
    try {
      decide(s, 'accept_edited', JSON.parse(text))
      setBad(false)
    } catch {
      setBad(true)
    }
  }
  return (
    <aside
      className="space-y-1.5 rounded-lg border border-sky-300 bg-sky-50/60 p-2 text-xs dark:bg-sky-950/30"
      aria-label={t('label')}
      data-testid={`suggestion-${s.id}`}
    >
      <p className="font-medium">
        {s.kinds.includes('operator') ? t('operatorLabel') : t('label')} · {t(`op.${s.op}`)}
      </p>
      {s.op === 'move' ? (
        <p>{t('moveTo', { n: Number(s.value) + 1 })}</p>
      ) : s.op === 'remove' ? null : structured ? (
        <pre className="bg-background/60 max-h-48 overflow-auto rounded p-1.5 whitespace-pre-wrap">
          {shown(s.value)}
        </pre>
      ) : (
        <p className="whitespace-pre-wrap">{shown(s.value)}</p>
      )}
      <p className="text-muted-foreground">{t('reason', { reason: s.reason })}</p>
      <SourceLine suggestion={s} />
      {!s.verified ? (
        <p className="text-destructive" role="note" data-testid={`unverified-${s.id}`}>
          {t('unverified')}
        </p>
      ) : null}
      {editing ? (
        <div className="space-y-1">
          {needsValue ? (
            <textarea
              aria-label={t('editLabel')}
              className={`${BOX} ${structured ? 'font-mono text-xs' : ''}`}
              rows={structured ? 6 : 3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : null}
          {bad ? <p className="text-destructive">{t('badJson')}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || (needsValue && !text.trim())} onClick={submit}>
              {t('acceptEdited')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('cancelEdit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !s.verified}
            title={s.verified ? undefined : t('unverified')}
            onClick={() => decide(s, 'accept')}
          >
            {t('accept')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            {t('edit')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(s, 'reject')}>
            {t('reject')}
          </Button>
        </div>
      )}
    </aside>
  )
}

/** 出处照实写：是 AI 的提议、出自我创意里的哪句原话、出自我答过的缺口。 */
function SourceLine({ suggestion: s }: { suggestion: Suggestion }) {
  const t = useTranslations('workdraft.ai')
  const quotes = s.sources.filter((r) => r.kind === 'idea' && r.quote).map((r) => r.quote)
  return (
    <ul className="text-muted-foreground space-y-0.5">
      {s.kinds.includes('operator') ? <li>{t('fromOperator')}</li> : null}
      {s.kinds.includes('proposal') ? <li>{t('fromProposal')}</li> : null}
      {quotes.map((q, i) => (
        <li key={i}>{t('fromIdea', { quote: q ?? '' })}</li>
      ))}
      {s.kinds.includes('answer') ? <li>{t('fromAnswer')}</li> : null}
    </ul>
  )
}

/** 加一步的建议：在步骤列表里显示为待接受的新步。 */
export function PendingSteps() {
  const t = useTranslations('workdraft.ai')
  const { at } = useContext(SuggestionsContext)
  const found = at('new-step')
  if (found.length === 0) return null
  return (
    <div className="space-y-2">
      {found.map((s) => {
        const value = (s.value ?? {}) as Partial<Step>
        return (
          <section
            key={s.id}
            className="space-y-2 rounded-xl border border-dashed border-sky-400 p-3 text-sm"
            data-testid={`pending-step-${s.id}`}
          >
            <h3 className="font-medium">
              {t('newStep', { title: value.title || s.path.split('/')[1] })}
            </h3>
            <SuggestionBox suggestion={s} />
          </section>
        )
      })}
    </div>
  )
}

/** 页面上放不到格子旁边的建议（比如整块换掉的），列在顶上。 */
export function OtherSuggestions() {
  const t = useTranslations('workdraft.ai')
  const { at } = useContext(SuggestionsContext)
  const found = at('elsewhere')
  if (found.length === 0) return null
  return (
    <Card title={t('elsewhere')}>
      {found.map((s) => (
        <div key={s.id} className="space-y-1">
          <code className="text-xs">{s.path}</code>
          <SuggestionBox suggestion={s} />
        </div>
      ))}
    </Card>
  )
}
