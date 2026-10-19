import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { AdminDraft, AdminRequest, Outputs, RequestDetail } from '@/contracts/knowbots'
import messages from '@/messages/zh-CN.json'

// 创意、分身、专家三页的测试共用（SDD 0037）：样例数据与渲染。

export const CSRF = 'csrf-token-value-that-is-long-enough-1234'
export const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const DRAFT = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

export function draft(overrides: Partial<AdminDraft> = {}): AdminDraft {
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

export function request(overrides: Partial<AdminRequest> = {}): AdminRequest {
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

export function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
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

export function outputs(overrides: Partial<Outputs> = {}): Outputs {
  return {
    contract_version: 1,
    draft_id: DRAFT,
    run_id: 'knowlab-run-0001',
    cases: [
      {
        case_id: 'c1',
        fetched_at: '2026-10-19T08:00:00Z',
        note: null,
        outputs: {
          contract: 'knowbot-test-run/v1',
          run_id: 'knowlab-run-0001',
          case_id: 'c1',
          deliverable: {
            path: '底稿/财务分析与预测-成稿.md',
            text: '# 回答\n\n营业收入 2025 年下降。\n\n| 年 | 营业收入 |\n| --- | --- |\n| 2025 | 1688 |',
            truncated: false,
          },
          deliverable_note: null,
          steps: [
            {
              step_id: 'scope',
              title: '定范围',
              outcome: 'accepted',
              artifact: { company: '贵州茅台', in_data: true },
              checks: [{ label: '交回的格式对', passed: true, message: '' }],
            },
            {
              step_id: 'official',
              title: '对照官方披露',
              outcome: 'rejected',
              artifact: null,
              returned_raw: '{"checks": [{"verdict": "支持"}]}',
              checks: [
                {
                  label: '判支持的引了原文，引文在年报那一页',
                  passed: false,
                  message: '有结论判了支持却没引原文',
                },
              ],
            },
            { step_id: 'forecast', title: '预测', outcome: 'not_reached', checks: [] },
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
