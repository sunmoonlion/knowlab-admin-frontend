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
  decideLight,
  draftAction,
  returnExpert,
  fetchAcceptance,
  fetchCategories,
  fetchDelivery,
  fetchDetail,
  fetchIncubation,
  fetchManifest,
  fetchOutputs,
  fetchQuestions,
  fetchTests,
  handBack,
  reviewDelivery,
  startRerun,
  voidDelivery,
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
  delivery,
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
  decideLight: vi.fn(),
  draftAction: vi.fn(),
  fetchAcceptance: vi.fn(),
  fetchDelivery: vi.fn(),
  fetchDetail: vi.fn(),
  fetchIncubation: vi.fn(),
  fetchManifest: vi.fn(),
  fetchOutputs: vi.fn(),
  fetchQuestions: vi.fn(),
  fetchTests: vi.fn(),
  handBack: vi.fn(),
  questionTake: vi.fn(),
  questionToUser: vi.fn(),
  reviewDelivery: vi.fn(),
  startRerun: vi.fn(),
  retryDelivery: vi.fn(),
  returnExpert: vi.fn(),
  fetchCategories: vi.fn(),
  voidDelivery: vi.fn(),
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
  vi.mocked(fetchManifest).mockResolvedValue({ schema: 'knowbot-manifest/v2' })
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
          kind: 'formal',
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

describe('轻受理（SDD 0046 第四节）', () => {
  it('作者交平台测的：只看那一位准专家与上限；不接要写理由，接了进测试栏', async () => {
    vi.mocked(fetchAcceptance).mockResolvedValue([
      {
        ...BRIEF,
        acceptance_kind: 'light',
        category: 'light_pending',
        draft: draft({ mode: 'self' }),
        grant: {
          grant_id: '33333333-3333-4333-8333-333333333333',
          kind: 'test',
          draft_id: DRAFT,
          state: 'pending',
          budget_limit: '8.50',
          granted_at: '2026-10-29T08:00:00Z',
          expires_at: null,
          decided_at: null,
          reason: null,
          ended_at: null,
          basis: 'platform:knowlab:test:33333333-3333-4333-8333-333333333333',
          decided_by: null,
          ended_by: null,
        },
      },
    ])
    vi.mocked(decideLight).mockResolvedValue({} as never)
    renderWith(<AcceptanceView csrfToken={CSRF} />)
    // 第一条自动打开
    expect(await screen.findByText(k.light.hint)).toBeInTheDocument()
    expect(screen.getByText(/作者设的上限 8.50 元/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: k.light.decline })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: k.light.accept }))
    await waitFor(() =>
      expect(decideLight).toHaveBeenCalledWith(
        '33333333-3333-4333-8333-333333333333',
        { accepted: true },
        CSRF,
      ),
    )
  })
})

describe('孵化', () => {
  it('待孵化：读受理了的版本原文，到工作稿里孵化（不再贴清单），做完交还作者', async () => {
    vi.mocked(fetchIncubation).mockResolvedValue([
      { ...BRIEF, category: 'todo', latest_version: 2, latest_accepted: 2, draft: null },
    ])
    vi.mocked(handBack).mockResolvedValue(undefined)
    renderWith(<IncubationView csrfToken={CSRF} />)
    const pick = await screen.findByLabelText(k.hatch.pick)
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['创意 v1', '创意 v2'])
    expect(screen.getByText('# 第二版方法')).toBeInTheDocument() // 默认最新受理了的
    expect(screen.queryByLabelText(k.manifest)).toBeNull()
    expect(screen.getByRole('link', { name: k.hatch.openEditor })).toHaveAttribute(
      'href',
      `/names/${REQUEST}/workdraft`,
    )
    fireEvent.click(screen.getByRole('button', { name: k.hatch.handBack }))
    fireEvent.click(screen.getByRole('button', { name: k.hatch.handBackYes }))
    await waitFor(() => expect(handBack).toHaveBeenCalledWith(REQUEST, CSRF))
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
    // 费用上限是作者在授权里设的，这里不填（decisions ⑯）
    expect(await screen.findByText(k.startHint)).toBeInTheDocument()
    expect(screen.queryByLabelText(k.budget)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: k.startTest }))
    await waitFor(() =>
      expect(startTest).toHaveBeenCalledWith(
        '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        { timeout_seconds: 1800 },
        CSRF,
      ),
    )
  })

  it('发起时作者没有能测的电脑：说清楚要作者先去 knowbench 接入', async () => {
    vi.mocked(fetchTests).mockResolvedValue([
      {
        ...BRIEF,
        category: 'to_start',
        draft: draft({ blocked: null, rules_reviewed_by: 'admin-1' }),
        test: null,
      },
    ])
    vi.mocked(startTest).mockRejectedValue(
      new ApiClientError(409, {
        code: 'author_has_no_computer',
        message_key: 'errors.requestFailed',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    renderWith(<TestsView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: k.startTest }))
    expect(await screen.findByText(k.errorCodes.author_has_no_computer)).toBeInTheDocument()
  })

  it('发起时作者还没填模型 key：说清楚要作者先去 knowbench 填（SDD 0046 第三节）', async () => {
    vi.mocked(fetchTests).mockResolvedValue([
      {
        ...BRIEF,
        category: 'to_start',
        draft: draft({ blocked: null, rules_reviewed_by: 'admin-1' }),
        test: null,
      },
    ])
    vi.mocked(startTest).mockRejectedValue(
      new ApiClientError(409, {
        code: 'model_key_missing',
        message_key: 'errors.requestFailed',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    renderWith(<TestsView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: k.startTest }))
    expect(await screen.findByText(k.errorCodes.model_key_missing)).toBeInTheDocument()
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
  it('交回；作者提交的公开交付：先发起重跑，重跑过了选类目再通过', async () => {
    vi.mocked(fetchCategories).mockResolvedValue(['finance.securities_advisory', 'tools.lookup'])
    vi.mocked(fetchDelivery).mockResolvedValue([
      deliveryItem(),
      deliveryItem({
        expert_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        version: 3,
        category: 'to_review',
        stage: 'to_review',
        needs_return: false,
        test_mode: 'self',
        user_accepted: true,
        user_decided_by: 'user-123',
        user_decided_at: '2026-10-24T11:00:00Z',
        deliveries: [delivery()],
      }),
    ])
    vi.mocked(fetchDetail).mockResolvedValue(detail({ tests: [testRecord({ status: 'passed' })] }))
    vi.mocked(returnExpert).mockResolvedValue('awaiting_user')
    renderWith(<DeliveryView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: k.delivery.return }))
    await waitFor(() => expect(returnExpert).toHaveBeenCalledWith(EXPERT, CSRF))
    fireEvent.click(screen.getByRole('button', { name: /待审核 · 1/ }))
    // 重跑没过不能通过；公开要选类目
    expect(await screen.findByRole('button', { name: k.delivery.approve })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: k.delivery.startRerun }))
    await waitFor(() =>
      expect(startRerun).toHaveBeenCalledWith('7a8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f11', CSRF),
    )
    expect(screen.getByRole('button', { name: k.delivery.reject })).toBeDisabled()
  })

  it('重跑通过了：选了类目才能通过', async () => {
    vi.mocked(fetchCategories).mockResolvedValue(['tools.lookup'])
    vi.mocked(fetchDelivery).mockResolvedValue([
      deliveryItem({
        category: 'to_review',
        stage: 'to_review',
        needs_return: false,
        deliveries: [
          delivery({
            rerun: {
              test_id: TEST,
              number: 6,
              status: 'passed',
              report: null,
            },
          }),
        ],
      }),
    ])
    vi.mocked(reviewDelivery).mockResolvedValue({ contract_version: 1, ...delivery() })
    renderWith(<DeliveryView csrfToken={CSRF} category="to_review" />)
    const approve = await screen.findByRole('button', { name: k.delivery.approve })
    expect(approve).toBeDisabled()
    await screen.findByRole('option', { name: k.catalog.tools.lookup })
    fireEvent.change(screen.getByLabelText(k.delivery.category), {
      target: { value: 'tools.lookup' },
    })
    fireEvent.click(approve)
    await waitFor(() =>
      expect(reviewDelivery).toHaveBeenCalledWith(
        '7a8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f11',
        { approved: true, reason: '', category: 'tools.lookup' },
        CSRF,
      ),
    )
  })

  it('重跑没通过的不能再发起；审过却交不成的可以作废', async () => {
    vi.mocked(fetchCategories).mockResolvedValue([])
    vi.mocked(fetchDelivery).mockResolvedValue([
      deliveryItem({
        category: 'to_review',
        stage: 'to_review',
        needs_return: false,
        deliveries: [
          delivery({ rerun: { test_id: TEST, number: 6, status: 'failed', report: null } }),
        ],
      }),
      deliveryItem({
        expert_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        version: 3,
        category: 'to_review',
        stage: 'to_deliver',
        needs_return: false,
        deliveries: [
          delivery({
            delivery_id: '6a8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f12',
            status: 'approved',
            delivery_error: 'delivery failed: binding_not_shareable',
          }),
        ],
      }),
    ])
    vi.mocked(voidDelivery).mockResolvedValue({ contract_version: 1, ...delivery() })
    renderWith(<DeliveryView csrfToken={CSRF} category="to_review" />)
    expect(await screen.findByRole('button', { name: k.delivery.reject })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: k.delivery.startRerun })).toBeNull()
    fireEvent.click(screen.getByText(/专家第 3 版/))
    const voidIt = await screen.findByRole('button', { name: k.delivery.void })
    expect(voidIt).toBeDisabled()
    fireEvent.change(screen.getByLabelText(k.delivery.reason), {
      target: { value: '作者改低了许可' },
    })
    fireEvent.click(voidIt)
    await waitFor(() =>
      expect(voidDelivery).toHaveBeenCalledWith(
        '6a8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f12',
        '作者改低了许可',
        CSRF,
      ),
    )
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
