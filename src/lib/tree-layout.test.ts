import { describe, it, expect } from 'vitest'
import { computeLayout, daysInMonth, type Entry } from './tree-layout'

function entry(date: string, mood: string | null = 'joy'): Entry {
  return {
    id: date,
    date,
    title: '',
    content: { type: 'doc', content: [] },
    mood,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('daysInMonth', () => {
  it('正确返回各月天数', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29) // 闰年
    expect(daysInMonth(2026, 7)).toBe(31)
    expect(daysInMonth(2026, 6)).toBe(30)
  })
})

describe('computeLayout', () => {
  it('叶子 y 随日期单调递增（day1 在最下，day31 在最上）', () => {
    const layout = computeLayout(
      [entry('2026-07-01'), entry('2026-07-15'), entry('2026-07-31')],
      2026,
      7,
    )
    const [a, b, c] = layout.leaves
    expect(a.y).toBeGreaterThan(b.y)
    expect(b.y).toBeGreaterThan(c.y)
  })

  it('同日期多次调用结果一致（确定性）', () => {
    const data = [entry('2026-07-03'), entry('2026-07-09'), entry('2026-07-22')]
    const x1 = computeLayout(data, 2026, 7)
    const x2 = computeLayout(data, 2026, 7)
    expect(x1).toEqual(x2)
  })

  it('相邻两篇之间生成间隔段，标注空天数与日期范围', () => {
    const layout = computeLayout([entry('2026-07-03'), entry('2026-07-09')], 2026, 7)
    expect(layout.gaps).toHaveLength(1)
    const g = layout.gaps[0]
    expect(g.emptyDays).toBe(5)
    expect(g.label).toContain('空 5 天')
    expect(g.label).toContain('7月4–8日')
  })

  it('空月：无叶子、无间隔段', () => {
    const layout = computeLayout([], 2026, 7)
    expect(layout.leaves).toHaveLength(0)
    expect(layout.gaps).toHaveLength(0)
  })

  it('当月只有一篇：无间隔段', () => {
    const layout = computeLayout([entry('2026-07-03')], 2026, 7)
    expect(layout.leaves).toHaveLength(1)
    expect(layout.gaps).toHaveLength(0)
  })

  it('叶子带心情颜色，无心情回退默认色', () => {
    const layout = computeLayout([entry('2026-07-03', 'sad'), entry('2026-07-09', null)], 2026, 7)
    expect(layout.leaves[0].color).toBe('#99F6E4')
    expect(layout.leaves[1].color).toMatch(/^#/)
  })
})
