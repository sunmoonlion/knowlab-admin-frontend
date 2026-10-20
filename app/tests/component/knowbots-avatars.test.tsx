import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvatarsView } from '@/components/knowbots/avatars-view'
import { ApiClientError } from '@/lib/api/client'
import {
  answerQuestion,
  createDraft,
  declineAmendment,
  draftAction,
  fetchDrafts,
  fetchManifest,
  fetchOutputs,
  fetchQuestions,
  fetchRequestDetail,
  fetchRequests,
  questionTake,
  questionToUser,
  reviewRules,
  startTest,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import {
  CSRF,
  DRAFT,
  REQUEST,
  detail,
  draft,
  outputs,
  renderWith,
  request,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  answerQuestion: vi.fn(),
  fetchQuestions: vi.fn(),
  questionTake: vi.fn(),
  questionToUser: vi.fn(),
  createDraft: vi.fn(),
  declineAmendment: vi.fn(),
  draftAction: vi.fn(),
  fetchDrafts: vi.fn(),
  fetchManifest: vi.fn(),
  fetchOutputs: vi.fn(),
  fetchRequestDetail: vi.fn(),
  fetchRequests: vi.fn(),
  reviewRules: vi.fn(),
  startTest: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const k = messages.knowbots

function renderPage(props: { picked?: string; hatchFor?: string } = {}) {
  return renderWith(<AvatarsView csrfToken={CSRF} {...props} />)
}

beforeEach(() => {
  for (const fn of [
    createDraft,
    declineAmendment,
    draftAction,
    fetchDrafts,
    fetchManifest,
    fetchOutputs,
    fetchRequestDetail,
    fetchRequests,
    reviewRules,
    startTest,
  ])
    vi.mocked(fn).mockReset()
  vi.mocked(fetchRequests).mockResolvedValue([request()])
  vi.mocked(fetchRequestDetail).mockResolvedValue(detail())
  vi.mocked(fetchManifest).mockResolvedValue({ schema: 'knowbot-manifest/v1' })
  vi.mocked(fetchOutputs).mockResolvedValue(outputs())
  vi.mocked(fetchQuestions).mockReset().mockResolvedValue([])
  vi.mocked(answerQuestion).mockReset()
  vi.mocked(questionToUser).mockReset()
  vi.mocked(questionTake).mockReset()
})

describe('分身', () => {
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
    expect(await screen.findByText(k.noPermission)).toBeInTheDocument()
    expect(screen.queryByText(k.loadFailed)).toBeNull()
  })

  it('一个分身的四段在一页：核对出处，再发起测试', async () => {
    vi.mocked(fetchDrafts).mockResolvedValueOnce([draft()])
    vi.mocked(fetchDrafts).mockResolvedValue([draft({ rules_reviewed_by: 'admin-1' })])
    vi.mocked(reviewRules).mockResolvedValue(undefined)
    vi.mocked(startTest).mockResolvedValue({
      contract_version: 1,
      run_id: 'r',
      run_status: 'accepted',
    })
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 2, name: '分身 1.1 · 财务分析与预测' }),
    ).toBeInTheDocument()
    const progress = screen.getByRole('list', { name: k.progress })
    expect(within(progress).getByText('✓ 孵化')).toBeInTheDocument()
    expect(within(progress).getByText('核对出处')).toHaveAttribute('aria-current', 'step')
    expect(screen.getAllByText(/毛利率口径 — user_text：第 4 问/).length).toBeGreaterThan(0)
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
    expect(screen.getByRole('link', { name: k.toIdea })).toHaveAttribute(
      'href',
      `/ideas?request=${REQUEST}`,
    )
  })

  it('holds the review until every earlier amendment is cited or declined (SDD 0035)', async () => {
    const OPEN = '4b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    const USED = '5b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ amendments_open: [OPEN], amendments_newer: 1 }),
    ])
    vi.mocked(fetchRequestDetail).mockResolvedValue(
      detail({
        amendments: [
          {
            amendment_id: USED,
            text: '第 6 步改成对照管理层讨论',
            created_at: '2026-10-19T00:00:00Z',
            status: 'used',
            used_in_revision: 1,
            declined_reason: null,
            declined_at: null,
            declined_by: null,
          },
          {
            amendment_id: OPEN,
            text: '给出买入建议',
            created_at: '2026-10-19T00:00:00Z',
            status: 'open',
            used_in_revision: null,
            declined_reason: null,
            declined_at: null,
            declined_by: null,
          },
        ],
      }),
    )
    vi.mocked(declineAmendment).mockResolvedValue(undefined)
    renderPage()
    expect(await screen.findByText(k.reviewBlocked)).toBeInTheDocument()
    expect(screen.getByText(`amendment:${OPEN}`)).toBeInTheDocument()
    expect(
      screen.getByText('这个分身孵出后用户又写了 1 条补充，下一个分身处理。'),
    ).toBeInTheDocument()
    expect(screen.getByText('已逐条核对出处')).toBeDisabled()

    fireEvent.click(await screen.findByRole('tab', { name: /补充方法 · 2/ }))
    expect(screen.getByText('已用进第 1 个分身')).toBeInTheDocument()
    expect(screen.getByText(`出处写：amendment:${USED}`)).toBeInTheDocument()
    const decline = screen.getByRole('button', { name: '不照做' })
    expect(decline).toBeDisabled()
    fireEvent.change(screen.getByLabelText('不照做的理由（用户看得到）'), {
      target: { value: '平台不给买卖建议（C-L1）' },
    })
    fireEvent.click(decline)
    await waitFor(() =>
      expect(declineAmendment).toHaveBeenCalledWith(OPEN, '平台不给买卖建议（C-L1）', CSRF),
    )
  })

  it('offers refresh and reset while testing and shows errors', async () => {
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
    expect(await screen.findByRole('alert')).toHaveTextContent(k.adminOnly)
  })

  it('a failed avatar shows why, then each case’s write-up and step outputs (SDD 0037)', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'failed',
        rules_reviewed_by: 'admin-1',
        run_id: 'knowlab-run-0001',
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
    expect(
      within(report).getByText('口径: #0 d!data!营收@2024 says 150 but the data has 100'),
    ).toBeInTheDocument()
    // 成稿排版显示：标题、表格
    const box = await screen.findByRole('region', { name: k.outputs.title })
    expect(await within(box).findByRole('heading', { name: '回答' })).toBeInTheDocument()
    expect(within(box).getByRole('table')).toHaveTextContent('1688')
    expect(fetchOutputs).toHaveBeenCalledWith(DRAFT)
    // 没过的那一步：最后一次交回的原文与没过的验收
    expect(within(box).getByText(/有结论判了支持却没引原文/)).toBeInTheDocument()
    expect(within(box).getByText('{"checks": [{"verdict": "支持"}]}')).toBeInTheDocument()
    expect(within(box).getByText('没走到')).toBeInTheDocument()
    // 孵化下一个：开孵化，创意已选好
    fireEvent.click(screen.getByRole('button', { name: k.hatch.next }))
    expect(
      await screen.findByRole('heading', { level: 2, name: k.hatch.title }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(k.hatch.pick)).toHaveValue(REQUEST)
  })

  it('a finished case not fetched yet can be fetched again; old consent hides outputs', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'failed',
        rules_reviewed_by: 'admin-1',
        run_id: 'r1',
        report: {
          status: 'failed',
          cost: null,
          finished_at: null,
          cases: [
            { case_id: 'c1', status: 'failed', steps: [], expectations: [], note: null },
            { case_id: 'c2', status: 'passed', steps: [], expectations: [], note: null },
          ],
        },
      }),
    ])
    vi.mocked(draftAction).mockResolvedValue(undefined)
    const { unmount } = renderPage()
    expect(await screen.findByText(k.outputs.notYet)).toBeInTheDocument() // c2 还没取到
    fireEvent.click(screen.getByRole('button', { name: k.outputs.fetchAgain }))
    await waitFor(() => expect(draftAction).toHaveBeenCalledWith(DRAFT, 'refresh', CSRF))
    unmount()
    vi.mocked(fetchOutputs).mockResolvedValue(outputs({ consent_needed: true, cases: [] }))
    renderPage()
    expect(await screen.findByText(k.outputs.consentNeeded)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: k.outputs.fetchAgain })).toBeNull()
  })

  it('an operator does not see the decline button (admin only)', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([draft()])
    vi.mocked(fetchRequestDetail).mockResolvedValue(
      detail({
        amendments: [
          {
            amendment_id: '4b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
            text: '第 6 步改成对照管理层讨论',
            created_at: '2026-10-19T00:00:00Z',
            status: 'open',
            used_in_revision: null,
            declined_reason: null,
            declined_at: null,
            declined_by: null,
          },
        ],
      }),
    )
    renderWith(<AvatarsView csrfToken={CSRF} canRelease={false} />)
    fireEvent.click(await screen.findByRole('tab', { name: /补充方法 · 1/ }))
    expect(screen.getByText('第 6 步改成对照管理层讨论')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '不照做' })).toBeNull()
  })

  it('a case without a write-up says why', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'delivered',
        knowbot_id: 'kb-1',
        run_id: 'r1',
        report: {
          status: 'passed',
          cost: null,
          finished_at: null,
          cases: [{ case_id: 'c1', status: 'passed', steps: [], expectations: [], note: null }],
        },
      }),
    ])
    vi.mocked(fetchOutputs).mockResolvedValue(
      outputs({
        cases: [
          {
            case_id: 'c1',
            fetched_at: null,
            note: '这次测试没有取产出：运行方没有这条用例的成稿与交回物',
            outputs: null,
          },
        ],
      }),
    )
    renderPage()
    expect(
      await screen.findByText('这次测试没有取产出：运行方没有这条用例的成稿与交回物'),
    ).toBeInTheDocument()
  })

  it('hatches from an idea: bad JSON is caught, a good manifest becomes the new avatar', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([])
    vi.mocked(createDraft).mockResolvedValue({ contract_version: 1, draft_id: DRAFT, version: '1' })
    renderPage({ hatchFor: REQUEST })
    expect(
      await screen.findByRole('heading', { level: 2, name: k.hatch.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(k.hatch.hint)).toBeInTheDocument()
    // 孵化时右边开着这个创意的方法与数据
    expect(await screen.findByText('# 我的方法')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /用户的数据/ }))
    expect(screen.getByText(/年报\.pdf · .*"dataset_id":"3b8a6c3e/)).toBeInTheDocument()
    const box = screen.getByLabelText('专家清单（knowbot-manifest/v1，JSON）')
    fireEvent.change(box, { target: { value: '{not json' } })
    fireEvent.click(screen.getByRole('button', { name: k.createDraft }))
    expect(await screen.findByRole('alert')).toHaveTextContent('不是合法的 JSON')
    expect(createDraft).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '{"schema": "knowbot-manifest/v1"}' } })
    fireEvent.click(screen.getByRole('button', { name: k.createDraft }))
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
    fireEvent.click(screen.getByText('转给用户'))
    await waitFor(() =>
      expect(questionToUser).toHaveBeenCalledWith('7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10', CSRF),
    )
  })

  it('lists avatars with what needs us first, filters them, and opens the one asked for', async () => {
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
    const list = await screen.findByRole('complementary', { name: k.avatarsTitle })
    const rows = within(list).getAllByRole('button', { name: /分身 1\.1/ })
    expect(rows[0]).toHaveTextContent('财务分析与预测')
    expect(screen.getByText('测试中：隔一阵点「刷新结果」')).toBeInTheDocument()
    fireEvent.click(within(list).getByText('读我的表回答营收'))
    expect(
      await screen.findByRole('heading', { level: 2, name: '分身 1.1 · 读我的表回答营收' }),
    ).toBeInTheDocument()
    expect(screen.getByText('已交付 knowmart，专家编号 kb-1')).toBeInTheDocument()
    expect(screen.queryByText('刷新结果')).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: '测试中 · 1' }))
    expect(within(list).queryByText('读我的表回答营收')).toBeNull()
  })

  it('opens the avatar named in the link', async () => {
    const LATER = '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'failed', rules_reviewed_by: 'admin-1' }),
      draft({ draft_id: LATER, revision: 2 }),
    ])
    renderPage({ picked: DRAFT })
    expect(
      await screen.findByRole('heading', { level: 2, name: '分身 1.1 · 财务分析与预测' }),
    ).toBeInTheDocument()
    // 已有更新的分身：只是历史，不再从这里孵化
    expect(screen.getByText(k.next.superseded)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: k.hatch.next })).toBeNull()
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
    expect(
      screen.getByText(
        '正在跑 c1（第 1/3 条）· 第 3/8 步 勾稽 · 这一步第 2 次 · 到现在花了 12.4 元',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^花费/)).toBeNull()
    expect(screen.getByText(k.testingHint)).toBeInTheDocument()
    fireEvent.click(screen.getByText('刷新结果'))
    expect(await screen.findByText(/上次刷新/)).toBeInTheDocument()
  })

  it('says a test was accepted but not started, and that a case is queued', async () => {
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

  it('keeps the reference in a side panel: history, manifest, cases; collapses and reopens', async () => {
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'failed', rules_reviewed_by: 'admin-1', last_error: 'timed out' }),
      draft({
        draft_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        revision: 2,
        status: 'pending_test',
      }),
    ])
    renderPage()
    expect(await screen.findByText('下一步：逐条核对规则出处')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('tab', { name: /历次分身 · 2/ }))
    expect(screen.getByText(/分身 1\.2 · 待测试/)).toBeInTheDocument()
    expect(screen.getByText(/分身 1\.1 · 测试未通过/)).toBeInTheDocument()
    expect(screen.getByText('timed out')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '清单原文' }))
    expect(await screen.findByText(/"schema": "knowbot-manifest\/v1"/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /验收用例 · 1/ }))
    expect(screen.getByText(/茅台近三年营收？/)).toHaveTextContent('c1 · 茅台近三年营收？')
    expect(screen.getByText('official / official_by_year.2024.revenue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: k.side.collapse }))
    expect(screen.queryByRole('tab', { name: /验收用例/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: k.side.expand }))
    expect(screen.getByRole('tab', { name: /验收用例 · 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const handle = screen.getByRole('separator', { name: k.side.resize })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle).toHaveAttribute('aria-valuenow', '400')
  })
})
