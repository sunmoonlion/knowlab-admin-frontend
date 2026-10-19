'use client'

import type { z } from 'zod'

import {
  answeredSchema,
  createdDraftSchema,
  questionsSchema,
  draftsSchema,
  manifestSchema,
  outputsSchema,
  requestDetailSchema,
  requestsSchema,
  startedSchema,
  type AdminDraft,
  type AdminRequest,
  type DraftStatus,
  type Outputs,
  type Question,
  type RequestDetail,
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

const REQUESTS = '/api/admin/v1/knowbot-requests'
const DRAFTS = '/api/admin/v1/knowbot-drafts'
const draftPath = (id: string, action: string) => `${DRAFTS}/${encodeURIComponent(id)}/${action}`

export async function fetchRequests(): Promise<AdminRequest[]> {
  return parse(requestsSchema, await requestJson(REQUESTS)).requests
}

export async function fetchRequestDetail(requestId: string): Promise<RequestDetail> {
  return parse(
    requestDetailSchema,
    await requestJson(`${REQUESTS}/${encodeURIComponent(requestId)}`),
  )
}

export async function fetchDrafts(status: DraftStatus | null): Promise<AdminDraft[]> {
  const query = status ? `?status=${status}` : ''
  return parse(draftsSchema, await requestJson(`${DRAFTS}${query}`)).drafts
}

// 分身最近一次测试每条用例的成稿与各步交回物：测试人员验证这一稿用（SDD 0037）
export async function fetchOutputs(draftId: string): Promise<Outputs> {
  return parse(outputsSchema, await requestJson(draftPath(draftId, 'outputs')))
}

// 分身的清单原文：对照材料里只读、可复制
export async function fetchManifest(draftId: string): Promise<Record<string, unknown>> {
  return parse(manifestSchema, await requestJson(draftPath(draftId, 'manifest'))).manifest
}

// 手工孵化：管理员贴清单孵出分身（以后的辅助、自动孵化也接在这里，SDD 0037）
export async function createDraft(requestId: string, manifest: unknown, csrfToken: string) {
  const answer = await requestJson(`${REQUESTS}/${encodeURIComponent(requestId)}/drafts`, {
    method: 'POST',
    csrfToken,
    body: { manifest },
  })
  return parse(createdDraftSchema, answer)
}

export async function reviewRules(draftId: string, csrfToken: string): Promise<void> {
  await requestJson(draftPath(draftId, 'rules-review'), { method: 'POST', csrfToken })
}

export async function startTest(
  draftId: string,
  limits: { budget_limit: string; timeout_seconds: number },
  csrfToken: string,
) {
  const answer = await requestJson(draftPath(draftId, 'test'), {
    method: 'POST',
    csrfToken,
    body: limits,
  })
  return parse(startedSchema, answer)
}

export async function draftAction(
  draftId: string,
  action: 'refresh' | 'deliver' | 'reset',
  csrfToken: string,
): Promise<void> {
  await requestJson(draftPath(draftId, action), { method: 'POST', csrfToken })
}

const QUESTIONS = '/api/admin/v1/knowbot-questions'

export async function fetchQuestions(): Promise<Question[]> {
  return parse(questionsSchema, await requestJson(QUESTIONS)).questions
}

export type AnswerInput = { decision?: 'approve' | 'deny'; option_id?: string; text?: string }

export async function answerQuestion(
  questionId: string,
  answer: AnswerInput,
  csrfToken: string,
): Promise<boolean> {
  const done = await requestJson(`${QUESTIONS}/${encodeURIComponent(questionId)}/answer`, {
    method: 'POST',
    csrfToken,
    body: answer,
  })
  return parse(answeredSchema, done).sent
}

// 运营认为只是跑法问题：写一句理由，改派给自己答（审读第 2 条）
export async function questionTake(
  questionId: string,
  reason: string,
  csrfToken: string,
): Promise<void> {
  await requestJson(`${QUESTIONS}/${encodeURIComponent(questionId)}/take`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
}

export async function questionToUser(questionId: string, csrfToken: string): Promise<void> {
  await requestJson(`${QUESTIONS}/${encodeURIComponent(questionId)}/to-user`, {
    method: 'POST',
    csrfToken,
  })
}

// 照不了的补充写理由不照做，用户看得到（SDD 0035）；只有 admin 能做
export async function declineAmendment(
  amendmentId: string,
  reason: string,
  csrfToken: string,
): Promise<void> {
  await requestJson(`/api/admin/v1/knowbot-amendments/${encodeURIComponent(amendmentId)}/decline`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
}
