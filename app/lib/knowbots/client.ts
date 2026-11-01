'use client'

import type { z } from 'zod'

import {
  acceptanceBoardSchema,
  categoriesSchema,
  countsSchema,
  deliveryBoardSchema,
  deliveryResultSchema,
  detailSchema,
  expertMovedSchema,
  grantResultSchema,
  incubationBoardSchema,
  manifestSchema,
  outputsSchema,
  questionsSchema,
  rerunStartedSchema,
  sentSchema,
  startedSchema,
  testsBoardSchema,
  type AcceptanceItem,
  type Counts,
  type DeliveryItem,
  type Detail,
  type ExpertStage,
  type Grant,
  type IncubationItem,
  type Outputs,
  type Question,
  type Test,
  type TestItem,
} from '@/contracts/knowbots'
import {
  oneRoundSchema,
  previewSchema,
  publishedSchema,
  roundsSchema,
  workdraftSchema,
  type Preview,
  type ProposalIn,
  type Published,
  type Round,
  type Workdraft,
} from '@/contracts/workdraft'
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
  limits: { timeout_seconds: number },
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

// ---------- 交付：交回、审核作者提交的交付（SDD 0046 第五节）、重跑、交 knowmart、停用 ----------
export async function returnExpert(expertId: string, csrfToken: string): Promise<ExpertStage> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${id(expertId)}/return`, {
    method: 'POST',
    csrfToken,
  })
  return parse(expertMovedSchema, answer).stage
}

// 交付时可选的类目（契约 knowbot-delivery/v1；名称照 knowmart 的叫法写在 messages）
export async function fetchCategories(): Promise<string[]> {
  return parse(categoriesSchema, await requestJson(`${BASE}/knowbot-categories`)).categories
}

export type DeliveryReviewInput = { approved: boolean; reason: string; category: string | null }

export async function reviewDelivery(
  deliveryId: string,
  body: DeliveryReviewInput,
  csrfToken: string,
) {
  const answer = await requestJson(`${BASE}/knowbot-deliveries/${id(deliveryId)}/review`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(deliveryResultSchema, answer)
}

// 平台发起重跑（公开、自助测的）：在作者的账号下、作者的电脑上、用作者的 key 跑（decisions ⑯）
export async function startRerun(deliveryId: string, csrfToken: string) {
  const answer = await requestJson(`${BASE}/knowbot-deliveries/${id(deliveryId)}/rerun`, {
    method: 'POST',
    csrfToken,
  })
  return parse(rerunStartedSchema, answer)
}

// 作废审过了却一直交不成的那一次（写理由）：撤依据，这一版回到「等作者提交」
export async function voidDelivery(deliveryId: string, reason: string, csrfToken: string) {
  const answer = await requestJson(`${BASE}/knowbot-deliveries/${id(deliveryId)}/void`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
  return parse(deliveryResultSchema, answer)
}

// 重试交 knowmart：审过了、上次没交成的
export async function retryDelivery(deliveryId: string, csrfToken: string) {
  const answer = await requestJson(`${BASE}/knowbot-deliveries/${id(deliveryId)}/deliver`, {
    method: 'POST',
    csrfToken,
  })
  return parse(deliveryResultSchema, answer)
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

// ---------- 作者授权给平台的（SDD 0046 第四节） ----------
// 轻受理：接这一次平台测试（进测试栏待发起）或不接（写理由）
export async function decideLight(
  grantId: string,
  body: { accepted: boolean; reason?: string },
  csrfToken: string,
): Promise<Grant> {
  const answer = await requestJson(`${BASE}/knowbot-grants/${id(grantId)}/decision`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(grantResultSchema, answer).grant
}

// 平台孵化做完，把草稿交还作者：孵化授权结束，名称转回作者自己来
export async function handBack(requestId: string, csrfToken: string): Promise<void> {
  await requestJson(`${BASE}/knowbot-requests/${id(requestId)}/hand-back`, {
    method: 'POST',
    csrfToken,
  })
}

// ---------- 平台孵化的工作稿（专家孵化方案第十二节） ----------
const workdraftOf = (requestId: string) => `${BASE}/knowbot-requests/${id(requestId)}/workdraft`

export async function fetchOperatorWorkdraft(requestId: string): Promise<Workdraft> {
  return parse(workdraftSchema, await requestJson(workdraftOf(requestId)))
}

// 改的格子存成提议，作者接受了才进稿
export async function propose(
  requestId: string,
  proposals: ProposalIn[],
  csrfToken: string,
): Promise<Workdraft> {
  const answer = await requestJson(`${workdraftOf(requestId)}/proposals`, {
    method: 'POST',
    csrfToken,
    body: { proposals },
  })
  return parse(workdraftSchema, answer)
}

export async function withdrawProposal(
  requestId: string,
  proposalId: string,
  csrfToken: string,
): Promise<Workdraft> {
  const answer = await requestJson(
    `${workdraftOf(requestId)}/proposals/${id(proposalId)}/withdraw`,
    { method: 'POST', csrfToken },
  )
  return parse(workdraftSchema, answer)
}

export async function previewOperator(requestId: string): Promise<Preview> {
  return parse(previewSchema, await requestJson(`${workdraftOf(requestId)}/preview`))
}

// 平台模式出一版：准专家记平台；最新一版创意要正式受理过，出处只认作者的
export async function publishOperator(requestId: string, csrfToken: string): Promise<Published> {
  const answer = await requestJson(`${workdraftOf(requestId)}/publish`, {
    method: 'POST',
    csrfToken,
  })
  return parse(publishedSchema, answer)
}

export async function fetchOperatorRounds(requestId: string): Promise<Round[]> {
  return parse(roundsSchema, await requestJson(`${workdraftOf(requestId)}/incubations`)).incubations
}

// 运营发起一轮 AI：在作者的账号、作者的电脑上、用作者的 key，上限是作者设的
export async function startOperatorRound(
  requestId: string,
  body: { action: 'draft' | 'revise'; instruction?: string; step_id?: string },
  csrfToken: string,
): Promise<Round> {
  const answer = await requestJson(`${workdraftOf(requestId)}/incubations`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(oneRoundSchema, answer).incubation
}
