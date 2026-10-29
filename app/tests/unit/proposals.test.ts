import { describe, expect, it } from 'vitest'

import type { WorkdraftBody } from '@/contracts/workdraft'
import { toProposals } from '@/lib/knowbots/proposals'
import { newStep } from '@/lib/knowbots/workdraft'

function body(over: Partial<WorkdraftBody> = {}): WorkdraftBody {
  return {
    name: '财务分析',
    tagline: '',
    scope: { does: '财务分析', does_not: '', elsewhere: '' },
    data_picks: [],
    steps: [newStep('a'), newStep('b')],
    ...over,
  }
}

describe('改动算成提议（专家孵化方案第十二节）', () => {
  it('改了的格子是 set，加步是 add（不带「高级」），删步是 remove，挪了的是 move', () => {
    const saved = body()
    const [a, b] = saved.steps
    const local = body({
      name: '财务分析与预测',
      scope: { does: 'A 股非金融公司', does_not: '', elsewhere: '' },
      steps: [{ ...b, title: '读报表' }, newStep('c')],
    })
    const { proposals, skipped } = toProposals(saved, local, '更清楚')
    expect(skipped).toEqual([])
    expect(proposals).toEqual([
      { path: 'name', op: 'set', value: '财务分析与预测', reason: '更清楚' },
      { path: 'scope/does', op: 'set', value: 'A 股非金融公司', reason: '更清楚' },
      { path: `steps/${a.id}`, op: 'remove', reason: '更清楚' },
      { path: `steps/${b.id}/title`, op: 'set', value: '读报表', reason: '更清楚' },
      {
        path: 'steps/c',
        op: 'add',
        value: { ...newStep('c'), advanced: undefined },
        reason: '更清楚',
      },
    ])
  })

  it('挑数据与「高级」不提议，说一声', () => {
    const saved = body()
    const local = body({
      data_picks: ['m1'],
      steps: [
        { ...saved.steps[0], advanced: { ...saved.steps[0].advanced, reserve: '9' } },
        saved.steps[1],
      ],
    })
    const { proposals, skipped } = toProposals(saved, local, 'x')
    expect(proposals).toEqual([])
    expect(skipped).toEqual(['data_picks', 'steps/a/advanced'])
  })

  it('只换了顺序：两步都挪', () => {
    const saved = body()
    const local = body({ steps: [saved.steps[1], saved.steps[0]] })
    expect(toProposals(saved, local, 'x').proposals).toEqual([
      { path: 'steps/b', op: 'move', value: 0, reason: 'x' },
      { path: 'steps/a', op: 'move', value: 1, reason: 'x' },
    ])
  })
})
