import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpertsView } from '@/components/knowbots/experts-view'
import { IdeasView } from '@/components/knowbots/ideas-view'
import { KnowbotTodo } from '@/components/knowbots/todo'
import {
  declineAmendment,
  draftAction,
  fetchDrafts,
  fetchQuestions,
  fetchRequestDetail,
  fetchRequests,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import { CSRF, DRAFT, REQUEST, detail, draft, renderWith, request } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  declineAmendment: vi.fn(),
  draftAction: vi.fn(),
  fetchDrafts: vi.fn(),
  fetchQuestions: vi.fn(),
  fetchRequestDetail: vi.fn(),
  fetchRequests: vi.fn(),
  fetchManifest: vi.fn(),
  fetchOutputs: vi.fn(),
  answerQuestion: vi.fn(),
  questionTake: vi.fn(),
  questionToUser: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const k = messages.knowbots
const OTHER = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const OPEN = '4b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

beforeEach(() => {
  for (const fn of [declineAmendment, draftAction, fetchDrafts, fetchRequestDetail, fetchRequests])
    vi.mocked(fn).mockReset()
  vi.mocked(fetchQuestions).mockReset().mockResolvedValue([])
  vi.mocked(fetchRequestDetail).mockResolvedValue(detail())
})

describe('创意', () => {
  it('puts ideas that need us first, handles amendments here, and links to hatching', async () => {
    const amendment = {
      amendment_id: OPEN,
      text: '第 6 步改成对照管理层讨论',
      created_at: '2026-10-19T00:00:00Z',
      status: 'open' as const,
      used_in_revision: null,
      declined_reason: null,
      declined_at: null,
      declined_by: null,
    }
    vi.mocked(fetchRequests).mockResolvedValue([
      request({ request_id: OTHER, title: '读我的表回答营收', created_at: '2026-10-18T12:00:00Z' }),
      request({ amendments: [amendment] }),
    ])
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({ status: 'failed', rules_reviewed_by: 'admin-1' }),
      draft({
        draft_id: '9b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        request_id: OTHER,
        title: '读我的表回答营收',
        status: 'delivered',
        knowbot_id: 'kb-1',
      }),
    ])
    vi.mocked(fetchRequestDetail).mockResolvedValue(detail({ amendments: [amendment] }))
    vi.mocked(declineAmendment).mockResolvedValue(undefined)
    renderWith(<IdeasView csrfToken={CSRF} />)
    // 页面顶上的选择框：要我们动手的在前，默认选它
    const box = await screen.findByRole('button', { name: k.requestsTitle })
    expect(box).toHaveTextContent('财务分析与预测')
    fireEvent.click(box)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('财务分析与预测')
    expect(options[0]).toHaveTextContent(k.ideaStage.amend)
    expect(options[1]).toHaveTextContent(k.ideaStage.expert)
    fireEvent.keyDown(screen.getByRole('searchbox', { name: k.picker.search }), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(
      await screen.findByRole('heading', { level: 2, name: '财务分析与预测' }),
    ).toBeInTheDocument()
    expect(screen.getByText(k.ideaNext.amend)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: k.hatch.forIdea })).toHaveAttribute(
      'href',
      `/avatars?hatch=${REQUEST}`,
    )
    // 它的分身：点了去分身页那一个
    expect(screen.getByRole('link', { name: '分身 1.1' })).toHaveAttribute(
      'href',
      `/avatars?draft=${DRAFT}`,
    )
    // 补充在主栏处理
    expect(await screen.findByText('第 6 步改成对照管理层讨论')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('不照做的理由（用户看得到）'), {
      target: { value: '下一版再说' },
    })
    fireEvent.click(screen.getByRole('button', { name: '不照做' }))
    await waitFor(() => expect(declineAmendment).toHaveBeenCalledWith(OPEN, '下一版再说', CSRF))
    // 方法原文在右边
    expect(screen.getByText('# 我的方法')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: k.requestsTitle }))
    fireEvent.change(screen.getByRole('searchbox', { name: k.picker.search }), {
      target: { value: '读我' },
    })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /读我的表回答营收/ }))
    expect(
      await screen.findByRole('heading', { level: 2, name: '读我的表回答营收' }),
    ).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('request')).toBe(OTHER)
  })

  it('opens the idea named in the link', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([
      request(),
      request({ request_id: OTHER, title: '读我的表回答营收' }),
    ])
    vi.mocked(fetchDrafts).mockResolvedValue([])
    renderWith(<IdeasView csrfToken={CSRF} picked={OTHER} />)
    expect(
      await screen.findByRole('heading', { level: 2, name: '读我的表回答营收' }),
    ).toBeInTheDocument()
    expect(screen.getByText(k.ideaNext.hatch)).toBeInTheDocument()
  })
})

describe('专家', () => {
  it('shows failed deliveries first with a retry, and delivered versions with their ids', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([request()])
    vi.mocked(fetchDrafts).mockResolvedValue([
      draft({
        status: 'delivered',
        knowbot_id: 'kb-1',
        delivered_at: '2026-10-19T08:00:00Z',
      }),
      draft({
        draft_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        version: '2',
        status: 'passed',
        last_error: 'delivery failed: knowmart_unavailable',
      }),
    ])
    vi.mocked(draftAction).mockResolvedValue(undefined)
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByText(k.experts.deliveryFailed)).toBeInTheDocument()
    expect(screen.getByText('delivery failed: knowmart_unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: k.deliver }))
    await waitFor(() =>
      expect(draftAction).toHaveBeenCalledWith(
        '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        'deliver',
        CSRF,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: k.experts.title }))
    fireEvent.click(screen.getByRole('option', { name: /第 1 版/ }))
    expect(await screen.findByText('第 1 版 · knowmart 编号 kb-1')).toBeInTheDocument()
    expect(screen.getByText(/交付于/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '出自 分身 1.1' })).toHaveAttribute(
      'href',
      `/avatars?draft=${DRAFT}`,
    )
  })

  it('says when there is no expert yet', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([request()])
    vi.mocked(fetchDrafts).mockResolvedValue([draft()])
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByText(k.experts.none)).toBeInTheDocument()
  })
})

describe('要我们动手', () => {
  it('counts each column and hides itself without access', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([
      request(),
      request({ request_id: OTHER, title: '读我的表回答营收' }),
    ])
    vi.mocked(fetchDrafts).mockResolvedValue([draft()])
    const { unmount } = renderWith(<KnowbotTodo />)
    const block = await screen.findByRole('region', { name: k.todo.title })
    // 一个创意还没有分身（等孵化），一个分身待核出处
    expect(within(block).getByRole('link', { name: '创意 · 1' })).toHaveAttribute('href', '/ideas')
    expect(within(block).getByRole('link', { name: '分身 · 1' })).toHaveAttribute(
      'href',
      '/avatars',
    )
    expect(within(block).getByRole('link', { name: '专家 · 0' })).toHaveAttribute(
      'href',
      '/experts',
    )
    unmount()
    vi.mocked(fetchRequests).mockRejectedValue(new Error('403'))
    renderWith(<KnowbotTodo />)
    await waitFor(() => expect(fetchRequests).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: k.todo.title })).toBeNull()
  })
})
