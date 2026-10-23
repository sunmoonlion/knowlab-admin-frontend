import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type {
  AcceptanceItem,
  DeliveryItem,
  Detail,
  Draft,
  Expert,
  Outputs,
  Test,
  Version,
} from '@/contracts/knowbots'
import messages from '@/messages/zh-CN.json'

// 受理、孵化、测试、交付四栏与详情页的测试共用（SDD 0037）：样例数据与渲染。

export const CSRF = 'csrf-token-value-that-is-long-enough-1234'
export const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const DRAFT = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const TEST = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const EXPERT = '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const BRIEF = { request_id: REQUEST, title: '财务分析与预测', owner_subject: 'user-123' }

export function version(overrides: Partial<Version> = {}): Version {
  return {
    version: 1,
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
    consent_version: 2,
    created_at: '2026-10-18T10:00:00Z',
    acceptance: null,
    created_by: 'user-123',
    ...overrides,
  }
}

export function acceptanceItem(overrides: Partial<AcceptanceItem> = {}): AcceptanceItem {
  return { ...BRIEF, category: 'pending', ...version(), ...overrides }
}

export function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    draft_id: DRAFT,
    label: '2.3',
    version: '2',
    revision: 3,
    request_version: 2,
    status: 'pending_test',
    name: '财务分析与预测',
    created_at: '2026-10-24T09:00:00Z',
    user_review: null,
    rule_sources: [{ rule: '毛利率口径', source: 'user_text', ref: '创意 v2 第 4 问' }],
    rules_reviewed_by: null,
    rules_reviewed_at: null,
    requested_by: null,
    blocked: 'rules_not_reviewed',
    ...overrides,
  }
}

export function testRecord(overrides: Partial<Test> = {}): Test {
  return {
    test_id: TEST,
    number: 5,
    draft_id: DRAFT,
    label: '2.3',
    status: 'running',
    started_at: '2026-10-24T09:30:00Z',
    finished_at: null,
    report: null,
    backfilled: false,
    run_id: `knowlab-test-${TEST}`,
    budget_limit: '20',
    timeout_seconds: 1800,
    started_by: 'admin-1',
    error: null,
    progress: null,
    run_status: 'running',
    run_running_since: null,
    run_blocked: null,
    ...overrides,
  }
}

export function expert(overrides: Partial<Expert> = {}): Expert {
  return {
    expert_id: EXPERT,
    version: 2,
    name: '财务分析与预测',
    stage: 'to_return',
    draft_id: DRAFT,
    label: '2.3',
    test_id: TEST,
    test_number: 5,
    created_at: '2026-10-24T10:00:00Z',
    returned_at: null,
    user_accepted: null,
    user_decided_at: null,
    review_approved: null,
    review_listing: null,
    review_reason: null,
    reviewed_at: null,
    listed_at: null,
    knowbot_id: null,
    listing_status: null,
    stopped_at: null,
    stop_reason: null,
    trial: false,
    returned_by: null,
    user_decided_by: null,
    reviewed_by: null,
    stopped_by: null,
    digest: null,
    delivery_error: null,
    ...overrides,
  }
}

export function deliveryItem(overrides: Partial<DeliveryItem> = {}): DeliveryItem {
  return { ...BRIEF, category: 'to_return', ...expert(), ...overrides }
}

export function detail(overrides: Partial<Detail> = {}): Detail {
  return {
    contract_version: 1,
    ...BRIEF,
    runtime: 'knowbench',
    created_at: '2026-10-18T10:00:00Z',
    latest_version: 2,
    summary: {
      version: 2,
      acceptance: 'accepted',
      draft: '2.3',
      test: { number: 5, status: 'passed' },
      expert: { version: 2, stage: 'to_return' },
    },
    consent_version: 2,
    consent_current: 2,
    versions: [
      version({
        acceptance: {
          accepted: true,
          reason: null,
          decided_at: '2026-10-18T11:00:00Z',
          trial: true,
          checks: {},
          decided_by: 'system:trial',
        },
      }),
      version({
        version: 2,
        idea: { kind: 'skill', skill: '# 第二版方法' },
        acceptance: {
          accepted: true,
          reason: null,
          decided_at: '2026-10-24T08:00:00Z',
          trial: false,
          checks: { 'C-L5': { ok: true, note: '' } },
          decided_by: 'admin-1',
        },
      }),
    ],
    drafts: [draft()],
    tests: [],
    experts: [],
    timeline: [],
    amendments: [],
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
    answered: [],
    ...overrides,
  }
}

export function outputs(overrides: Partial<Outputs> = {}): Outputs {
  return {
    contract_version: 1,
    test_id: TEST,
    run_id: `knowlab-test-${TEST}`,
    consent_needed: false,
    cases: [
      {
        case_id: 'c1',
        fetched_at: '2026-10-19T08:00:00Z',
        note: null,
        outputs: {
          contract: 'knowbot-test-run/v1',
          run_id: `knowlab-test-${TEST}`,
          case_id: 'c1',
          deliverable: {
            path: '底稿/财务分析与预测-成稿.md',
            text: '# 回答\n\n营业收入 2025 年下降。',
            truncated: false,
            step_id: 'official',
          },
          deliverable_note: null,
          steps: [
            {
              step_id: 'scope',
              title: '定范围',
              outcome: 'accepted',
              artifact: { company: '贵州茅台' },
              checks: [{ label: '交回的格式对', passed: true, message: '' }],
            },
            {
              step_id: 'official',
              title: '对照官方披露',
              outcome: 'accepted',
              checks: [],
            },
          ],
          error: null,
        },
      },
    ],
    ...overrides,
  }
}

export function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages} timeZone="Asia/Shanghai">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

/** next-intl 的 Link 在测试里换成普通链接：href 照拼。 */
export function linkMock() {
  return {
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string | { pathname: string; query?: Record<string, string> }
      children: React.ReactNode
    }) => (
      <a
        href={
          typeof href === 'string'
            ? href
            : `${href.pathname}?${new URLSearchParams(href.query ?? {}).toString()}`
        }
        {...rest}
      >
        {children}
      </a>
    ),
  }
}
