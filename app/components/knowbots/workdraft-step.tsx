'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  FIELD_TYPES,
  OUTPUT_TYPES,
  RESERVE,
  TOOLS,
  type AskBefore,
  type OutputCell,
  type Step,
} from '@/contracts/workdraft'
import { freshId, nameProblem, outputsValid } from '@/lib/knowbots/workdraft'

import { Checks } from './workdraft-checks'
import { SuggestionsAt } from './workdraft-suggestions'
import {
  CellMarks,
  CheckedInput,
  Field,
  Group,
  INPUT,
  LINK,
  SELECT,
  numberParser,
  useProblems,
} from './workdraft-cells'

// 一步的格子（专家孵化方案第 7.1 节）：叫什么、做什么、为什么、用上哪几步、规则、开步前问什么、
// 交回哪几项、怎样算对、没过怎么办；「高级」里是工具、额度、读入上限。

const DEFAULT_RESERVE = '0.05'
const DEFAULT_INPUT_MAX = 8000

export function StepEditor({
  step,
  number,
  count,
  earlier,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step
  number: number
  count: number
  earlier: Step[]
  onChange: (step: Step) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const t = useTranslations('workdraft')
  const [confirming, setConfirming] = useState(false)
  const base = `steps/${step.id}`
  const set = <K extends keyof Step>(key: K, value: Step[K]) => onChange({ ...step, [key]: value })
  const heading = `${t('steps.step', { n: number })}${step.title ? ` · ${step.title}` : ''}`
  return (
    <section
      aria-label={heading}
      className="bg-card space-y-4 rounded-xl border p-4 text-sm shadow-sm"
      data-testid={`step-${step.id}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{heading}</h3>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-label={t('steps.upLabel', { n: number })}
            disabled={number === 1}
            onClick={() => onMove(-1)}
          >
            {t('steps.up')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={t('steps.downLabel', { n: number })}
            disabled={number === count}
            onClick={() => onMove(1)}
          >
            {t('steps.down')}
          </Button>
          {confirming ? (
            <>
              <Button size="sm" variant="destructive" onClick={onRemove}>
                {t('steps.confirmRemove', { n: number })}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t('steps.keep')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              aria-label={t('steps.removeLabel', { n: number })}
              onClick={() => setConfirming(true)}
            >
              {t('steps.remove')}
            </Button>
          )}
        </div>
      </header>
      <SuggestionsAt home={base} />
      <Field label={t('step.title')} path={`${base}/title`} filled={Boolean(step.title.trim())}>
        {(a11y) => (
          <input
            {...a11y}
            className={INPUT}
            maxLength={80}
            value={step.title}
            onChange={(e) => set('title', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('step.does')}
        hint={t('step.doesHint')}
        path={`${base}/does`}
        filled={Boolean(step.does.trim())}
      >
        {(a11y) => (
          <textarea
            {...a11y}
            className={INPUT}
            rows={3}
            maxLength={20_000}
            value={step.does}
            onChange={(e) => set('does', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('step.why')}
        hint={t('step.whyHint')}
        path={`${base}/why`}
        filled={Boolean(step.why.trim())}
      >
        {(a11y) => (
          <input
            {...a11y}
            className={INPUT}
            maxLength={1000}
            value={step.why}
            onChange={(e) => set('why', e.target.value)}
          />
        )}
      </Field>
      <Uses step={step} earlier={earlier} base={base} onChange={(uses) => set('uses', uses)} />
      <Rules step={step} base={base} onChange={(rules) => set('rules', rules)} />
      <Asks step={step} base={base} onChange={(asks) => set('ask_before', asks)} />
      <Outputs step={step} base={base} onChange={(outputs) => set('outputs', outputs)} />
      <Checks
        step={step}
        earlier={earlier}
        base={base}
        onChange={(checks) => set('checks', checks)}
      />
      <OnFailCell step={step} earlier={earlier} base={base} onChange={(v) => set('on_fail', v)} />
      <AdvancedCell step={step} base={base} onChange={(v) => set('advanced', v)} />
    </section>
  )
}

function Uses({
  step,
  earlier,
  base,
  onChange,
}: {
  step: Step
  earlier: Step[]
  base: string
  onChange: (uses: string[]) => void
}) {
  const t = useTranslations('workdraft')
  return (
    <Group title={t('step.uses')} path={`${base}/uses`}>
      {earlier.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('step.usesNone')}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {earlier.map((s, i) => (
            <label key={s.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={step.uses.includes(s.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? earlier
                          .map((x) => x.id)
                          .filter((id) => id === s.id || step.uses.includes(id))
                      : step.uses.filter((u) => u !== s.id),
                  )
                }
              />
              {t('steps.step', { n: i + 1 })}
              {s.title ? ` · ${s.title}` : ''}
            </label>
          ))}
        </div>
      )}
    </Group>
  )
}

function Rules({
  step,
  base,
  onChange,
}: {
  step: Step
  base: string
  onChange: (rules: Step['rules']) => void
}) {
  const t = useTranslations('workdraft.step')
  return (
    <Group title={t('rules')} path={`${base}/rules`}>
      <ol className="space-y-2">
        {step.rules.map((rule, i) => {
          const path = `${base}/rules/${rule.id}`
          return (
            <li key={rule.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground pt-1.5 text-xs">{i + 1}.</span>
                <RuleText
                  label={t('rule', { n: i + 1 })}
                  path={path}
                  value={rule.text}
                  onChange={(text) =>
                    onChange(step.rules.map((r) => (r.id === rule.id ? { ...r, text } : r)))
                  }
                />
                <button
                  type="button"
                  className={`${LINK} pt-1.5`}
                  aria-label={t('removeRule', { n: i + 1 })}
                  onClick={() => onChange(step.rules.filter((r) => r.id !== rule.id))}
                >
                  ×
                </button>
              </div>
              <CellMarks path={path} filled={Boolean(rule.text.trim())} />
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className={LINK}
        onClick={() =>
          onChange([
            ...step.rules,
            {
              id: freshId(
                'r',
                step.rules.map((r) => r.id),
              ),
              text: '',
            },
          ])
        }
      >
        {t('addRule')}
      </button>
    </Group>
  )
}

function RuleText({
  label,
  path,
  value,
  onChange,
}: {
  label: string
  path: string
  value: string
  onChange: (text: string) => void
}) {
  const problems = useProblems(path)
  return (
    <textarea
      aria-label={label}
      aria-invalid={problems.length ? true : undefined}
      className={INPUT}
      rows={2}
      maxLength={4000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function Asks({
  step,
  base,
  onChange,
}: {
  step: Step
  base: string
  onChange: (asks: AskBefore[]) => void
}) {
  const t = useTranslations('workdraft.step')
  const put = (ask: AskBefore) => onChange(step.ask_before.map((a) => (a.id === ask.id ? ask : a)))
  return (
    <Group title={t('ask')} path={`${base}/ask_before`}>
      <ol className="space-y-2">
        {step.ask_before.map((ask, i) => {
          const q = i + 1
          return (
            <li key={ask.id} className="space-y-1 rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('question', { n: q })}
                  className={INPUT}
                  maxLength={1000}
                  value={ask.question}
                  onChange={(e) => put({ ...ask, question: e.target.value })}
                />
                <button
                  type="button"
                  className={LINK}
                  aria-label={t('removeQuestion', { n: q })}
                  onClick={() => onChange(step.ask_before.filter((a) => a.id !== ask.id))}
                >
                  ×
                </button>
              </div>
              <ul className="flex flex-wrap gap-2 pl-4">
                {ask.options.map((option, n) => (
                  <li key={n} className="flex items-center gap-1">
                    <input
                      aria-label={t('option', { q, n: n + 1 })}
                      className={`${INPUT} w-40`}
                      maxLength={200}
                      value={option}
                      onChange={(e) =>
                        put({
                          ...ask,
                          options: ask.options.map((o, k) => (k === n ? e.target.value : o)),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={LINK}
                      aria-label={t('removeOption', { q, n: n + 1 })}
                      onClick={() =>
                        put({ ...ask, options: ask.options.filter((_, k) => k !== n) })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => put({ ...ask, options: [...ask.options, ''] })}
                  >
                    {t('addOption')}
                  </button>
                </li>
              </ul>
              <CellMarks path={`${base}/ask_before/${ask.id}`} />
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className={LINK}
        onClick={() =>
          onChange([
            ...step.ask_before,
            {
              id: freshId(
                'q',
                step.ask_before.map((a) => a.id),
              ),
              question: '',
              options: [],
            },
          ])
        }
      >
        {t('addQuestion')}
      </button>
    </Group>
  )
}

function Outputs({
  step,
  base,
  onChange,
}: {
  step: Step
  base: string
  onChange: (outputs: OutputCell[]) => void
}) {
  const t = useTranslations('workdraft')
  const names = step.outputs.map((o) => o.name)
  const put = (index: number, output: OutputCell) =>
    onChange(step.outputs.map((o, i) => (i === index ? output : o)))
  return (
    <Group title={t('step.outputs')} path={`${base}/outputs`}>
      <ol className="space-y-2">
        {step.outputs.map((output, i) => {
          const n = i + 1
          const wrong = nameProblem(output.name, names)
          const rows = output.type === 'list' || output.type === 'table'
          return (
            <li key={i} className="space-y-1 rounded-lg border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t('step.outputName', { n })}
                  aria-invalid={wrong ? true : undefined}
                  className={`${INPUT} w-48`}
                  maxLength={64}
                  value={output.name}
                  onChange={(e) => put(i, { ...output, name: e.target.value.trim() })}
                />
                <select
                  aria-label={t('step.outputType', { n })}
                  className={SELECT}
                  value={output.type}
                  onChange={(e) => {
                    const type = e.target.value as OutputCell['type']
                    const keeps = type === 'list' || type === 'table'
                    put(i, { ...output, type, items: keeps ? output.items : null })
                  }}
                >
                  {OUTPUT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={LINK}
                  aria-label={t('step.removeOutput', { n })}
                  onClick={() => onChange(step.outputs.filter((_, k) => k !== i))}
                >
                  ×
                </button>
              </div>
              {wrong ? (
                <p className="text-destructive text-xs">
                  {t(wrong === 'invalid' ? 'step.nameInvalid' : 'step.nameDuplicate')}
                </p>
              ) : null}
              {rows ? <Items output={output} n={n} onChange={(o) => put(i, o)} /> : null}
              {output.name ? <CellMarks path={`${base}/outputs/${output.name}`} /> : null}
            </li>
          )
        })}
      </ol>
      {outputsValid(step.outputs) ? null : (
        <p className="text-destructive text-xs">{t('step.notSaved')}</p>
      )}
      <button
        type="button"
        className={LINK}
        onClick={() => onChange([...step.outputs, { name: '', type: 'number', items: null }])}
      >
        {t('step.addOutput')}
      </button>
    </Group>
  )
}

function Items({
  output,
  n,
  onChange,
}: {
  output: OutputCell
  n: number
  onChange: (output: OutputCell) => void
}) {
  const t = useTranslations('workdraft')
  const items = output.items ?? []
  const names = items.map((f) => f.name)
  const put = (next: typeof items) => onChange({ ...output, items: next.length ? next : null })
  return (
    <fieldset className="space-y-1 pl-4">
      <legend className="text-muted-foreground text-xs">{t('step.items', { n })}</legend>
      {items.map((field, k) => {
        const wrong = nameProblem(field.name, names)
        return (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={t('step.itemName', { o: n, n: k + 1 })}
              aria-invalid={wrong ? true : undefined}
              className={`${INPUT} w-40`}
              maxLength={64}
              value={field.name}
              onChange={(e) =>
                put(items.map((f, j) => (j === k ? { ...f, name: e.target.value.trim() } : f)))
              }
            />
            <select
              aria-label={t('step.itemType', { o: n, n: k + 1 })}
              className={SELECT}
              value={field.type}
              onChange={(e) =>
                put(
                  items.map((f, j) =>
                    j === k ? { ...f, type: e.target.value as (typeof FIELD_TYPES)[number] } : f,
                  ),
                )
              }
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={LINK}
              aria-label={t('step.removeItem', { o: n, n: k + 1 })}
              onClick={() => put(items.filter((_, j) => j !== k))}
            >
              ×
            </button>
            {wrong ? (
              <span className="text-destructive text-xs">
                {t(wrong === 'invalid' ? 'step.nameInvalid' : 'step.nameDuplicate')}
              </span>
            ) : null}
          </div>
        )
      })}
      <button
        type="button"
        className={LINK}
        onClick={() => put([...items, { name: '', type: 'text' }])}
      >
        {t('step.addItem')}
      </button>
    </fieldset>
  )
}

function OnFailCell({
  step,
  earlier,
  base,
  onChange,
}: {
  step: Step
  earlier: Step[]
  base: string
  onChange: (value: Step['on_fail']) => void
}) {
  const t = useTranslations('workdraft')
  const problems = useProblems(`${base}/on_fail`)
  const { kind, back_to } = step.on_fail
  return (
    <Group title={t('step.onFail')} path={`${base}/on_fail`}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('step.onFail')}
          aria-invalid={problems.length ? true : undefined}
          className={SELECT}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as Step['on_fail']['kind']
            onChange({ kind: next, back_to: next === 'back' ? back_to : null })
          }}
        >
          {(['rework', 'ask', 'back'] as const).map((k) => (
            <option key={k} value={k} disabled={k === 'back' && earlier.length === 0}>
              {t(`onFail.${k}`)}
            </option>
          ))}
        </select>
        {kind === 'back' ? (
          <select
            aria-label={t('step.backTo')}
            className={SELECT}
            value={back_to ?? ''}
            onChange={(e) => onChange({ kind, back_to: e.target.value || null })}
          >
            <option value="">{t('step.chooseStep')}</option>
            {earlier.map((s, i) => (
              <option key={s.id} value={s.id}>
                {t('steps.step', { n: i + 1 })}
                {s.title ? ` · ${s.title}` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </Group>
  )
}

function AdvancedCell({
  step,
  base,
  onChange,
}: {
  step: Step
  base: string
  onChange: (value: Step['advanced']) => void
}) {
  const t = useTranslations('workdraft')
  const advanced = step.advanced
  const problems = useProblems(`${base}/advanced`)
  // 不填（null）就是全给
  const tools = advanced.tools ?? [...TOOLS]
  const setTools = (next: string[]) => {
    const all = TOOLS.every((tool) => next.includes(tool)) && next.length === TOOLS.length
    onChange({ ...advanced, tools: all ? null : TOOLS.filter((tool) => next.includes(tool)) })
  }
  return (
    <details className="rounded-lg border p-2" open={problems.length > 0 || undefined}>
      <summary className="cursor-pointer text-sm font-medium">{t('step.advanced')}</summary>
      <div className="mt-2 space-y-3">
        <p className="text-muted-foreground text-xs">{t('step.advancedHint')}</p>
        <Group title={t('step.tools')} path={`${base}/advanced`}>
          <div className="flex flex-wrap gap-3">
            {TOOLS.map((tool) => (
              <label key={tool} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={tools.includes(tool)}
                  onChange={(e) =>
                    setTools(e.target.checked ? [...tools, tool] : tools.filter((x) => x !== tool))
                  }
                />
                {t(`tools.${tool}`)}
                <code className="text-muted-foreground">{tool}</code>
              </label>
            ))}
          </div>
        </Group>
        <div className="grid gap-2 sm:grid-cols-2">
          <CheckedInput<string>
            label={t('step.reserve')}
            value={advanced.reserve ?? undefined}
            placeholder={t('step.byDefault', { value: DEFAULT_RESERVE })}
            show={(v) => v ?? ''}
            parse={(s) =>
              !s.trim()
                ? { ok: true, value: undefined }
                : RESERVE.test(s.trim())
                  ? { ok: true, value: s.trim() }
                  : { ok: false }
            }
            onChange={(v) => onChange({ ...advanced, reserve: v ?? null })}
          />
          <CheckedInput<number>
            label={t('step.inputMax')}
            value={advanced.input_max_chars ?? undefined}
            placeholder={t('step.byDefault', { value: DEFAULT_INPUT_MAX })}
            show={(v) => (v === undefined ? '' : String(v))}
            parse={numberParser({ integer: true, min: 500, max: 200_000 })}
            onChange={(v) => onChange({ ...advanced, input_max_chars: v ?? null })}
          />
        </div>
        {advanced.output_schema ? (
          <p className="text-muted-foreground text-xs">{t('step.ownSchema')}</p>
        ) : null}
      </div>
    </details>
  )
}
