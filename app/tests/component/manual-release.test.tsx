import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ManualReleaseQueue } from '@/components/knowbots/manual-release'
import {
  fetchManualReleases,
  fetchManualRelease,
  decideManualRelease,
} from '@/lib/knowbots/manual-release'
import messages from '@/messages/zh-CN.json'
import { CSRF, DRAFT, TEST, REQUEST, EXPERT, renderWith } from './knowbot-fixtures'
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())
vi.mock('@/lib/knowbots/manual-release', () => ({
  fetchManualReleases: vi.fn(),
  fetchManualRelease: vi.fn(),
  decideManualRelease: vi.fn(),
}))
const t = messages.knowbots.manualRelease
const record = {
  id: EXPERT,
  request_id: REQUEST,
  draft_id: DRAFT,
  owner_subject: 'author',
  manifest_sha256: 'a'.repeat(64),
  baseline_test_id: TEST,
  reason: '修复后申请特批',
  evidence: {
    change_summary: '修正余额衔接',
    verification: '离线验证',
    limitations: '本修订未复测',
  },
  requested_at: '2026-11-03T12:00:00Z',
  status: 'pending' as const,
  decided_at: null,
  decided_by: null,
  decision_reason: null,
  expert_id: null,
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchManualReleases).mockResolvedValue([record])
  vi.mocked(fetchManualRelease).mockResolvedValue({
    request: record,
    manifest: { name: '财务分析与预测', version: '3' },
  })
})
it('requires explicit review of the exact revision before approval', async () => {
  renderWith(<ManualReleaseQueue csrfToken={CSRF} />)
  fireEvent.click(screen.getByText(t.queue))
  fireEvent.click(await screen.findByRole('button', { name: /修复后申请特批/ }))
  await screen.findByText(t.notice)
  expect(screen.getByRole('button', { name: t.agree })).toBeDisabled()
  expect(screen.getByText('a'.repeat(64))).toBeVisible()
  fireEvent.change(screen.getByLabelText(t.decision), {
    target: { value: '核对修订与离线证据后批准' },
  })
  fireEvent.click(screen.getByLabelText(t.reviewAck))
  fireEvent.click(screen.getByRole('button', { name: t.agree }))
  await waitFor(() =>
    expect(decideManualRelease).toHaveBeenCalledWith(
      EXPERT,
      true,
      '核对修订与离线证据后批准',
      CSRF,
    ),
  )
})
