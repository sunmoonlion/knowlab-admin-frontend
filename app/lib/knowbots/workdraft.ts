import {
  OUTPUT_NAME,
  type Advanced,
  type CellEdit,
  type OutputCell,
  type Problem,
  type Step,
  type WorkdraftBody,
} from '@/contracts/workdraft'

// 工作稿页面的纯函数（专家孵化方案第六、七节）：自动保存时算出要存的几格、格子路径、
// 新步骤与新条目的编号、后端问题放到哪一格。格子路径与后端 domain/knowbots/workdraft.py 一致。

const STEP_FIELDS = [
  'title',
  'does',
  'why',
  'uses',
  'rules',
  'ask_before',
  'outputs',
  'checks',
  'on_fail',
  'advanced',
] as const
const MAX_EDITS = 200 // 后端一次最多收这么多格

/** 规范 JSON（键排序）：比较两份是否一样。 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

export function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

export const emptyAdvanced = (): Advanced => ({
  tools: null,
  reserve: null,
  input_max_chars: null,
  output_schema: null,
  output_file: null,
})

export function newStep(id: string): Step {
  return {
    id,
    title: '',
    does: '',
    why: '',
    uses: [],
    rules: [],
    ask_before: [],
    outputs: [],
    checks: [],
    on_fail: { kind: 'rework', back_to: null },
    advanced: emptyAdvanced(),
  }
}

/** 没用过的编号：前缀加最小的序号（s1、s2 … / r1 … / q1 …）。 */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

/** 交回项（与它每项）的名字哪里不行：空、带不许的字、重名。null 是行。 */
export function nameProblem(name: string, names: string[]): 'invalid' | 'duplicate' | null {
  if (!OUTPUT_NAME.test(name)) return 'invalid'
  return names.filter((n) => n === name).length > 1 ? 'duplicate' : null
}

export function outputsValid(outputs: OutputCell[]): boolean {
  const names = outputs.map((o) => o.name)
  return outputs.every((o) => {
    if (nameProblem(o.name, names)) return false
    const items = o.items ?? []
    const fields = items.map((f) => f.name)
    return items.every((f) => !nameProblem(f.name, fields))
  })
}

/**
 * 能存的样子：还没填好的不存（存了后端整份不收）——交回项名字不行的这一步交回项照存着的；
 * 空的选项不带。比较、发送都用它，所以没填好的不会一直重发。
 */
export function sendable(body: WorkdraftBody, saved: WorkdraftBody): WorkdraftBody {
  const before = new Map(saved.steps.map((s) => [s.id, s]))
  return {
    ...body,
    steps: body.steps.map((step) => ({
      ...step,
      ask_before: step.ask_before.map((a) => ({
        ...a,
        options: a.options.filter((o) => o.trim()),
      })),
      outputs: outputsValid(step.outputs) ? step.outputs : (before.get(step.id)?.outputs ?? []),
    })),
  }
}

/**
 * 自动保存这一次要存的几格：拿存好的那份与本地这份比。步骤加了、删了、挪了顺序就整列
 * `steps` 换掉（字没变的格子后端照留出处）；否则只存改了的格子。
 */
export function diffEdits(saved: WorkdraftBody, local: WorkdraftBody): CellEdit[] {
  const send = sendable(local, saved)
  const edits: CellEdit[] = []
  if (send.name !== saved.name) edits.push({ path: 'name', value: send.name })
  if (send.tagline !== saved.tagline) edits.push({ path: 'tagline', value: send.tagline })
  for (const key of ['does', 'does_not', 'elsewhere'] as const) {
    if (send.scope[key] !== saved.scope[key])
      edits.push({ path: `scope/${key}`, value: send.scope[key] })
  }
  if (!same(send.data_picks, saved.data_picks))
    edits.push({ path: 'data_picks', value: send.data_picks })
  const whole = { path: 'steps', value: send.steps }
  if (
    !same(
      send.steps.map((s) => s.id),
      saved.steps.map((s) => s.id),
    )
  )
    return [...edits, whole]
  const head = edits.length
  send.steps.forEach((step, i) => {
    for (const field of STEP_FIELDS) {
      if (!same(step[field], saved.steps[i][field]))
        edits.push({ path: `steps/${step.id}/${field}`, value: step[field] })
    }
  })
  return edits.length > MAX_EDITS ? [...edits.slice(0, head), whole] : edits
}

/** 步骤删掉后，别的步骤里引它的地方跟着收：用上的去掉，退回它的改回默认。 */
export function withoutStep(body: WorkdraftBody, id: string): WorkdraftBody {
  return {
    ...body,
    steps: body.steps
      .filter((s) => s.id !== id)
      .map((s) => ({
        ...s,
        uses: s.uses.filter((u) => u !== id),
        on_fail: s.on_fail.back_to === id ? { kind: 'rework' as const, back_to: null } : s.on_fail,
      })),
  }
}

/** 页面上有这一格（问题能标到格子上）；没有的列在顶上。 */
export function placed(path: string, body: WorkdraftBody): boolean {
  if (
    ['name', 'tagline', 'steps', 'scope/does', 'scope/does_not', 'scope/elsewhere'].includes(path)
  )
    return true
  const parts = path.split('/')
  if (parts[0] !== 'steps' || parts.length < 3) return false
  const step = body.steps.find((s) => s.id === parts[1])
  if (!step || !(STEP_FIELDS as readonly string[]).includes(parts[2])) return false
  if (parts.length === 3) return true
  if (parts.length !== 4) return false
  switch (parts[2]) {
    case 'rules':
      return step.rules.some((r) => r.id === parts[3])
    case 'ask_before':
      return step.ask_before.some((a) => a.id === parts[3])
    case 'outputs':
      return step.outputs.some((o) => o.name === parts[3])
    case 'checks':
      return /^\d+$/.test(parts[3]) && Number(parts[3]) < step.checks.length
    default:
      return false
  }
}

// 后端问题的话（英文）换成用户的话；认不得的照原文
const KNOWN: [RegExp, string][] = [
  [/^this cell has no source$/, 'noSource'],
  [/^the cell differs from its record$/, 'differs'],
  [/^say what this expert does$/, 'scopeDoes'],
  [/^add at least one step$/, 'noSteps'],
  [/^name this step$/, 'noTitle'],
  [/^say what this step does$/, 'noDoes'],
  [/^add at least one output$/, 'noOutputs'],
  [/^write the question$/, 'noQuestion'],
  [/^go back to an earlier step$/, 'backEarlier'],
  [/ is not an earlier step$/, 'usesEarlier'],
  [/ needs /, 'checkNeeds'],
  [/^path .* is not an output of this step$/, 'checkPath'],
]

export function problemKey(problem: Problem): string | null {
  return KNOWN.find(([pattern]) => pattern.test(problem.message))?.[1] ?? null
}
