'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useId, useState } from 'react'

import type { Problem } from '@/contracts/workdraft'
import { problemKey, same } from '@/lib/knowbots/workdraft'
import { cn } from '@/lib/utils'

import { SuggestionsAt } from './workdraft-suggestions'

// 工作稿的格子共用（专家孵化方案第六、九节）：每格旁边小字标出处（作者写的 / 导入 / 复制 / 接受的
// 建议 / 创意原句 / 答过的问题 / 没有出处），后端预览回来的问题按格子路径标红；这一轮 AI 对这一格
// 的建议也显示在旁边（workdraft-suggestions）。

export const INPUT = 'w-full rounded-md border bg-transparent px-3 py-1.5 text-sm'
export const SELECT = 'h-8 rounded-md border bg-transparent px-2 text-sm'
export const LINK = 'text-muted-foreground text-xs underline underline-offset-2'

export type Marks = {
  problems: Problem[]
  origins: Record<string, string>
}

export const MarksContext = createContext<Marks>({ problems: [], origins: {} })

/** 这一格的问题（路径正好是它的）。 */
export function useProblems(path: string | undefined): Problem[] {
  const { problems } = useContext(MarksContext)
  return path === undefined ? [] : problems.filter((p) => p.path === path)
}

/** 后端问题的话：认得的换成用户的话，认不得的照原文。 */
export function useProblemText() {
  const t = useTranslations('workdraft.problems')
  // 键是按后端的话挑的（problemKey），这里按字符串查
  const say = t as unknown as (key: string, values: Record<string, string>) => string
  return (problem: Problem) => {
    const key = problemKey(problem)
    return key ? say(key, { message: problem.message }) : problem.message
  }
}

/** 格子旁边的小字：出处，与标红的问题。filled：格子里有字（空的格子不要出处，不标）。 */
export function CellMarks({
  path,
  filled = true,
  id,
}: {
  path: string
  filled?: boolean
  id?: string
}) {
  const t = useTranslations('workdraft.origin')
  const { origins } = useContext(MarksContext)
  const problems = useProblems(path)
  const text = useProblemText()
  const origin = origins[path]
  return (
    <div id={id} className="space-y-0.5">
      {filled ? (
        <p className="text-muted-foreground text-xs" data-testid={`origin-${path}`}>
          {origin ? t(origin as never) : t('none')}
        </p>
      ) : null}
      {problems.map((p, i) => (
        <p key={i} className="text-destructive text-xs" data-testid={`problem-${path}`}>
          {text(p)}
        </p>
      ))}
      <SuggestionsAt home={path} />
    </div>
  )
}

type A11y = { id: string; 'aria-invalid'?: true; 'aria-describedby': string }

/** 一格：标题、输入框（render prop 拿到 id 与无障碍属性）、出处与问题。 */
export function Field({
  label,
  path,
  filled,
  hint,
  children,
  className,
}: {
  label: string
  path: string
  filled: boolean
  hint?: string
  children: (a11y: A11y) => React.ReactNode
  className?: string
}) {
  const id = useId()
  const problems = useProblems(path)
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {children({
        id,
        'aria-describedby': `${id}-marks`,
        ...(problems.length ? { 'aria-invalid': true as const } : {}),
      })}
      <CellMarks id={`${id}-marks`} path={path} filled={filled} />
    </div>
  )
}

/** 一组（规则、交回项……）的标题与这一组整体的问题。 */
export function Group({
  title,
  path,
  hint,
  children,
}: {
  title: string
  path: string
  hint?: string
  children: React.ReactNode
}) {
  const problems = useProblems(path)
  const text = useProblemText()
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {problems.map((p, i) => (
        <p key={i} className="text-destructive text-xs" data-testid={`problem-${path}`}>
          {text(p)}
        </p>
      ))}
      <SuggestionsAt home={path} />
      {children}
    </fieldset>
  )
}

/**
 * 要先核过才存的输入（数、额度、用逗号隔开的几项）：打字时留着原文，核得过才交出去；
 * 核不过标出来、先不存。parse 回 undefined 是清空。
 */
export function CheckedInput<T>({
  label,
  value,
  show,
  parse,
  onChange,
  className,
  placeholder,
}: {
  label: string
  value: T | undefined
  show: (value: T | undefined) => string
  parse: (text: string) => { ok: true; value: T | undefined } | { ok: false }
  onChange: (value: T | undefined) => void
  className?: string
  placeholder?: string
}) {
  const t = useTranslations('workdraft.step')
  const [text, setText] = useState(() => show(value))
  const [bad, setBad] = useState(false)
  // 值从外面变了（删了前面一条、换了模板、重新载入）：输入框跟着换
  const [seen, setSeen] = useState(value)
  if (!same(seen, value)) {
    setSeen(value)
    setText(show(value))
    setBad(false)
  }
  const id = useId()
  return (
    <label className={cn('block text-xs', className)}>
      <span className="text-muted-foreground">{label}</span>
      <input
        className={INPUT}
        value={text}
        placeholder={placeholder}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? id : undefined}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = parse(event.target.value)
          setBad(!parsed.ok)
          if (parsed.ok) {
            setSeen(parsed.value)
            onChange(parsed.value)
          }
        }}
      />
      {bad ? (
        <span id={id} className="text-destructive">
          {t('invalidNumber')}
        </span>
      ) : null}
    </label>
  )
}

const SPLIT = /[,，、;；\s]+/

export function splitList(text: string): string[] {
  return text
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 数：空是清空；min、integer 照模板的要求核。 */
export function numberParser(options: { integer?: boolean; min?: number; max?: number }) {
  return (text: string): { ok: true; value: number | undefined } | { ok: false } => {
    const v = text.trim()
    if (!v) return { ok: true, value: undefined }
    if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false }
    const n = Number(v)
    if (options.integer && !Number.isInteger(n)) return { ok: false }
    if (options.min !== undefined && n < options.min) return { ok: false }
    if (options.max !== undefined && n > options.max) return { ok: false }
    return { ok: true, value: n }
  }
}
