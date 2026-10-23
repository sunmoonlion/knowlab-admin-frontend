import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AcceptanceView } from '@/components/knowbots/acceptance-view'
import { DeliveryView } from '@/components/knowbots/delivery-view'
import { IncubationView } from '@/components/knowbots/incubation-view'
import { NameView } from '@/components/knowbots/name-view'
import { TestsView } from '@/components/knowbots/tests-view'
import { ApiClientError } from '@/lib/api/client'
import {
  accept,
  createDraft,
  draftAction,
  expertAction,
  fetchAcceptance,
  fetchDelivery,
  fetchDetail,
  fetchIncubation,
  fetchManifest,
  fetchOutputs,
  fetchQuestions,
  fetchTests,
  reviewExpert,
  startTest,
  stopExpert,
  testAction,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import {
  CSRF,
  DRAFT,
  EXPERT,
  REQUEST,
  TEST,
  acceptanceItem,
  deliveryItem,
  detail,
  draft,
  outputs,
  renderWith,
  testRecord,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  accept: vi.fn(),
  answerQuestion: vi.fn(),
  createDraft: vi.fn(),
  draftAction: vi.fn(),
  expertAction: vi.fn(),
  fetchAcceptance: vi.fn(),
  fetchDelivery: vi.fn(),
  fetchDetail: vi.fn(),
  fetchIncubation: vi.fn(),
  fetchManifest: vi.fn(),
  fetchOutputs: vi.fn(),
  fetchQuestions: vi.fn(),
  fetchTests: vi.fn(),
  questionTake: vi.fn(),
  questionToUser: vi.fn(),
  reviewExpert: vi.fn(),
  startTest: vi.fn(),
  stopExpert: vi.fn(),
  testAction: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const k = messages.knowbots
const BRIEF = { request_id: REQUEST, title: '财务分析与预测', owner_subject: 'user-123' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchDetail).mockResolvedValue(detail())
  vi.mocked(fetchManifest).mockResolvedValue({ schema: 'knowbot-manifest/v1' })
  vi.mocked(fetchOutputs).mockResolvedValue(outputs())
  vi.mocked(fetchQuestions).mockResolvedValue([])
})

describe('受理', () => {
  it('没有管理权限时说清楚要换账号，不说「刷新再试」（账 134）', async () => {
    vi.mocked(fetchAcceptance).mockRejectedValue(
      new ApiClientError(403, {
        code: 'forbidden',
        message_key: 'errors.forbidden',
        retryable: false,
        correlation_id: 'c-1',
      }),
    )
    renderWith(<AcceptanceView csrfToken={CSRF} />)
    expect(await screen.findByText(k.noPermission)).toBeInTheDocument()
    expect(screen.queryByText(k.loadFailed)).toBeNull()
  })

  it('三样都勾了才能受理；不受理要写理由；输入在中间、受理单在右边', async () => {
    vi.mocked(fetchAcceptance).mockResolvedValue([acceptanceItem()])
    vi.mocked(accept).mockResolvedValue(undefined)
    renderWith(<AcceptanceView csrfToken={CSRF} />)
    expect(
      await screen.findByRole('heading', { level: 2, name: '财务分析与预测 · 创意 v1' }),
    ).toBeInTheDocument()
    expect(screen.getByText('# 我的方法')).toBeInTheDocument() // 输入：这一版创意原文
    expect(screen.getAllByText(k.acceptance.none).length).toBeGreaterThan(0) // 右边：还没有输出
    const acceptButton = screen.getByRole('button', { name: k.acceptance.accept })
    const rejectButton = screen.getByRole('button', { name: k.acceptance.reject })
    expect(acceptButton).toBeDisabled()
    expect(rejectButton).toBeDisabled()
    for (const code of ['C-L5', 'C-L2', 'C-L1'] as const)
      fireEvent.click(screen.getByLabelText(k.acceptance.check[code]))
    expect(acceptButton).toBeEnabled()
    fireEvent.click(acceptButton)
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith(
        REQUEST,
        1,
        {
          checks: {
            'C-L5': { ok: true, note: '' },
            'C-L2': { ok: true, note: '' },
            'C-L1': { ok: true, note: '' },
          },
          accepted: true,
          reason: '',
        },
        CSRF,
      ),
    )
    fireEvent.change(screen.getByLabelText(k.acceptance.reason), {
      target: { value: '投资建议类不做' },
    })
    expect(rejectButton).toBeEnabled()
    expect(screen.getByRole('link', { name: k.toName })).toHaveAttribute(
      'href',
      `/names/${REQUEST}`,
    )
  })

  it('从详情页点进来，落在那一条所在的大类', async () => {
    vi.mocked(fetchAcceptance).mockResolvedValue([
      acceptanceItem({ version: 2 }),
      acceptanceItem({
        category: 'accepted',
        acceptance: {
          accepted: true,
          reason: null,
          decided_at: '2026-10-18T11:00:00Z',
          trial: true,
          checks: { 'C-L5': { ok: true, note: '试行期自动受理' } },
          decided_by: 'system:trial',
        },
      }),
    ])
    renderWith(<AcceptanceView csrfToken={CSRF} picked={`${REQUEST}:1`} />)
    expect(
      await screen.findByRole('heading', { level: 2, name: '财务分析与预测 · 创意 v1' }),
    ).toBeInTheDocument()
    expect(screen.getByText(k.acceptance.done)).toBeInTheDocument()
    expect(screen.getAllByText(/试行期自动受理/).length).toBeGreaterThan(0)
  })
})

describe('孵化', () => {
  it('待孵化：只能选受理了的版本，读原文，贴清单孵出', async () => {
    vi.mocked(fetchIncubation).mockResolvedValue([
      { ...BRIEF, category: 'todo', latest_version: 2, latest_accepted: 2, draft: null },
    ])
    vi.mocked(createDraft).mockResolvedValue({
      contract_version: 1,
      draft_id: DRAFT,
      version: '2',
      revision: 3,
      request_version: 2,
    })
    renderWith(<IncubationView csrfToken={CSRF} />)
    const pick = await screen.findByLabelText(k.hatch.pick)
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['创意 v1', '创意 v2'])
    expect(screen.getByText('# 第二版方法')).toBeInTheDocument() // 默认最新受理了的
    fireEvent.change(screen.getByLabelText(k.manifest), { target: { value: '{"schema": 1}' } })
    fireEvent.click(screen.getByRole('button', { name: k.createDraft }))
    await waitFor(() => expect(createDraft).toHaveBeenCalledWith(REQUEST, { schema: 1 }, 2, CSRF))
  })

  it('准专家：请用户审核、核出处；规则出处与清单在右边', async () => {
    vi.mocked(fetchIncubation).mockResolvedValue([
      { ...BRIEF, category: 'done', latest_version: 2, latest_accepted: 2, draft: draft() },
    ])
    vi.mocked(draftAction).mockResolvedValue(undefined)
    renderWith(<IncubationView csrfToken={CSRF} category="done" />)
    fireEvent.click(await screen.findByRole('button', { name: k.incubation.askUser }))
    await waitFor(() => expect(draftAction).toHaveBeenCalledWith(DRAFT, 'review-request', CSRF))
    fireEvent.click(screen.getByRole('button', { name: k.review }))
    await waitFor(() => expect(draftAction).toHaveBeenCalledWith(DRAFT, 'rules-review', CSRF))
    expect(screen.getAllByText(/毛利率口径 — user_text：创意 v2 第 4 问/).length).toBeGreaterThan(0)
  })

  it('用户说不行的：写出意见，不再给核出处', async () => {
    vi.mocked(fetchIncubation).mockResolvedValue([
      {
        ...BRIEF,
        category: 'done',
        latest_version: 2,
        latest_accepted: 2,
        draft: draft({
          user_review: {
            state: 'not_ok',
            note: '第二步口径不对',
            requested_at: '2026-10-24T09:00:00Z',
            answered_at: '2026-10-24T09:10:00Z',
          },
        }),
      },
    ])
    renderWith(<IncubationView csrfToken={CSRF} picked={DRAFT} />)
    expect(await screen.findByText(/用户说不行：第二步口径不对/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: k.review })).toBeNull()
  })
})

describe('测试', () => {
  it('待发起：差什么照说，按钮不让点；核过的能发起', async () => {
    vi.mocked(fetchTests).mockResolvedValue([
      { ...BRIEF, category: 'to_start', draft: draft(), test: null },
      {
        ...BRIEF,
        category: 'to_start',
        draft: draft({
          draft_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
          label: '2.4',
          revision: 4,
          blocked: null,
          rules_reviewed_by: 'admin-1',
        }),
        test: null,
      },
    ])
    vi.mocked(startTest).mockResolvedValue(testRecord())
    renderWith(<TestsView csrfToken={CSRF} />)
    expect(await screen.findByText(k.blocked.rules_not_reviewed)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: k.startTest })).toBeDisabled()
    fireEvent.click(screen.getByText('准专家 2.4'))
    fireEvent.change(await screen.findByLabelText(k.budget), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: k.startTest }))
    await waitFor(() =>
      expect(startTest).toHaveBeenCalledWith(
        '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        { budget_limit: '30', timeout_seconds: 1800 },
        CSRF,
      ),
    )
  })

  it('在跑的：进度、刷新、判定卡住', async () => {
    vi.mocked(fetchTests).mockResolvedValue([
      {
        ...BRIEF,
        category: 'running',
        draft: null,
        test: testRecord({
          progress: {
            case_id: 'c1',
            cases_done: 0,
            cases_total: 2,
            step: 2,
            steps_total: 4,
            step_title: '对照官方披露',
            attempt: 1,
            spent: '0.12',
            queued_behind: null,
          },
        }),
      },
    ])
    vi.mocked(testAction).mockResolvedValue(undefined)
    renderWith(<TestsView csrfToken={CSRF} category="running" />)
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: '测试 5（准专家 2.3） · 财务分析与预测',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(k.progressNow)).toHaveTextContent(/正在跑 c1（第 1\/2 条）/)
    fireEvent.click(screen.getByRole('button', { name: k.refresh }))
    await waitFor(() => expect(testAction).toHaveBeenCalledWith(TEST, 'refresh', CSRF))
    fireEvent.click(screen.getByRole('button', { name: k.reset }))
    await waitFor(() => expect(testAction).toHaveBeenCalledWith(TEST, 'reset', CSRF))
  })

  it('结束了的：结果与成稿在右边，成稿写第几步「步名」写的（账 142）', async () => {
    vi.mocked(fetchTests).mockResolvedValue([
      {
        ...BRIEF,
        category: 'finished',
        draft: null,
        test: testRecord({
          status: 'passed',
          finished_at: '2026-10-24T10:00:00Z',
          report: {
            status: 'passed',
            cases: [
              {
                case_id: 'c1',
                status: 'passed',
                steps: [],
                expectations: [true],
                note: null,
              },
            ],
            cost: { spent: '1.20', currency: 'CNY' },
            finished_at: '2026-10-24T10:00:00Z',
          },
        }),
      },
    ])
    renderWith(<TestsView csrfToken={CSRF} category="finished" />)
    expect(await screen.findByText(k.tests.ended.passed)).toBeInTheDocument()
    expect(await screen.findByText(/第 2 步「对照官方披露」写的/)).toBeInTheDocument()
    expect(fetchOutputs).toHaveBeenCalledWith(TEST)
  })
})

describe('交付', () => {
  it('交回、用户同意后运营审核（申请公开）', async () => {
    vi.mocked(fetchDelivery).mockResolvedValue([
      deliveryItem(),
      deliveryItem({
        expert_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        version: 3,
        category: 'to_review',
        stage: 'to_review',
        returned_at: '2026-10-24T10:00:00Z',
        user_accepted: true,
        user_decided_by: 'user-123',
        user_decided_at: '2026-10-24T11:00:00Z',
      }),
    ])
    vi.mocked(fetchDetail).mockResolvedValue(detail({ tests: [testRecord({ status: 'passed' })] }))
    vi.mocked(expertAction).mockResolvedValue('awaiting_user')
    vi.mocked(reviewExpert).mockResolvedValue({
      contract_version: 1,
      expert_id: EXPERT,
      stage: 'listed',
    })
    renderWith(<DeliveryView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: k.delivery.return }))
    await waitFor(() => expect(expertAction).toHaveBeenCalledWith(EXPERT, 'return', CSRF))
    fireEvent.click(screen.getByRole('button', { name: /待运营审核 · 1/ }))
    fireEvent.click(await screen.findByRole('button', { name: k.delivery.approvePublic }))
    await waitFor(() =>
      expect(reviewExpert).toHaveBeenCalledWith(
        '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        { approved: true, listing: 'public', reason: '' },
        CSRF,
      ),
    )
    expect(screen.getByRole('button', { name: k.delivery.reject })).toBeDisabled()
  })

  it('全部专家里有试行期上架的：两道门之前交付；停用要写理由', async () => {
    vi.mocked(fetchDelivery).mockResolvedValue([
      deliveryItem({
        version: 1,
        category: 'listed',
        stage: 'listed',
        trial: true,
        returned_at: '2026-10-20T08:00:00Z',
        listed_at: '2026-10-20T08:01:00Z',
        knowbot_id: '084acc72',
        reviewed_at: '2026-10-25T08:00:00Z',
        review_approved: true,
        review_listing: 'self',
        reviewed_by: 'admin-1',
      }),
    ])
    vi.mocked(stopExpert).mockResolvedValue('stopped')
    renderWith(<DeliveryView csrfToken={CSRF} category="all" />)
    expect((await screen.findAllByText(k.trialGates)).length).toBeGreaterThan(0)
    const stop = screen.getByRole('button', { name: k.delivery.stop })
    expect(stop).toBeDisabled()
    fireEvent.change(screen.getByLabelText(k.delivery.stopReason), {
      target: { value: '第 2 版上架了' },
    })
    fireEvent.click(stop)
    await waitFor(() => expect(stopExpert).toHaveBeenCalledWith(EXPERT, '第 2 版上架了', CSRF))
  })
})

describe('详情页', () => {
  it('顶上一行摘要，下面按时间排的记录，点了去那一栏那一条', async () => {
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({
        timeline: [
          { at: '2026-10-18T10:00:00Z', kind: 'version', by: 'user-123', version: 1 },
          {
            at: '2026-10-24T09:30:00Z',
            kind: 'test_started',
            by: 'admin-1',
            test_id: TEST,
            number: 5,
            label: '2.3',
          },
          {
            at: '2026-10-24T10:00:00Z',
            kind: 'expert',
            by: null,
            expert_id: EXPERT,
            version: 2,
            test_number: 5,
            label: '2.3',
            trial: false,
          },
        ],
        tests: [testRecord({ backfilled: true })],
      }),
    )
    renderWith(<NameView requestId={REQUEST} />)
    expect(await screen.findByLabelText(k.name.summary)).toHaveTextContent(
      '创意 v2 · 受理了 · 准专家 2.3 · 测试 5 通过 · 专家第 2 版 · 待交回',
    )
    expect(screen.getByRole('link', { name: '申请：出创意 v1' })).toHaveAttribute(
      'href',
      `/acceptance?item=${encodeURIComponent(`${REQUEST}:1`)}`,
    )
    expect(screen.getByRole('link', { name: '测试：准专家 2.3 → 测试 5' })).toHaveAttribute(
      'href',
      `/tests?item=${TEST}`,
    )
    expect(screen.getByRole('link', { name: '测试：测试 5 通过 → 专家第 2 版' })).toHaveAttribute(
      'href',
      `/delivery?item=${EXPERT}`,
    )
    expect(screen.getByText(k.tests.backfilled)).toBeInTheDocument()
  })
})
