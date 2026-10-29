import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OperatorWorkdraft } from '@/components/knowbots/operator-workdraft'
import type { Workdraft } from '@/contracts/workdraft'
import {
  fetchOperatorRounds,
  fetchOperatorWorkdraft,
  previewOperator,
  propose,
  publishOperator,
  withdrawProposal,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import { CSRF, REQUEST, renderWith } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  fetchOperatorWorkdraft: vi.fn(),
  fetchOperatorRounds: vi.fn(),
  previewOperator: vi.fn(),
  propose: vi.fn(),
  publishOperator: vi.fn(),
  startOperatorRound: vi.fn(),
  withdrawProposal: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const m = messages.operatorWorkdraft
const w = messages.workdraft
const PROPOSAL = '44444444-4444-4444-8444-444444444444'

function workdraft(over: Partial<Workdraft> = {}): Workdraft {
  return {
    contract_version: 1,
    request_id: REQUEST,
    title: '财务分析与预测',
    revision: 2,
    body: {
      name: '财务分析',
      tagline: '',
      scope: { does: '', does_not: '', elsewhere: '' },
      data_picks: [],
      steps: [],
    },
    sources: {},
    origins: {},
    updated_at: null,
    proposals: [
      {
        proposal_id: PROPOSAL,
        path: 'tagline',
        op: 'set',
        value: '看清走势',
        reason: '一句话说清',
        state: 'pending',
        proposed_at: '2026-10-29T08:00:00Z',
        decided_at: null,
        proposed_by: 'admin-1',
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchOperatorWorkdraft).mockResolvedValue(workdraft())
  vi.mocked(fetchOperatorRounds).mockResolvedValue([])
  vi.mocked(previewOperator).mockResolvedValue({
    contract_version: 1,
    version: '1',
    manifest: {},
    problems: [],
  })
})

describe('平台孵化的工作稿（专家孵化方案第十二节）', () => {
  it('改了格子写理由提交为提议；没提交的改动不能出一版', async () => {
    vi.mocked(propose).mockResolvedValue(workdraft())
    renderWith(<OperatorWorkdraft requestId={REQUEST} csrfToken={CSRF} />)
    const name = await screen.findByLabelText(w.expert.name)
    fireEvent.change(name, { target: { value: '财务分析与预测' } })
    expect(screen.getByRole('button', { name: m.publish.submit })).toBeDisabled()
    const send = screen.getByRole('button', { name: m.send.submit })
    expect(send).toBeDisabled() // 还没写理由
    fireEvent.change(screen.getByLabelText(m.send.reason), { target: { value: '名字说全' } })
    fireEvent.click(send)
    await waitFor(() =>
      expect(propose).toHaveBeenCalledWith(
        REQUEST,
        [{ path: 'name', op: 'set', value: '财务分析与预测', reason: '名字说全' }],
        CSRF,
      ),
    )
  })

  it('等作者处理的提议可以收回；格子都有出处就能出一版', async () => {
    vi.mocked(withdrawProposal).mockResolvedValue(workdraft({ proposals: [] }))
    vi.mocked(publishOperator).mockResolvedValue({
      contract_version: 1,
      draft_id: '55555555-5555-4555-8555-555555555555',
      version: '1',
      revision: 1,
      request_version: 1,
      mode: 'platform',
    })
    renderWith(<OperatorWorkdraft requestId={REQUEST} csrfToken={CSRF} />)
    expect(await screen.findByText(/一句话说清/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: m.pending.withdraw }))
    await waitFor(() => expect(withdrawProposal).toHaveBeenCalledWith(REQUEST, PROPOSAL, CSRF))
    fireEvent.click(screen.getByRole('button', { name: m.publish.submit }))
    await waitFor(() => expect(publishOperator).toHaveBeenCalledWith(REQUEST, CSRF))
  })
})
