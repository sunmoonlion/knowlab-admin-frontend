'use client'

import type { z } from 'zod'

import {
  acceptanceBoardSchema,
  countsSchema,
  createdDraftSchema,
  deliveryBoardSchema,
  detailSchema,
  expertMovedSchema,
  incubationBoardSchema,
  manifestSchema,
  outputsSchema,
  questionsSchema,
  sentSchema,
  startedSchema,
  testsBoardSchema,
  type AcceptanceItem,
  type Counts,
  type DeliveryItem,
  type Detail,
  type ExpertStage,
  type IncubationItem,
  type Outputs,
  type Question,
  type Test,
  type TestItem,
} from '@/contracts/knowbots'
import { requestJson } from '@/lib/api/client'

export class KnowbotContractError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('knowbot_contract_invalid')
    this.name = 'KnowbotContractError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new KnowbotContractError({ cause: parsed.error })
  return parsed.data
}

const BASE = '/api/admin/v1'
const id = (value: string) => encodeURIComponent(value)

// ---------- 四栏与详情页（SDD 0037 第七、第九节） ----------
export async function fetchCounts(): Promise<Counts> {
  return parse(countsSchema, await requestJson(`${BASE}/knowbot-counts`)).counts
}

export async function fetchAcceptance(): Promise<AcceptanceItem[]> {
  return parse(acceptanceBoardSchema, await requestJson(`${BASE}/knowbot-board/acceptance`)).items
}

export async function fetchIncubation(): Promise<IncubationItem[]> {
  return parse(incubationBoardSchema, await requestJson(`${BASE}/knowbot-board/incubation`)).items
}

export async function fetchTests(): Promise<TestItem[]> {
  return parse(testsBoardSchema, await requestJson(`${BASE}/knowbot-board/tests`)).items
}

export async function fetchDelivery(): Promise<DeliveryItem[]> {
  return parse(deliveryBoardSchema, await requestJson(`${BASE}/knowbot-board/delivery`)).items
}

export async function fetchDetail(requestId: string): Promise<Detail> {
  return parse(detailSchema, await requestJson(`${BASE}/knowbot-requests/${id(requestId)}`))
}

// ---------- 受理 ----------
export type AcceptanceInput = {
  checks: Record<string, { ok: boolean; note: string }>
  accepted: boolean
  reason: string
}

export async function accept(
  requestId: string,
  version: number,
  body: AcceptanceInput,
  csrfToken: string,
): Promise<void> {
  await requestJson(`${BASE}/knowbot-requests/${id(requestId)}/versions/${version}/acceptance`, {
    method: 'POST',
    csrfToken,
    body,
  })
}

// ---------- 孵化 ----------
// 手工孵化：贴清单孵出准专家（以后的辅助、自动孵化也接在这里，SDD 0029）
export async function createDraft(
  requestId: string,
  manifest: unknown,
  requestVersion: number,
  csrfToken: string,
) {
  const answer = await requestJson(`${BASE}/knowbot-requests/${id(requestId)}/drafts`, {
    method: 'POST',
    csrfToken,
    body: { manifest, request_version: requestVersion },
  })
  return parse(createdDraftSchema, answer)
}

export async function draftAction(
  draftId: string,
  action: 'review-request' | 'rules-review',
  csrfToken: string,
): Promise<void> {
  await requestJson(`${BASE}/knowbot-drafts/${id(draftId)}/${action}`, {
    method: 'POST',
    csrfToken,
  })
}

// 准专家的清单原文：过程页里只读、可复制
export async function fetchManifest(draftId: string): Promise<Record<string, unknown>> {
  return parse(manifestSchema, await requestJson(`${BASE}/knowbot-drafts/${id(draftId)}/manifest`))
    .manifest
}

// ---------- 测试 ----------
export async function startTest(
  draftId: string,
  limits: { budget_limit: string; timeout_seconds: number },
  csrfToken: string,
): Promise<Test> {
  const answer = await requestJson(`${BASE}/knowbot-drafts/${id(draftId)}/test`, {
    method: 'POST',
    csrfToken,
    body: limits,
  })
  return parse(startedSchema, answer).test
}

export async function testAction(
  testId: string,
  action: 'refresh' | 'reset',
  csrfToken: string,
): Promise<void> {
  await requestJson(`${BASE}/knowbot-tests/${id(testId)}/${action}`, {
    method: 'POST',
    csrfToken,
  })
}

// 这次测试每条用例的成稿与各步交回物：测试人员验证这一稿用（SDD 0037）
export async function fetchOutputs(testId: string): Promise<Outputs> {
  return parse(outputsSchema, await requestJson(`${BASE}/knowbot-tests/${id(testId)}/outputs`))
}

// ---------- 交付：交回、运营审核、交 knowmart、停用 ----------
export async function expertAction(
  expertId: string,
  action: 'return' | 'deliver',
  csrfToken: string,
): Promise<ExpertStage> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${id(expertId)}/${action}`, {
    method: 'POST',
    csrfToken,
  })
  return parse(expertMovedSchema, answer).stage
}

export type ReviewInput = { approved: boolean; listing: 'self' | 'public' | null; reason: string }

export async function reviewExpert(expertId: string, body: ReviewInput, csrfToken: string) {
  const answer = await requestJson(`${BASE}/knowbot-experts/${id(expertId)}/review`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(expertMovedSchema, answer)
}

export async function stopExpert(expertId: string, reason: string, csrfToken: string) {
  const answer = await requestJson(`${BASE}/knowbot-experts/${id(expertId)}/stop`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
  return parse(expertMovedSchema, answer).stage
}

// ---------- 测试中的问题 ----------
const QUESTIONS = `${BASE}/knowbot-questions`

export async function fetchQuestions(): Promise<Question[]> {
  return parse(questionsSchema, await requestJson(QUESTIONS)).questions
}

export type AnswerInput = { decision?: 'approve' | 'deny'; option_id?: string; text?: string }

export async function answerQuestion(
  questionId: string,
  answer: AnswerInput,
  csrfToken: string,
): Promise<boolean> {
  const done = await requestJson(`${QUESTIONS}/${id(questionId)}/answer`, {
    method: 'POST',
    csrfToken,
    body: answer,
  })
  return parse(sentSchema, done).sent
}

// 运营认为只是跑法问题：写一句理由，改派给自己答（审读第 2 条）
export async function questionTake(
  questionId: string,
  reason: string,
  csrfToken: string,
): Promise<void> {
  await requestJson(`${QUESTIONS}/${id(questionId)}/take`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
}

export async function questionToUser(questionId: string, csrfToken: string): Promise<void> {
  await requestJson(`${QUESTIONS}/${id(questionId)}/to-user`, { method: 'POST', csrfToken })
}
