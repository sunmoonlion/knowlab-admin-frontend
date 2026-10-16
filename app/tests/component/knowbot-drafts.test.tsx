import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KnowbotDrafts } from '@/components/knowbots/knowbot-drafts'
import type { AdminDraft } from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import {
  answerQuestion,
  createDraft,
  fetchQuestions,
  questionToUser,
  draftAction,
  fetchDrafts,
  fetchRequestDetail,
  fetchRequests,
  reviewRules,
  startTest,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

vi.mock('@/lib/knowbots/client', () => ({
  answerQuestion: vi.fn(),
  fetchQuestions: vi.fn(),
  questionToUser: vi.fn(),
  createDraft: vi.fn(),
  draftAction: vi.fn(),
  fetchDrafts: vi.fn(),
  fetchRequestDetail: vi.fn(),
  fetchRequests: vi.fn(),
  reviewRules: vi.fn(),
  startTest: vi.fn(),
}))

const CSRF = 'csrf-token-value-that-is-long-enough-1234'
const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const DRAFT = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

function draft(overrides: Partial<AdminDraft> = {}): AdminDraft {
  return {
    draft_id: DRAFT,
    revision: 1,
    version: '1',
    status: 'pending_test',
    name: '财务分析与预测',
    report: null,
    knowbot_id: null,
    request_id: REQUEST,
    title: '财务分析与预测',
    owner_subject: 'user-123',
    runtime: 'investment',
    rule_sources: [{ rule: '毛利率口径', source: 'user_text', ref: '第 4 问' }],
    rules_reviewed_by: null,
    rules_reviewed_at: null,
    run_id: null,
    run_attempts: 0,
    run_started_at: null,
    last_error: null,
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <KnowbotDrafts csrfToken={CSRF} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  for (const fn of [
    createDraft,
    draftAction,
    fetchDrafts,
    fetchRequestDetail,
    fetchRequests,
    reviewRules,
    startTest,
  ])
    vi.mocked(fn).mockReset()
  vi.mocked(fetchRequests).mockResolvedValue([])
  vi.mocked(fetchQuestions).mockReset().mockResolvedValue([])
  vi.mocked(answerQuestion).mockReset()
  vi.mocked(questionToUser).mockReset()
})

describe('分身草稿', () => {
  it('asks for the rule-source review before offering a test', async () => {
    vi.mocked(fetchDrafts).mockResolvedValueOnce([draft()])
    vi.mocked(fetchDrafts).mockResolvedValue([draft({ rules_reviewed_by: 'admin-1' })])
    vi.mocked(reviewRules).mockResolvedValue(undefined)
    vi.mocked(startTest).mockResolvedValue({
      contract_version: 1,
      run_id: 'r',
      run_status: 'accepted',
    })
    renderPage()
    expect(await screen.findByText(/毛利率口径 — user_text：第 4 问/)).toBeInTheDocument()
    expect(screen.queryByText('发起测试')).toBeNull()
    fireEvent.click(screen.getByText('已逐条核对出处'))
    await waitFor(() => expect(reviewRules).toHaveBeenCalledWith(DRAFT, CSRF))
    fireEvent.change(await screen.findByLabelText('预算上限（元）'), { target: { value: '30' } })
    fireEvent.click(screen.getByText('发起测试'))
    await waitFor(() =>
      expect(startTest).toHaveBeenCalledWith(
        DRAFT,
        { budget_limit: '30', timeout_seconds: 1800 },
        CSRF,
      ),
    )
    expect(vi.mocked(fetchDrafts)).toHaveBeenCalledWith('pending_test')
  })

  it('offers refresh and reset while testing, retry delivery when passed, and shows errors', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'testing', rules_reviewed_by: 'admin-1', run_attempts: 1 }),
    ])
    vi.mocked(draftAction).mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'not_stuck',
        message_key: 'x',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    renderPage()
    fireEvent.click(await screen.findByText('超时退回'))
    expect(await screen.findByRole('alert')).toHaveTextContent('not_stuck')
    expect(draftAction).toHaveBeenCalledWith(DRAFT, 'reset', CSRF)
    fireEvent.click(screen.getByText('刷新结果'))
    await waitFor(() => expect(draftAction).toHaveBeenCalledWith(DRAFT, 'refresh', CSRF))
  })

  it('shows the report of a failed draft', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'failed',
        rules_reviewed_by: 'admin-1',
        report: {
          status: 'failed',
          cost: null,
          finished_at: null,
          cases: [
            {
              case_id: 'c1',
              status: 'failed',
              steps: [{ step_id: 's2', accepted: false, failed_checks: ['口径'] }],
              expectations: [false],
              note: null,
            },
          ],
        },
      }),
    ])
    renderPage()
    const report = await screen.findByRole('list', { name: '测试报告' })
    expect(within(report).getByText(/期望满足 0\/1/)).toBeInTheDocument()
    expect(within(report).getByText('第 s2 步没过：口径')).toBeInTheDocument()
  })

  it('reads the method and creates a draft from a pasted manifest', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([])
    vi.mocked(fetchRequests).mockResolvedValue([
      {
        request_id: REQUEST,
        title: '财务分析与预测',
        runtime: 'investment',
        created_at: null,
        owner_subject: 'user-123',
        drafts: [],
      },
    ])
    vi.mocked(fetchRequestDetail).mockResolvedValue({
      contract_version: 1,
      request_id: REQUEST,
      title: '财务分析与预测',
      owner_subject: 'user-123',
      runtime: 'investment',
      idea: { kind: 'skill', skill: '# 我的方法' },
      cases: [{ case_id: 'c1' }],
      answered: [],
      datasets: [
        {
          dataset_id: '3b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
          name: '年报.pdf',
          version: '1',
          content_type: 'application/pdf',
          size_bytes: 10,
          sha256: 'a'.repeat(64),
          created_at: null,
        },
      ],
    })
    vi.mocked(createDraft).mockResolvedValue({ contract_version: 1, draft_id: DRAFT, version: '1' })
    renderPage()
    fireEvent.click(await screen.findByText('看方法并建草稿'))
    expect(await screen.findByText('# 我的方法')).toBeInTheDocument()
    expect(screen.getByText(/年报\.pdf · .*"dataset_id":"3b8a6c3e/)).toBeInTheDocument()
    const box = screen.getByLabelText('分身清单（knowbot-manifest/v1，JSON）')
    fireEvent.change(box, { target: { value: '{not json' } })
    fireEvent.click(screen.getByText('建草稿'))
    expect(await screen.findByRole('alert')).toHaveTextContent('不是合法的 JSON')
    expect(createDraft).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '{"schema": "knowbot-manifest/v1"}' } })
    fireEvent.click(screen.getByText('建草稿'))
    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(REQUEST, { schema: 'knowbot-manifest/v1' }, CSRF),
    )
  })

  it('answers approvals and sends judgement questions to the user', async () => {
    const base = {
      options: [],
      allow_free_text: true,
      case_id: 'c1',
      step_id: 's1',
      asked_at: '2026-10-17T00:00:00Z',
      title: '财务分析与预测',
      version: '1',
      revision: 1,
      route: null,
      owner_subject: 'user-123',
      draft_id: DRAFT,
      last_error: null,
    }
    vi.mocked(fetchDrafts).mockResolvedValue([])
    vi.mocked(fetchQuestions).mockResolvedValue([
      {
        ...base,
        question_id: '5b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        kind: 'tool_approval',
        text: '执行 python calc.py？',
      },
      {
        ...base,
        question_id: '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        kind: 'question',
        text: '毛利率按哪个口径？',
      },
      {
        ...base,
        question_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        kind: 'question',
        text: '已转的',
        route: 'user' as const,
      },
    ])
    vi.mocked(answerQuestion).mockResolvedValue(true)
    vi.mocked(questionToUser).mockResolvedValue(undefined)
    renderPage()
    expect(await screen.findByText('执行 python calc.py？')).toBeInTheDocument()
    expect(screen.getByText('已转给用户，等用户回答。')).toBeInTheDocument()
    fireEvent.click(screen.getByText('批准'))
    await waitFor(() =>
      expect(answerQuestion).toHaveBeenCalledWith(
        '5b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        { decision: 'approve' },
        CSRF,
      ),
    )
    fireEvent.click(screen.getByText('转给用户'))
    await waitFor(() =>
      expect(questionToUser).toHaveBeenCalledWith('6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10', CSRF),
    )
  })
})
