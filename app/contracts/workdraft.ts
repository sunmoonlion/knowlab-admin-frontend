import { z } from 'zod'

// 工作稿（专家孵化方案第五至十一节，decisions ⑮）：后端 app/domain/knowbots/workdraft.py 的
// WorkdraftBody 与 knowbot_routes.py 的工作稿接口。作者只写方法层的格子；清单由后端按格子编。
// 回包里多出来的字段不算错，少了、类型不对才算。

export const STEP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/
// 交回项与它每项的名字是交回 JSON 的键：不带点、斜杠、空白、引号和几个中文标点
export const OUTPUT_NAME = /^[^\s./\\"'（）()、，,；;：:]{1,64}$/
export const RESERVE = /^[0-9]{1,4}(\.[0-9]{1,4})?$/

// 与后端 compile.py 的 V2_TOOLS 一致：分身能用的只读读数据、计算、要数据、查主体
export const TOOLS = [
  'compute',
  'describe_items',
  'find_subject',
  'list_inputs',
  'lookup',
  'query_facts',
  'query_metric',
  'read_facts',
  'read_input',
  'request_data',
  'search_evidence',
] as const

export const OUTPUT_TYPES = ['number', 'table', 'text', 'list'] as const
export const FIELD_TYPES = ['number', 'text'] as const

// 验收模板与它收的参数（必填、可选），与后端 compile.py 的 TEMPLATES 一致
export const TEMPLATES = {
  required: { required: ['keys'], optional: [] },
  non_empty: { required: ['path'], optional: [] },
  list_min: { required: ['path'], optional: ['min'] },
  list_empty: { required: ['path'], optional: [] },
  blank: { required: ['path'], optional: [] },
  each_has: { required: ['path'], optional: ['keys', 'field', 'values'] },
  all_equal: { required: ['path', 'field', 'equals'], optional: [] },
  computed: { required: ['path'], optional: ['expression', 'tolerance'] },
  identity: { required: ['path'], optional: ['tolerance'] },
  sourced: { required: ['path'], optional: ['tolerance'] },
  quoted: { required: ['path'], optional: ['field', 'equals'] },
  covers: {
    required: ['path', 'field', 'source_step', 'source_path'],
    optional: ['source_field', 'also'],
  },
  max_chars: { required: ['max'], optional: [] },
} as const satisfies Record<string, { required: readonly string[]; optional: readonly string[] }>

export type Template = keyof typeof TEMPLATES
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as Template[]

const ruleSchema = z.object({ id: z.string(), text: z.string() })
const askSchema = z.object({ id: z.string(), question: z.string(), options: z.array(z.string()) })
const fieldSchema = z.object({ name: z.string(), type: z.enum(FIELD_TYPES) })
const outputSchema = z.object({
  name: z.string(),
  type: z.enum(OUTPUT_TYPES),
  items: z.array(fieldSchema).nullable().default(null),
})
const checkSchema = z.object({
  template: z.enum(TEMPLATE_NAMES as [Template, ...Template[]]),
  params: z.record(z.string(), z.unknown()),
})
const onFailSchema = z.object({
  kind: z.enum(['rework', 'back', 'ask']),
  back_to: z.string().nullable().default(null),
})
const advancedSchema = z.object({
  tools: z.array(z.string()).nullable().default(null),
  reserve: z.string().nullable().default(null),
  input_max_chars: z.number().int().nullable().default(null),
  output_schema: z.record(z.string(), z.unknown()).nullable().default(null),
  output_file: z.string().nullable().default(null),
})
const stepSchema = z.object({
  id: z.string(),
  title: z.string(),
  does: z.string(),
  why: z.string(),
  uses: z.array(z.string()),
  rules: z.array(ruleSchema),
  ask_before: z.array(askSchema),
  outputs: z.array(outputSchema),
  checks: z.array(checkSchema),
  on_fail: onFailSchema,
  advanced: advancedSchema,
})
export const bodySchema = z.object({
  name: z.string(),
  tagline: z.string(),
  scope: z.object({ does: z.string(), does_not: z.string(), elsewhere: z.string() }),
  data_picks: z.array(z.string()),
  steps: z.array(stepSchema),
})

// 每格的出处是怎么来的：在编辑器里写的、导入、复制、接受的建议、答过的缺口、创意原句
export const ORIGINS = ['edit', 'import', 'copy', 'accept', 'question', 'idea'] as const
export type Origin = (typeof ORIGINS)[number]

export const workdraftSchema = z.object({
  contract_version: z.literal(1),
  request_id: z.string().uuid(),
  title: z.string(),
  revision: z.number().int().min(0),
  body: bodySchema,
  sources: z.record(z.string(), z.object({ kind: z.string(), ref: z.string() }).loose()),
  origins: z.record(z.string(), z.string()).default({}),
  updated_at: z.string().nullable(),
  // 导入、复制时没能留下的东西
  notes: z.array(z.string()).optional(),
  // 平台孵化时平台人员的提议（专家孵化方案第十二节）
  proposals: z.array(z.lazy(() => proposalSchema)).optional(),
})

export const PROPOSAL_STATES = [
  'pending',
  'accepted',
  'accepted_edited',
  'rejected',
  'withdrawn',
  'void',
] as const
export const proposalSchema = z.object({
  proposal_id: z.string().uuid(),
  path: z.string(),
  op: z.enum(['set', 'add', 'remove', 'move']),
  value: z.unknown().optional(),
  reason: z.string(),
  state: z.enum(PROPOSAL_STATES),
  proposed_at: z.string().nullable(),
  decided_at: z.string().nullable(),
  // 管理端看得到谁提的
  proposed_by: z.string().optional(),
})
export type Proposal = z.infer<typeof proposalSchema>
// 平台人员要提的一条（形状同 AI 的建议），一次可以提几条
export type ProposalIn = {
  path: string
  op: 'set' | 'add' | 'remove' | 'move'
  value?: unknown
  reason: string
}

export const problemSchema = z.object({ path: z.string(), message: z.string() })

export const previewSchema = z.object({
  contract_version: z.literal(1),
  version: z.string(),
  manifest: z.record(z.string(), z.unknown()),
  problems: z.array(problemSchema),
})

export const publishedSchema = z.object({
  contract_version: z.literal(1),
  draft_id: z.string().uuid(),
  version: z.string(),
  revision: z.number().int().min(1),
  request_version: z.number().int().min(1),
  mode: z.string(),
})

// ---------- AI 孵化的一轮（专家孵化方案第八、九节） ----------
// 状态照契约 knowbot-incubation/v1 的结果状态
export const ROUND_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'over_budget',
  'cancelled',
] as const
export const ACTIVE_ROUNDS: readonly string[] = ['queued', 'running', 'waiting']
export const DECISION_STATES = ['pending', 'accepted', 'accepted_edited', 'rejected'] as const

const sourceRowSchema = z.object({
  path: z.string(),
  kind: z.enum(['idea', 'answer', 'proposal']),
  quote: z.string().optional(),
  ref: z.string().optional(),
})
// 一条建议：改哪一格、怎么改、理由；出处（引到的那几行）核得上没有；我怎么处理的
export const suggestionSchema = z.object({
  id: z.string(),
  path: z.string(),
  op: z.enum(['set', 'add', 'remove', 'move']),
  value: z.unknown().optional(),
  reason: z.string(),
  sources: z.array(sourceRowSchema),
  // operator：平台人员的提议（不是 AI 的），作者接受了才算（专家孵化方案第十二节）
  kinds: z.array(z.enum(['idea', 'answer', 'proposal', 'operator'])),
  verified: z.boolean(),
  problems: z.array(z.object({ path: z.string(), problem: z.string() })),
  state: z.enum(DECISION_STATES),
})
// 一个缺口：问题、提议、选项；进了审核栏的那一条答了没有
export const gapSchema = z.object({
  gap_id: z.string(),
  question: z.string(),
  proposal: z.string().nullable(),
  options: z.array(z.string()),
  question_id: z.string().uuid().nullable(),
  answered: z.boolean(),
  answer: z.record(z.string(), z.unknown()).nullable(),
})
export const roundSchema = z.object({
  incubation_id: z.string().uuid(),
  round: z.number().int().min(1),
  action: z.enum(['draft', 'revise']),
  instruction: z.string().nullable(),
  step_id: z.string().nullable(),
  status: z.enum(ROUND_STATUSES),
  budget_limit: z.string(),
  spent: z.string().nullable(),
  currency: z.string(),
  waiting_for: z.string().nullable(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  // 只有取一轮时才带
  suggestions: z.array(suggestionSchema).optional(),
  gaps: z.array(gapSchema).optional(),
})
export const roundsSchema = z.object({
  contract_version: z.literal(1),
  incubations: z.array(roundSchema),
})
export const oneRoundSchema = z.object({
  contract_version: z.literal(1),
  incubation: roundSchema,
})
export const decidedSchema = z.object({
  contract_version: z.literal(1),
  workdraft: workdraftSchema.omit({ contract_version: true }),
  incubation: roundSchema,
})
export const seededSchema = z.object({
  contract_version: z.literal(1),
  version: z.number().int().min(1),
})

export type Suggestion = z.infer<typeof suggestionSchema>
export type Gap = z.infer<typeof gapSchema>
export type Round = z.infer<typeof roundSchema>
export type RoundStart = {
  action: 'draft' | 'revise'
  instruction?: string
  step_id?: string
  budget_limit: string
  environment_id?: string
  workspace_root?: string
}
export type Decision = {
  action: 'accept' | 'accept_edited' | 'reject'
  revision?: number
  value?: unknown
}

export type WorkdraftBody = z.infer<typeof bodySchema>
export type Step = z.infer<typeof stepSchema>
export type Rule = z.infer<typeof ruleSchema>
export type AskBefore = z.infer<typeof askSchema>
export type OutputCell = z.infer<typeof outputSchema>
export type OutputField = z.infer<typeof fieldSchema>
export type Check = z.infer<typeof checkSchema>
export type OnFail = z.infer<typeof onFailSchema>
export type Advanced = z.infer<typeof advancedSchema>
export type Workdraft = z.infer<typeof workdraftSchema>
export type Problem = z.infer<typeof problemSchema>
export type Preview = z.infer<typeof previewSchema>
export type Published = z.infer<typeof publishedSchema>
export type CellEdit = { path: string; value: unknown }

export const decidedProposalSchema = z.object({
  contract_version: z.literal(1),
  workdraft: workdraftSchema.omit({ contract_version: true }),
  proposal: proposalSchema,
})
