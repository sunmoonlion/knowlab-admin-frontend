import { z } from 'zod'

// 管理端分身草稿的约定（后端 app/interfaces/endpoints/knowbot_routes.py，SDD 0027）。

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
  })
  .strict()

export const createdDraftSchema = z
  .object({ contract_version: z.literal(1), draft_id: z.string().uuid(), version: z.string() })
  .strict()

export const startedSchema = z
  .object({ contract_version: z.literal(1), run_id: z.string().min(1), run_status: z.string() })
  .strict()

export type DraftStatus = z.infer<typeof draftStatusSchema>
export type AdminDraft = z.infer<typeof adminDraftSchema>
export type AdminRequest = z.infer<typeof adminRequestSchema>
export type RequestDetail = z.infer<typeof requestDetailSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
