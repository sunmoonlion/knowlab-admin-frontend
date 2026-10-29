'use client'

import { useTranslations } from 'next-intl'

import {
  TEMPLATES,
  TEMPLATE_NAMES,
  type Check,
  type Step,
  type Template,
} from '@/contracts/workdraft'

import {
  CellMarks,
  CheckedInput,
  Group,
  INPUT,
  LINK,
  SELECT,
  numberParser,
  splitList,
  useProblems,
} from './workdraft-cells'

// 怎样算对（专家孵化方案第 7.2 节）：从验收模板里选一个，再填参数；参数表单按模板切换，模板与
// 参数照后端 compile.py 的 TEMPLATES。

type Params = Record<string, unknown>

/** 换模板：参数清空，两个模板都要「哪一项」的留着。 */
export function switchTemplate(check: Check, template: Template): Check {
  const takes = [...TEMPLATES[template].required, ...TEMPLATES[template].optional] as string[]
  const path = check.params.path
  return { template, params: takes.includes('path') && path !== undefined ? { path } : {} }
}

function withParam(params: Params, name: string, value: unknown): Params {
  const next = { ...params }
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  if (empty) delete next[name]
  else next[name] = value
  return next
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

export function Checks({
  step,
  earlier,
  base,
  onChange,
}: {
  step: Step
  earlier: Step[]
  base: string
  onChange: (checks: Check[]) => void
}) {
  const t = useTranslations('workdraft.step')
  const set = (index: number, check: Check | null) =>
    onChange(
      check === null
        ? step.checks.filter((_, i) => i !== index)
        : step.checks.map((c, i) => (i === index ? check : c)),
    )
  return (
    <Group title={t('checks')} path={`${base}/checks`} hint={t('checksHint')}>
      <ol className="space-y-3">
        {step.checks.map((check, index) => (
          <CheckRow
            key={`${index}-${check.template}`}
            check={check}
            index={index}
            step={step}
            earlier={earlier}
            path={`${base}/checks/${index}`}
            onChange={(next) => set(index, next)}
          />
        ))}
      </ol>
      <button
        type="button"
        className={LINK}
        onClick={() => onChange([...step.checks, { template: 'required', params: {} }])}
      >
        {t('addCheck')}
      </button>
    </Group>
  )
}

function CheckRow({
  check,
  index,
  step,
  earlier,
  path,
  onChange,
}: {
  check: Check
  index: number
  step: Step
  earlier: Step[]
  path: string
  onChange: (check: Check | null) => void
}) {
  const t = useTranslations('workdraft')
  const problems = useProblems(path)
  const n = index + 1
  return (
    <li className="space-y-2 rounded-lg border p-2" data-testid={`check-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{n}.</span>
        <select
          aria-label={t('step.template', { n })}
          aria-invalid={problems.length ? true : undefined}
          className={SELECT}
          value={check.template}
          onChange={(event) => onChange(switchTemplate(check, event.target.value as Template))}
        >
          {TEMPLATE_NAMES.map((name) => (
            <option key={name} value={name}>
              {t(`templates.${name}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${LINK} ml-auto`}
          aria-label={t('step.removeCheck', { n })}
          onClick={() => onChange(null)}
        >
          {t('steps.remove')}
        </button>
      </div>
      <TemplateParams
        check={check}
        step={step}
        earlier={earlier}
        onChange={(params) => onChange({ ...check, params })}
      />
      <CellMarks path={path} />
    </li>
  )
}

function TemplateParams({
  check,
  step,
  earlier,
  onChange,
}: {
  check: Check
  step: Step
  earlier: Step[]
  onChange: (params: Params) => void
}) {
  const t = useTranslations('workdraft.params')
  const { params } = check
  const spec = TEMPLATES[check.template]
  const takes = new Set<string>([...spec.required, ...spec.optional])
  const set = (name: string, value: unknown) => onChange(withParam(params, name, value))
  const outputs = step.outputs.map((o) => o.name).filter(Boolean)
  const source = earlier.find((s) => s.id === params.source_step)
  // 「都等于」：那一项是数的，填的字当数存
  const target = step.outputs.find((o) => o.name === params.path)
  const numeric = target?.items?.find((f) => f.name === params.field)?.type === 'number'
  const fields: React.ReactNode[] = []
  if (takes.has('keys') && check.template === 'required') {
    fields.push(
      <Picks
        key="keys"
        label={t('keys')}
        options={outputs}
        value={list(params.keys)}
        onChange={(v) => set('keys', v)}
      />,
    )
  }
  if (takes.has('path')) {
    fields.push(
      <Choose
        key="path"
        label={t('path')}
        options={outputs}
        value={text(params.path)}
        placeholder={t('choose')}
        onChange={(v) => set('path', v)}
      />,
    )
  }
  if (takes.has('min')) {
    fields.push(
      <CheckedInput<number>
        key="min"
        label={t('min')}
        value={typeof params.min === 'number' ? params.min : undefined}
        show={(v) => (v === undefined ? '' : String(v))}
        parse={numberParser({ integer: true, min: 1 })}
        onChange={(v) => set('min', v)}
      />,
    )
  }
  if (takes.has('keys') && check.template === 'each_has') {
    fields.push(
      <CheckedInput<string[]>
        key="each-keys"
        label={t('eachKeys')}
        value={list(params.keys)}
        show={(v) => (v ?? []).join('、')}
        parse={(s) => ({ ok: true, value: splitList(s) })}
        onChange={(v) => set('keys', v)}
      />,
    )
  }
  if (takes.has('field')) {
    fields.push(
      <label key="field" className="block text-xs">
        <span className="text-muted-foreground">{t('field')}</span>
        <input
          className={INPUT}
          value={text(params.field)}
          onChange={(e) => set('field', e.target.value.trim())}
        />
      </label>,
    )
  }
  if (takes.has('values')) {
    fields.push(
      <CheckedInput<string[]>
        key="values"
        label={t('values')}
        value={list(params.values)}
        show={(v) => (v ?? []).join('、')}
        parse={(s) => ({ ok: true, value: splitList(s) })}
        onChange={(v) => set('values', v)}
      />,
    )
  }
  if (takes.has('equals')) {
    fields.push(
      <CheckedInput<string | number>
        key={`equals-${numeric}`}
        label={t('equals')}
        value={params.equals as string | number | undefined}
        show={(v) => (v === undefined ? '' : String(v))}
        parse={(s) => (numeric ? numberParser({})(s) : { ok: true, value: s.trim() || undefined })}
        onChange={(v) => set('equals', v)}
      />,
    )
  }
  if (takes.has('expression')) {
    fields.push(
      <label key="expression" className="block text-xs">
        <span className="text-muted-foreground">{t('expression')}</span>
        <input
          className={INPUT}
          value={text(params.expression)}
          onChange={(e) => set('expression', e.target.value)}
        />
      </label>,
    )
  }
  if (takes.has('tolerance')) {
    fields.push(
      <CheckedInput<number>
        key="tolerance"
        label={t('tolerance')}
        value={typeof params.tolerance === 'number' ? params.tolerance : undefined}
        show={(v) => (v === undefined ? '' : String(v))}
        parse={numberParser({ min: 0 })}
        onChange={(v) => set('tolerance', v)}
      />,
    )
  }
  if (takes.has('source_step')) {
    fields.push(
      <Choose
        key="source_step"
        label={t('source_step')}
        options={earlier.map((s) => s.id)}
        names={Object.fromEntries(earlier.map((s) => [s.id, s.title || s.id]))}
        value={text(params.source_step)}
        placeholder={t('choose')}
        onChange={(v) =>
          onChange(withParam(withParam(params, 'source_path', ''), 'source_step', v))
        }
      />,
      <Choose
        key="source_path"
        label={t('source_path')}
        options={(source?.outputs ?? []).map((o) => o.name)}
        value={text(params.source_path)}
        placeholder={t('choose')}
        onChange={(v) => set('source_path', v)}
      />,
      <label key="source_field" className="block text-xs">
        <span className="text-muted-foreground">{t('source_field')}</span>
        <input
          className={INPUT}
          value={text(params.source_field)}
          onChange={(e) => set('source_field', e.target.value.trim())}
        />
      </label>,
      <Picks
        key="also"
        label={t('also')}
        options={outputs}
        value={list(params.also)}
        onChange={(v) => set('also', v)}
      />,
    )
  }
  if (takes.has('max')) {
    fields.push(
      <CheckedInput<number>
        key="max"
        label={t('max')}
        value={typeof params.max === 'number' ? params.max : undefined}
        show={(v) => (v === undefined ? '' : String(v))}
        parse={numberParser({ integer: true, min: 1, max: 200_000 })}
        onChange={(v) => set('max', v)}
      />,
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid={`params-${check.template}`}>
      {fields}
    </div>
  )
}

function Choose({
  label,
  options,
  names,
  value,
  placeholder,
  onChange,
}: {
  label: string
  options: string[]
  names?: Record<string, string>
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  // 选过的不在了（交回项改了名）照样列出来，免得悄悄换掉
  const shown = value && !options.includes(value) ? [...options, value] : options
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        className={`${SELECT} w-full`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {shown.map((o) => (
          <option key={o} value={o}>
            {names?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  )
}

function Picks({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <fieldset className="text-xs">
      <legend className="text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.includes(o)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, o] : value.filter((v) => v !== o))
              }
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
