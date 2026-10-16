'use client'

import type { z } from 'zod'

import {
  createdDraftSchema,
  draftsSchema,
  requestDetailSchema,
  requestsSchema,
  startedSchema,
  type AdminDraft,
  type AdminRequest,
  type DraftStatus,
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

// 过渡做法：管理员贴清单建草稿（等「后端自动生成」定了再换）
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
