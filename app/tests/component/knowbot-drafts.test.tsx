import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KnowbotDrafts } from '@/components/knowbots/knowbot-drafts'
import type { AdminDraft, AdminRequest, RequestDetail } from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/api/client'
import {
  answerQuestion,
  createDraft,
  fetchQuestions,
  questionTake,
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
  questionTake: vi.fn(),
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
    runtime: 'knowbench',
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

function request(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    request_id: REQUEST,
    title: '财务分析与预测',
    runtime: 'knowbench',
    created_at: '2026-10-18T10:00:00Z',
    owner_subject: 'user-123',
    drafts: [],
    ...overrides,
  }
}

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    contract_version: 1,
    request_id: REQUEST,
    title: '财务分析与预测',
    owner_subject: 'user-123',
    runtime: 'knowbench',
    idea: { kind: 'skill', skill: '# 我的方法' },
    cases: [
      {
        case_id: 'c1',
        input: { question: '茅台近三年营收？', answers: {} },
        expectations: [
          {
            artifact: 'official',
            path: 'official_by_year.2024.revenue',
            kind: 'approx',
            value: 170899152276.34,
            tolerance: 0.001,
          },
        ],
      },
    ],
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
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages} timeZone="Asia/Shanghai">
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
  vi.mocked(fetchRequests).mockResolvedValue([request()])
  vi.mocked(fetchRequestDetail).mockResolvedValue(detail())
  vi.mocked(fetchQuestions).mockReset().mockResolvedValue([])
  vi.mocked(answerQuestion).mockReset()
  vi.mocked(questionToUser).mockReset()
  vi.mocked(questionTake).mockReset()
})

describe('专家草稿', () => {
  it('没有管理权限时说清楚要换账号，不说「刷新再试」（账 134）', async () => {
    const forbidden = new ApiClientError(403, {
      code: 'forbidden',
      message_key: 'errors.forbidden',
      retryable: false,
      correlation_id: 'c-1',
    })
    vi.mocked(fetchDrafts).mockRejectedValue(forbidden)
    vi.mocked(fetchRequests).mockRejectedValue(forbidden)
    renderPage()
    expect(await screen.findByText(messages.knowbots.noPermission)).toBeInTheDocument()
    expect(screen.queryByText(messages.knowbots.loadFailed)).toBeNull()
  })

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
    expect(vi.mocked(fetchDrafts)).toHaveBeenCalledWith(null)
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

  it('tells an operator that returning a test is for admins only', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'testing', rules_reviewed_by: 'admin-1', run_attempts: 1 }),
    ])
    vi.mocked(draftAction).mockRejectedValueOnce(
      new ApiClientError(403, {
        code: 'forbidden',
        message_key: 'errors.forbidden',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    renderPage()
    fireEvent.click(await screen.findByText('超时退回'))
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.knowbots.adminOnly)
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
              steps: [
                {
                  step_id: 's2',
                  accepted: false,
                  failed_checks: ['口径'],
                  details: ['口径: #0 d!data!营收@2024 says 150 but the data has 100'],
                },
              ],
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
    // 没过的为什么没过（审读第 3 条）
    expect(
      within(report).getByText('口径: #0 d!data!营收@2024 says 150 but the data has 100'),
    ).toBeInTheDocument()
  })

  it('reads the method and creates a draft from a pasted manifest', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([])
    vi.mocked(createDraft).mockResolvedValue({ contract_version: 1, draft_id: DRAFT, version: '1' })
    renderPage()
    expect(await screen.findByText('下一步：贴专家清单，建第一稿')).toBeInTheDocument()
    expect(await screen.findByText('# 我的方法')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /用户的数据/ }))
    expect(screen.getByText(/年报\.pdf · .*"dataset_id":"3b8a6c3e/)).toBeInTheDocument()
    const box = screen.getByLabelText('专家清单（knowbot-manifest/v1，JSON）')
    fireEvent.change(box, { target: { value: '{not json' } })
    fireEvent.click(screen.getByRole('button', { name: '建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('不是合法的 JSON')
    expect(createDraft).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '{"schema": "knowbot-manifest/v1"}' } })
    fireEvent.click(screen.getByRole('button', { name: '建草稿' }))
    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(REQUEST, { schema: 'knowbot-manifest/v1' }, CSRF),
    )
  })

  it('answers approvals; judgements wait for the user unless we take one with a reason', async () => {
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
      route_reason: null,
      owner_subject: 'user-123',
      draft_id: DRAFT,
      last_error: null,
    }
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'testing', rules_reviewed_by: 'admin-1', run_attempts: 1 }),
    ])
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
        route: 'user' as const,
      },
      {
        ...base,
        question_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        kind: 'ask_before',
        text: '取几年？',
        route: 'operator' as const,
        route_reason: '用例里写了三年',
      },
    ])
    vi.mocked(answerQuestion).mockResolvedValue(true)
    vi.mocked(questionToUser).mockResolvedValue(undefined)
    vi.mocked(questionTake).mockResolvedValue(undefined)
    renderPage()
    expect(await screen.findByText('执行 python calc.py？')).toBeInTheDocument()
    expect(screen.getByText('在用户那里，等用户回答。')).toBeInTheDocument()
    expect(screen.getByText('改由我们答：用例里写了三年')).toBeInTheDocument()
    fireEvent.click(screen.getByText('批准'))
    await waitFor(() =>
      expect(answerQuestion).toHaveBeenCalledWith(
        '5b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        { decision: 'approve' },
        CSRF,
      ),
    )
    // 归用户的：没写理由不能改由我们答
    const takeButton = screen.getByRole('button', { name: '改由我们答' })
    expect(takeButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('为什么这只是跑法问题（一句话）'), {
      target: { value: '只是问输出格式' },
    })
    fireEvent.click(takeButton)
    await waitFor(() =>
      expect(questionTake).toHaveBeenCalledWith(
        '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        '只是问输出格式',
        CSRF,
      ),
    )
    // 改派给我们的：可以转回用户
    fireEvent.click(screen.getByText('转给用户'))
    await waitFor(() =>
      expect(questionToUser).toHaveBeenCalledWith('7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10', CSRF),
    )
  })

  it('lists the ideas with what needs us first, filters them, and shows one idea at a time', async () => {
    const OTHER = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    const OTHER_DRAFT = '4b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    vi.mocked(fetchRequests).mockResolvedValue([
      request({ request_id: OTHER, title: '读我的表回答营收', created_at: '2026-10-18T12:00:00Z' }),
      request(),
    ])
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'testing', rules_reviewed_by: 'admin-1', run_attempts: 1 }),
      draft({
        draft_id: OTHER_DRAFT,
        request_id: OTHER,
        title: '读我的表回答营收',
        status: 'delivered',
        knowbot_id: 'kb-1',
      }),
    ])
    vi.mocked(fetchRequestDetail).mockImplementation(async (id) =>
      detail(id === OTHER ? { request_id: OTHER, title: '读我的表回答营收' } : {}),
    )
    renderPage()
    const list = await screen.findByRole('complementary', { name: '用户的提交' })
    // 测试中的排在已交付的前面，默认看第一个
    const rows = within(list).getAllByRole('button', {
      current: undefined,
      name: /财务分析|读我的表/,
    })
    expect(rows[0]).toHaveTextContent('财务分析与预测')
    expect(
      await screen.findByRole('heading', { level: 2, name: '财务分析与预测' }),
    ).toBeInTheDocument()
    expect(screen.getByText('测试中：隔一阵点「刷新结果」')).toBeInTheDocument()
    // 点另一个：右边换成它，操作和结果都在同一处
    fireEvent.click(within(list).getByText('读我的表回答营收'))
    expect(
      await screen.findByRole('heading', { level: 2, name: '读我的表回答营收' }),
    ).toBeInTheDocument()
    expect(screen.getByText('已交付 knowmart，专家编号 kb-1')).toBeInTheDocument()
    expect(screen.queryByText('刷新结果')).toBeNull()
    // 只看测试中的
    fireEvent.click(within(list).getByRole('button', { name: '测试中 · 1' }))
    expect(within(list).queryByText('读我的表回答营收')).toBeNull()
    expect(within(list).getByText('财务分析与预测')).toBeInTheDocument()
  })

  it('shows how long a test has run and when it was last refreshed', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'testing',
        rules_reviewed_by: 'admin-1',
        run_attempts: 1,
        run_started_at: new Date(Date.now() - 6 * 60_000).toISOString(),
        run_status: 'running',
        run_running_since: new Date(Date.now() - 5 * 60_000).toISOString(),
        report: {
          status: 'running',
          cases: [],
          cost: { spent: '0.000000', currency: 'CNY' },
          finished_at: null,
        },
        progress: {
          case_id: 'c1',
          cases_done: 0,
          cases_total: 3,
          step: 3,
          steps_total: 8,
          step_title: '勾稽',
          attempt: 2,
          spent: '12.4031',
        },
      }),
    ])
    vi.mocked(draftAction).mockResolvedValue(undefined)
    renderPage()
    expect(await screen.findByText(/已跑 5 分钟/)).toBeInTheDocument()
    // 跑到哪、到现在花了多少（待办账 135）；结果里只算跑完用例的「花费 0 元」不显示
    expect(
      screen.getByText(
        '正在跑 c1（第 1/3 条）· 第 3/8 步 勾稽 · 这一步第 2 次 · 到现在花了 12.4 元',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^花费/)).toBeNull()
    expect(screen.getByText(messages.knowbots.testingHint)).toBeInTheDocument()
    fireEvent.click(screen.getByText('刷新结果'))
    expect(await screen.findByText(/上次刷新/)).toBeInTheDocument()
  })

  it('says a test was accepted but not started, and that a case is queued', async () => {
    // 运行方受理了还没开跑：不拿提交时间说「已跑 x 分钟」（账 136 第 ②）
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'testing',
        rules_reviewed_by: 'admin-1',
        run_attempts: 1,
        run_started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        run_status: 'accepted',
        run_running_since: null,
      }),
    ])
    const { unmount } = renderPage()
    expect(await screen.findByText(/^已受理，还没开跑：等测试电脑接手/)).toBeInTheDocument()
    expect(screen.queryByText(/已跑/)).toBeNull()
    unmount()
    // 排在测试账号别的委托后面（0034 §三.3）
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'testing',
        rules_reviewed_by: 'admin-1',
        run_attempts: 1,
        run_status: 'running',
        run_running_since: new Date(Date.now() - 20 * 60_000).toISOString(),
        progress: {
          case_id: 'c1',
          cases_done: 0,
          cases_total: 3,
          step: 0,
          steps_total: 8,
          step_title: '',
          attempt: 0,
          spent: '0',
          queued_behind: '03e447a0-0000-4000-8000-000000000000',
        },
      }),
    ])
    renderPage()
    expect(
      await screen.findByText(
        'c1（第 1/3 条）在排队：排在测试账号前一个委托后面，等它结束 · 到现在花了 0 元',
      ),
    ).toBeInTheDocument()
  })

  it('puts the next draft right under a failed result and keeps earlier drafts in a tab', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'failed', rules_reviewed_by: 'admin-1', last_error: 'timed out' }),
      draft({
        draft_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        revision: 2,
        status: 'pending_test',
      }),
    ])
    renderPage()
    // 第 2 稿最新：现在要核出处，不是建草稿
    expect(await screen.findByText('下一步：逐条核对规则出处')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('tab', { name: /历次草稿 · 2/ }))
    expect(screen.getByText(/第 1 版 · 第 2 稿 · 待测试/)).toBeInTheDocument()
    expect(screen.getByText(/第 1 版 · 第 1 稿 · 测试未通过/)).toBeInTheDocument()
    expect(screen.getByText('timed out')).toBeInTheDocument()
  })

  it('reads the acceptance cases as a table, not raw JSON', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([])
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /验收用例 · 1/ }))
    expect(screen.getByText(/茅台近三年营收？/)).toHaveTextContent('c1 · 茅台近三年营收？')
    expect(screen.getByText('official / official_by_year.2024.revenue')).toBeInTheDocument()
    expect(screen.getByText('170899152276.34')).toBeInTheDocument()
    expect(screen.getByText('0.001')).toBeInTheDocument()
  })
})
