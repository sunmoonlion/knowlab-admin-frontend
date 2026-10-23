import { describe, expect, it } from 'vitest'
import { filterNavigationByRoles, findNavigationItem } from '@/lib/navigation'

describe('admin navigation', () => {
  it('uses the same metadata for role filtering and locale-aware route matching', () => {
    expect(filterNavigationByRoles([]).map((item) => item.key)).toEqual(['dashboard', 'settings'])
    expect(filterNavigationByRoles(['operator']).map((item) => item.key)).toContain('reference')
    // 受理 · 孵化 · 测试 · 交付（SDD 0037 第七节），按这个顺序
    expect(
      filterNavigationByRoles(['operator'])
        .map((item) => item.key)
        .filter((key) => ['acceptance', 'incubation', 'tests', 'delivery'].includes(key)),
    ).toEqual(['acceptance', 'incubation', 'tests', 'delivery'])
    expect(filterNavigationByRoles(['operator']).map((item) => item.key)).not.toContain(
      'rich-reference',
    )
    expect(filterNavigationByRoles(['admin']).map((item) => item.key)).toContain('rich-reference')
    expect(findNavigationItem('/zh-CN/reference/details')?.key).toBe('reference')
    expect(findNavigationItem('/zh-CN/tests')?.key).toBe('tests')
  })
})
