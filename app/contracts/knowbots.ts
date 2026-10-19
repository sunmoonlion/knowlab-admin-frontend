import { z } from 'zod'

// 管理端创意、分身、专家的约定（后端 app/interfaces/endpoints/knowbot_routes.py，SDD 0027、0037）。
// 代码里仍叫 request（创意）、draft（分身）、knowbot（专家）。

const RUNTIME = /^[a-z][a-z0-9-]{0,31}$/
const CASE_ID = /^[A-Za-z0-9._-]{1,64}$/

export const DRAFT_STATUSES = ['pending_test', 'testing', 'passed', 'failed', 'delivered'] as const
export const draftStatusSchema = z.enum(DRAFT_STATUSES)

const caseResultSchema = z
  .object({
    case_id: z.string().regex(CASE_ID),
    status: z.enum(['passed', 'failed', 'needs_human', 'error']),
    steps: z
      .array(
        z
          .object({
            step_id: z.string().min(1).max(128),
            accepted: z.boolean(),
            failed_checks: z.array(z.string()).max(64),
            // 没过的为什么没过，一条一句（审读第 3 条）；之前的报告没有
            details: z.array(z.string().max(200)).max(64).optional(),
          })
          .strict(),
      )
      .max(200),
    expectations: z.array(z.boolean()).max(64),
    note: z.string().max(1000).nullable(),
  })
  .strict()

const reportSchema = z
  .object({
    status: z.string().min(1).max(32),
    cases: z.array(caseResultSchema).max(50),
    cost: z
      .object({ spent: z.string().max(32), currency: z.literal('CNY') })
      .strict()
      .nullable(),
    finished_at: z.string().nullable(),
  })
  .strict()

const draftForUser = {
  draft_id: z.string().uuid(),
  revision: z.number().int().min(1),
  version: z.string().regex(/^[1-9][0-9]{0,5}$/),
  status: draftStatusSchema,
  name: z.string().max(80).nullable(),
  report: reportSchema.nullable(),
  knowbot_id: z.string().nullable(),
}

// 规则出处的形状归 knowmart 清单外层；这里只取要给人核对的三项
const ruleSourceSchema = z
  .object({ rule: z.string(), source: z.string(), ref: z.string() })
  .passthrough()

// 测试中：跑着的那条用例走到哪了（待办账 135）；只有编号、计数、步名和钱
const progressSchema = z
  .object({
    case_id: z.string().regex(CASE_ID),
    cases_done: z.number().int().min(0),
    cases_total: z.number().int().min(1),
    step: z.number().int().min(0),
    steps_total: z.number().int().min(0),
    step_title: z.string().max(200),
    attempt: z.number().int().min(0),
    spent: z.string().max(32),
    queued_behind: z.string().max(64).nullable().optional(),
  })
  .strict()

// 用户写的补充方法（SDD 0035）：用进出处（ref 写 amendment:<id>），或写理由不照做
const amendmentSchema = z
  .object({
    amendment_id: z.string().uuid(),
    text: z.string().min(1).max(4000),
    created_at: z.string().nullable(),
    status: z.enum(['open', 'used', 'declined']),
    used_in_revision: z.number().int().min(1).nullable(),
    declined_reason: z.string().max(500).nullable(),
    declined_at: z.string().nullable(),
    declined_by: z.string().max(512).nullable(),
  })
  .strict()

const adminDraftSchema = z
  .object({
    ...draftForUser,
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    owner_subject: z.string().min(1).max(512),
    runtime: z.string().regex(RUNTIME),
    rule_sources: z.array(ruleSourceSchema),
    rules_reviewed_by: z.string().nullable(),
    rules_reviewed_at: z.string().nullable(),
    run_id: z.string().nullable(),
    run_attempts: z.number().int().min(0),
    run_started_at: z.string().nullable(),
    last_error: z.string().nullable(),
    progress: progressSchema.nullable().optional(),
    run_status: z.string().max(32).nullable().optional(),
    run_running_since: z.string().nullable().optional(),
    // 核对出处前要处理的补充；这一稿建好后才写的条数（下一稿处理）。旧后端没有这两项
    amendments_open: z.array(z.string().uuid()).max(200).optional(),
    amendments_newer: z.number().int().min(0).optional(),
    // 交付时间（SDD 0037 专家栏）；之前交付的没有
    delivered_at: z.string().nullable().optional(),
  })
  .strict()

export const draftsSchema = z
  .object({ contract_version: z.literal(1), drafts: z.array(adminDraftSchema) })
  .strict()

const adminRequestSchema = z
  .object({
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    runtime: z.string().regex(RUNTIME),
    created_at: z.string().nullable(),
    owner_subject: z.string().min(1).max(512),
    drafts: z.array(z.object(draftForUser).strict()),
    amendments: z.array(amendmentSchema).max(200).optional(),
  })
  .strict()

export const requestsSchema = z
  .object({ contract_version: z.literal(1), requests: z.array(adminRequestSchema) })
  .strict()

const sixAnswersSchema = z
  .object({
    solves: z.string(),
    not_solves: z.string(),
    inputs: z.string(),
    steps: z.string(),
    outputs: z.string(),
    correctness: z.string(),
  })
  .strict()

export const requestDetailSchema = z
  .object({
    contract_version: z.literal(1),
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    owner_subject: z.string().min(1).max(512),
    runtime: z.string().regex(RUNTIME),
    idea: z.union([
      z.object({ kind: z.literal('six_questions'), answers: sixAnswersSchema }).strict(),
      z.object({ kind: z.literal('skill'), skill: z.string() }).strict(),
    ]),
    cases: z.array(z.record(z.string(), z.unknown())),
    // 这个用户的数据（只有元数据）：清单的 data_bindings 照这里写（数据 id + 版本 + sha256）
    answered: z.array(
      z
        .object({
          question_id: z.string().uuid(),
          kind: z.enum(['tool_approval', 'question', 'ask_before']),
          case_id: z.string(),
          key: z.string().nullable(),
          text: z.string(),
          answer: z.record(z.string(), z.string()).nullable(),
          answered_by: z.enum(['operator', 'user']).nullable(),
          route_reason: z.string().nullable(),
          answered_at: z.string().nullable(),
        })
        .strict(),
    ),
    datasets: z.array(
      z
        .object({
          dataset_id: z.string().uuid(),
          name: z.string(),
          version: z.string(),
          content_type: z.string(),
          size_bytes: z.number().int(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          created_at: z.string().nullable(),
        })
        .strict(),
    ),
    amendments: z.array(amendmentSchema).max(200).optional(),
  })
  .strict()

// 测试中待人决定的问题（有人值守）：审批由我们答；判断与开步前的提问建出来就归用户，
// 运营写一句理由改派给自己（operator）才能答（C-L1，审读第 2 条）
const questionSchema = z
  .object({
    question_id: z.string().uuid(),
    kind: z.enum(['tool_approval', 'question', 'ask_before']),
    text: z.string().min(1).max(4000),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
    allow_free_text: z.boolean(),
    case_id: z.string(),
    step_id: z.string().nullable(),
    asked_at: z.string(),
    title: z.string(),
    version: z.string(),
    revision: z.number().int(),
    route: z.enum(['user', 'operator']).nullable(),
    route_reason: z.string().nullable(),
    owner_subject: z.string(),
    draft_id: z.string().uuid(),
    last_error: z.string().nullable(),
  })
  .strict()

export const questionsSchema = z
  .object({ contract_version: z.literal(1), questions: z.array(questionSchema) })
  .strict()

export const answeredSchema = z
  .object({ contract_version: z.literal(1), question_id: z.string().uuid(), sent: z.boolean() })
  .strict()

export type Question = z.infer<typeof questionSchema>

export const createdDraftSchema = z
  .object({ contract_version: z.literal(1), draft_id: z.string().uuid(), version: z.string() })
  .strict()

export const startedSchema = z
  .object({ contract_version: z.literal(1), run_id: z.string().min(1), run_status: z.string() })
  .strict()

// 一条用例的产出：成稿与各步交回物（SDD 0037，契约 test-run-case-outputs，运行方给）
const outputCheckSchema = z
  .object({
    label: z.string().max(200),
    passed: z.boolean().nullable().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict()

export const OUTCOMES = [
  'accepted',
  'rejected',
  'failed',
  'over_budget',
  'cancelled',
  'running',
  'not_reached',
] as const

const stepOutputSchema = z
  .object({
    step_id: z.string().min(1).max(128),
    title: z.string().max(200).optional(),
    outcome: z.enum(OUTCOMES),
    artifact: z.unknown().optional(),
    artifact_omitted_bytes: z.number().int().min(0).nullable().optional(),
    returned_raw: z.string().nullable().optional(),
    checks: z.array(outputCheckSchema).max(64).optional(),
  })
  .strict()

const caseOutputsSchema = z
  .object({
    contract: z.literal('knowbot-test-run/v1'),
    run_id: z.string(),
    case_id: z.string().regex(CASE_ID),
    deliverable: z
      .object({ path: z.string().max(1024), text: z.string(), truncated: z.boolean().optional() })
      .strict()
      .nullable()
      .optional(),
    deliverable_note: z.string().max(500).nullable().optional(),
    steps: z.array(stepOutputSchema).max(200).optional(),
    error: z.string().max(500).nullable().optional(),
  })
  .strict()

export const outputsSchema = z
  .object({
    contract_version: z.literal(1),
    draft_id: z.string().uuid(),
    run_id: z.string().nullable(),
    cases: z.array(
      z
        .object({
          case_id: z.string().regex(CASE_ID),
          fetched_at: z.string().nullable(),
          note: z.string().nullable(),
          outputs: caseOutputsSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict()

export const manifestSchema = z
  .object({
    contract_version: z.literal(1),
    draft_id: z.string().uuid(),
    manifest: z.record(z.string(), z.unknown()),
  })
  .strict()

export type DraftStatus = z.infer<typeof draftStatusSchema>
export type AdminDraft = z.infer<typeof adminDraftSchema>
export type AdminRequest = z.infer<typeof adminRequestSchema>
export type RequestDetail = z.infer<typeof requestDetailSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
export type Progress = z.infer<typeof progressSchema>
export type Amendment = z.infer<typeof amendmentSchema>
export type Outputs = z.infer<typeof outputsSchema>
export type CaseOutputs = z.infer<typeof caseOutputsSchema>
export type StepOutput = z.infer<typeof stepOutputSchema>
