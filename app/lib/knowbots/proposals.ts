import type { ProposalIn, WorkdraftBody } from '@/contracts/workdraft'

import { same } from './workdraft'

// 平台人员在编辑器里改完，把「改了哪些格子」算成提议（专家孵化方案第十二节）：路径与动作同 AI 的
// 建议，后端按现稿一条条试套。挑的数据由作者自己挑，「高级」（工程层）归程序与作者，平台人员都不
// 提议（skipped 里说一声）。

// 后端提议认的步骤格子（不含「高级」）
const PROPOSABLE = [
  'title',
  'does',
  'why',
  'uses',
  'rules',
  'ask_before',
  'outputs',
  'checks',
  'on_fail',
] as const

export function toProposals(
  saved: WorkdraftBody,
  local: WorkdraftBody,
  reason: string,
): { proposals: ProposalIn[]; skipped: string[] } {
  const out: ProposalIn[] = []
  const skipped: string[] = []
  const set = (path: string, value: unknown) => out.push({ path, op: 'set', value, reason })
  if (local.name !== saved.name) set('name', local.name)
  if (local.tagline !== saved.tagline) set('tagline', local.tagline)
  for (const key of ['does', 'does_not', 'elsewhere'] as const)
    if (local.scope[key] !== saved.scope[key]) set(`scope/${key}`, local.scope[key])
  if (!same(local.data_picks, saved.data_picks)) skipped.push('data_picks')

  const before = new Map(saved.steps.map((s) => [s.id, s]))
  const after = new Set(local.steps.map((s) => s.id))
  for (const step of saved.steps)
    if (!after.has(step.id)) out.push({ path: `steps/${step.id}`, op: 'remove', reason })
  local.steps.forEach((step, index) => {
    const old = before.get(step.id)
    if (!old) {
      out.push({
        path: `steps/${step.id}`,
        op: 'add',
        value: { ...step, advanced: undefined },
        reason,
      })
      return
    }
    for (const field of PROPOSABLE)
      if (!same(step[field], old[field])) set(`steps/${step.id}/${field}`, step[field])
    if (!same(step.advanced, old.advanced)) skipped.push(`steps/${step.id}/advanced`)
    // 留下来的步骤换了位置：挪到第几位（从 0 起）
    const kept = saved.steps.filter((s) => after.has(s.id)).map((s) => s.id)
    const keptNow = local.steps.filter((s) => before.has(s.id)).map((s) => s.id)
    if (kept.indexOf(step.id) !== keptNow.indexOf(step.id))
      out.push({ path: `steps/${step.id}`, op: 'move', value: index, reason })
  })
  return { proposals: out, skipped }
}
