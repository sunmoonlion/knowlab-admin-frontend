import { z } from 'zod'

// 管理端：创意、受理、准专家、测试、专家（后端 app/interfaces/endpoints/knowbot_routes.py 与
// knowbot_views.py，SDD 0037）。代码里仍叫 request（创意的名称）、draft（准专家）。
// 回包里多出来的字段不算错（账 144：线上前端按严格形状校验，后端多一个字段整页就读不出），
// 少了、类型不对才算。

const RUNTIME = /^[a-z][a-z0-9-]{0,31}$/
const CASE_ID = /^[A-Za-z0-9._-]{1,64}$/
const when = z.string().nullable()

export const DRAFT_STATUSES = ['pending_test', 'testing', 'passed', 'failed'] as const
export const TEST_STATUSES = [
  'queued',
  'running',
  'waiting',
  'passed',
  'failed',
  'platform_error',
] as const
export const EXPERT_STAGES = [
  'to_return',
  'awaiting_user',
  'declined',
  'to_review',
  'rejected',
  'to_deliver',
  'listed',
  'stopped',
] as const
export const CHECKS = ['C-L5', 'C-L2', 'C-L1'] as const

const sixAnswersSchema = z.object({
  solves: z.string(),
  not_solves: z.string(),
  inputs: z.string(),
  steps: z.string(),
  outputs: z.string(),
  correctness: z.string(),
})

export const ideaSchema = z.union([
  z.object({ kind: z.literal('six_questions'), answers: sixAnswersSchema }),
  z.object({ kind: z.literal('skill'), skill: z.string() }),
])

const acceptanceSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  decided_at: when,
  trial: z.boolean(),
  checks: z.record(z.string(), z.object({ ok: z.boolean(), note: z.string() })),
  decided_by: z.string(),
})

const versionSchema = z.object({
  version: z.number().int().min(1),
  idea: ideaSchema,
  cases: z.array(z.record(z.string(), z.unknown())),
  consent_version: z.number().int().min(1),
  created_at: when,
  acceptance: acceptanceSchema.nullable(),
  created_by: z.string(),
})

// 规则出处的形状归 knowmart 清单外层；这里只取要给人核对的三项
const ruleSourceSchema = z.object({ rule: z.string(), source: z.string(), ref: z.string() })

const userReviewSchema = z
  .object({
    state: z.enum(['pending', 'ok', 'not_ok']),
    note: z.string().nullable().optional(),
    requested_at: when,
    answered_at: when.optional(),
  })
  .nullable()

const draftSchema = z.object({
  draft_id: z.string().uuid(),
  label: z.string(),
  version: z.string().regex(/^[1-9][0-9]{0,5}$/),
  revision: z.number().int().min(1),
  request_version: z.number().int().min(1),
  status: z.enum(DRAFT_STATUSES),
  name: z.string().nullable(),
  created_at: when,
  user_review: userReviewSchema,
  rule_sources: z.array(ruleSourceSchema),
  rules_reviewed_by: z.string().nullable(),
  rules_reviewed_at: when,
  requested_by: z.string().nullable().optional(),
  // 待测的还差什么：版本号已出过专家（再孵化）、出处没核、这个名称有测试在跑
  blocked: z.enum(['version_taken', 'rules_not_reviewed', 'test_running']).nullable(),
})

const caseResultSchema = z.object({
  case_id: z.string().regex(CASE_ID),
  status: z.enum(['passed', 'failed', 'needs_human', 'error']),
  steps: z
    .array(
      z.object({
        step_id: z.string().min(1).max(128),
        accepted: z.boolean(),
        failed_checks: z.array(z.string()).max(64),
        // 没过的为什么没过，一条一句（审读第 3 条）；之前的报告没有
        details: z.array(z.string().max(200)).max(64).optional(),
      }),
    )
    .max(200),
  expectations: z.array(z.boolean()).max(64),
  note: z.string().max(1000).nullable(),
})

const reportSchema = z.object({
  status: z.string().min(1).max(32),
  cases: z.array(caseResultSchema).max(50),
  cost: z.object({ spent: z.string().max(32), currency: z.literal('CNY') }).nullable(),
  finished_at: when,
})

// 在跑的那条用例走到哪了（待办账 135）；只有编号、计数、步名和钱
const progressSchema = z.object({
  case_id: z.string().regex(CASE_ID),
  cases_done: z.number().int().min(0),
  cases_total: z.number().int().min(1),
  step: z.number().int().min(0),
  steps_total: z.number().int().min(0),
  step_title: z.string().max(200).optional(),
  attempt: z.number().int().min(0).optional(),
  spent: z.string().max(32),
  queued_behind: z.string().max(64).nullable().optional(),
})

const testSchema = z.object({
  test_id: z.string().uuid(),
  number: z.number().int().min(1),
  draft_id: z.string().uuid(),
  label: z.string().nullable(),
  status: z.enum(TEST_STATUSES),
  started_at: when,
  finished_at: when,
  report: reportSchema.nullable(),
  // 0012 之前测的（从准专家上搬来的那一次）：再之前的没留记录
  backfilled: z.boolean(),
  run_id: z.string(),
  budget_limit: z.string().nullable(),
  timeout_seconds: z.number().int().nullable(),
  started_by: z.string().nullable(),
  error: z.string().nullable(),
  progress: progressSchema.nullable(),
  run_status: z.string().nullable(),
  run_running_since: when,
  // 已受理还没开跑时在等什么（账 141）
  run_blocked: z.enum(['computer_offline', 'folder_not_ready']).nullable(),
})

const expertSchema = z.object({
  expert_id: z.string().uuid(),
  version: z.number().int().min(1),
  name: z.string().nullable(),
  stage: z.enum(EXPERT_STAGES),
  draft_id: z.string().uuid(),
  label: z.string().nullable(),
  test_id: z.string().uuid().nullable(),
  test_number: z.number().int().nullable(),
  created_at: when,
  returned_at: when,
  user_accepted: z.boolean().nullable(),
  user_decided_at: when,
  review_approved: z.boolean().nullable(),
  review_listing: z.enum(['self', 'public']).nullable(),
  review_reason: z.string().nullable(),
  reviewed_at: when,
  listed_at: when,
  knowbot_id: z.string().nullable(),
  listing_status: z.string().nullable(),
  stopped_at: when,
  stop_reason: z.string().nullable(),
  // 试行期上架：两道门之前交付
  trial: z.boolean(),
  returned_by: z.string().nullable(),
  user_decided_by: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  stopped_by: z.string().nullable(),
  digest: z.string().nullable(),
  delivery_error: z.string().nullable(),
})

const summarySchema = z.object({
  version: z.number().int().min(1),
  acceptance: z.enum(['accepted', 'rejected']).nullable(),
  draft: z.string().nullable(),
  test: z.object({ number: z.number().int(), status: z.enum(TEST_STATUSES) }).nullable(),
  expert: z.object({ version: z.number().int(), stage: z.enum(EXPERT_STAGES) }).nullable(),
})

const brief = {
  request_id: z.string().uuid(),
  title: z.string().min(1).max(80),
  owner_subject: z.string().min(1).max(512),
}

// 补充方法（SDD 0035，已取消）：旧的只读
const amendmentSchema = z.object({
  amendment_id: z.string().uuid(),
  text: z.string(),
  created_at: when,
  status: z.enum(['open', 'used', 'declined']),
  used_in_revision: z.number().int().min(1).nullable(),
  declined_reason: z.string().nullable(),
  declined_at: when,
  declined_by: z.string().nullable(),
})

const datasetSchema = z.object({
  dataset_id: z.string().uuid(),
  name: z.string(),
  version: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: when,
})

const answeredSchema = z.object({
  question_id: z.string().uuid(),
  kind: z.enum(['tool_approval', 'question', 'ask_before']),
  case_id: z.string(),
  key: z.string().nullable(),
  text: z.string(),
  answer: z.record(z.string(), z.string()).nullable(),
  answered_by: z.enum(['operator', 'user']).nullable(),
  answered_at: when,
  draft_id: z.string().uuid(),
  route_reason: z.string().nullable(),
})

// 详情页的记录：哪个过程、输入、输出、谁、何时（各过程带的项不同）
const eventSchema = z
  .object({ at: z.string(), kind: z.string(), by: z.string().nullable().optional() })
  .catchall(z.unknown())

export const detailSchema = z.object({
  contract_version: z.literal(1),
  ...brief,
  runtime: z.string().regex(RUNTIME),
  created_at: when,
  latest_version: z.number().int().min(1),
  summary: summarySchema,
  consent_version: z.number().int().min(1),
  consent_current: z.number().int().min(1),
  versions: z.array(versionSchema),
  drafts: z.array(draftSchema),
  tests: z.array(testSchema),
  experts: z.array(expertSchema),
  timeline: z.array(eventSchema),
  amendments: z.array(amendmentSchema),
  datasets: z.array(datasetSchema),
  answered: z.array(answeredSchema),
})

export const countsSchema = z.object({
  contract_version: z.literal(1),
  counts: z.object({
    acceptance: z.number().int().min(0),
    incubation: z.number().int().min(0),
    tests: z.number().int().min(0),
    delivery: z.number().int().min(0),
  }),
})

const acceptanceItem = z.object({
  ...brief,
  category: z.enum(['pending', 'accepted', 'rejected']),
  ...versionSchema.shape,
})

const incubationItem = z.object({
  ...brief,
  category: z.enum(['todo', 'in_progress', 'done']),
  latest_version: z.number().int().min(1),
  latest_accepted: z.number().int().min(1).nullable(),
  draft: draftSchema.nullable(),
})

const testItem = z.object({
  ...brief,
  category: z.enum(['to_start', 'queued', 'running', 'waiting', 'finished']),
  draft: draftSchema.nullable(),
  test: testSchema.nullable(),
})

const deliveryItem = z.object({
  ...brief,
  category: z.enum(['to_return', 'awaiting_user', 'to_review', 'listed', 'not_listed', 'stopped']),
  ...expertSchema.shape,
})

const boardOf = <T extends z.ZodTypeAny>(column: string, item: T) =>
  z.object({ contract_version: z.literal(1), column: z.literal(column), items: z.array(item) })

export const acceptanceBoardSchema = boardOf('acceptance', acceptanceItem)
export const incubationBoardSchema = boardOf('incubation', incubationItem)
export const testsBoardSchema = boardOf('tests', testItem)
export const deliveryBoardSchema = boardOf('delivery', deliveryItem)

// 测试中待人决定的问题（有人值守）：审批由我们答；判断与开步前的提问建出来就归用户，
// 运营写一句理由改派给自己（operator）才能答（C-L1，审读第 2 条）
const questionSchema = z.object({
  question_id: z.string().uuid(),
  kind: z.enum(['tool_approval', 'question', 'ask_before']),
  text: z.string().min(1).max(4000),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  allow_free_text: z.boolean(),
  case_id: z.string(),
  step_id: z.string().nullable(),
  asked_at: z.string(),
  title: z.string(),
  request_id: z.string().uuid(),
  label: z.string(),
  draft_id: z.string().uuid(),
  route: z.enum(['user', 'operator']).nullable(),
  route_reason: z.string().nullable(),
  owner_subject: z.string(),
  last_error: z.string().nullable(),
})

export const questionsSchema = z.object({
  contract_version: z.literal(1),
  questions: z.array(questionSchema),
})

export const sentSchema = z.object({
  contract_version: z.literal(1),
  question_id: z.string().uuid(),
  sent: z.boolean(),
})

export const createdDraftSchema = z.object({
  contract_version: z.literal(1),
  draft_id: z.string().uuid(),
  version: z.string(),
  revision: z.number().int(),
  request_version: z.number().int(),
})

export const startedSchema = z.object({ contract_version: z.literal(1), test: testSchema })

export const expertMovedSchema = z.object({
  contract_version: z.literal(1),
  expert_id: z.string().uuid(),
  stage: z.enum(EXPERT_STAGES),
  delivery_error: z.string().nullable().optional(),
})

// 一条用例的产出：成稿与各步交回物（SDD 0037，契约 test-run-case-outputs，运行方给）
const outputCheckSchema = z.object({
  label: z.string().max(200),
  passed: z.boolean().nullable().optional(),
  message: z.string().max(1000).optional(),
})

export const OUTCOMES = [
  'accepted',
  'rejected',
  'failed',
  'over_budget',
  'cancelled',
  'running',
  'not_reached',
] as const

const stepOutputSchema = z.object({
  step_id: z.string().min(1).max(128),
  title: z.string().max(200).optional(),
  outcome: z.enum(OUTCOMES),
  artifact: z.unknown().optional(),
  artifact_omitted_bytes: z.number().int().min(0).nullable().optional(),
  returned_raw: z.string().nullable().optional(),
  checks: z.array(outputCheckSchema).max(64).optional(),
})

const caseOutputsSchema = z.object({
  contract: z.literal('knowbot-test-run/v1'),
  run_id: z.string(),
  case_id: z.string().regex(CASE_ID),
  deliverable: z
    .object({
      path: z.string().max(1024),
      text: z.string(),
      truncated: z.boolean().optional(),
      step_id: z.string().max(128).nullable().optional(), // 哪一步写的
    })
    .nullable()
    .optional(),
  deliverable_note: z.string().max(500).nullable().optional(),
  steps: z.array(stepOutputSchema).max(200).optional(),
  error: z.string().max(500).nullable().optional(),
})

export const outputsSchema = z.object({
  contract_version: z.literal(1),
  test_id: z.string().uuid(),
  run_id: z.string(),
  // 创意是在旧说明下同意的：产出不取不显示（审读 10-19）
  consent_needed: z.boolean(),
  cases: z.array(
    z.object({
      case_id: z.string().regex(CASE_ID),
      fetched_at: when,
      note: z.string().nullable(),
      outputs: caseOutputsSchema.nullable(),
    }),
  ),
})

export const manifestSchema = z.object({
  contract_version: z.literal(1),
  draft_id: z.string().uuid(),
  manifest: z.record(z.string(), z.unknown()),
})

export type Idea = z.infer<typeof ideaSchema>
export type Acceptance = z.infer<typeof acceptanceSchema>
export type Version = z.infer<typeof versionSchema>
export type Draft = z.infer<typeof draftSchema>
export type Test = z.infer<typeof testSchema>
export type TestStatus = (typeof TEST_STATUSES)[number]
export type Expert = z.infer<typeof expertSchema>
export type ExpertStage = (typeof EXPERT_STAGES)[number]
export type Summary = z.infer<typeof summarySchema>
export type Detail = z.infer<typeof detailSchema>
export type Counts = z.infer<typeof countsSchema>['counts']
export type Column = keyof Counts
export type AcceptanceItem = z.infer<typeof acceptanceItem>
export type IncubationItem = z.infer<typeof incubationItem>
export type TestItem = z.infer<typeof testItem>
export type DeliveryItem = z.infer<typeof deliveryItem>
export type Question = z.infer<typeof questionSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
export type Amendment = z.infer<typeof amendmentSchema>
export type Dataset = z.infer<typeof datasetSchema>
export type Answered = z.infer<typeof answeredSchema>
export type Event = z.infer<typeof eventSchema>
export type Outputs = z.infer<typeof outputsSchema>
export type CaseOutputs = z.infer<typeof caseOutputsSchema>
export type StepOutput = z.infer<typeof stepOutputSchema>
