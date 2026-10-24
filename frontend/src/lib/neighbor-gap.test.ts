import { describe, it, expect } from 'vitest'
import { neighborGap } from './neighbor-gap'

const DATES = [
  '2026-07-12',
  '2026-07-13',
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
  '2026-09-10',
  '2026-09-17',
  '2026-09-18',
]

describe('neighborGap', () => {
  it('9月17日：上篇 7 天前（9月10日），下篇 1 天后（9月18日）', () => {
    // 用户截图里显示的是「距上篇 6 天 / 距下篇 0 天」，那是「中间空着几天」的算法，
    // 读起来是错的：9月10日 到 9月17日 实际隔 7 天，9月17日 到 9月18日 隔 1 天。
    const g = neighborGap(DATES, '2026-09-17')
    expect(g.prevGap).toBe(7)
    expect(g.nextGap).toBe(1)
    expect(g.prevDate).toBe('2026-09-10')
    expect(g.nextDate).toBe('2026-09-18')
  })

  it('相邻两天是 1 天，不是 0 天', () => {
    expect(neighborGap(DATES, '2026-09-06').nextGap).toBe(1)
    expect(neighborGap(DATES, '2026-09-06').prevGap).toBe(1)
  })

  it('跨月能正确接上（7月13日 → 9月5日 是 54 天）', () => {
    const g = neighborGap(DATES, '2026-09-05')
    expect(g.prevDate).toBe('2026-07-13')
    expect(g.prevGap).toBe(54)
  })

  it('第一篇没有上篇，最后一篇没有下篇', () => {
    const first = neighborGap(DATES, '2026-07-12')
    expect(first.prevGap).toBeNull()
    expect(first.prevDate).toBeNull()
    expect(first.nextGap).toBe(1)

    const last = neighborGap(DATES, '2026-09-18')
    expect(last.nextGap).toBeNull()
    expect(last.nextDate).toBeNull()
    expect(last.prevGap).toBe(1)
  })

  it('只有一篇时上下都没有', () => {
    const g = neighborGap(['2026-09-17'], '2026-09-17')
    expect(g.prevGap).toBeNull()
    expect(g.nextGap).toBeNull()
  })

  it('日期不在列表里时全部为 null（不抛异常）', () => {
    const g = neighborGap(DATES, '2026-01-01')
    expect(g.prevGap).toBeNull()
    expect(g.nextGap).toBeNull()
  })

  it('空列表、空日期都不抛异常', () => {
    expect(neighborGap([], '2026-09-17').prevGap).toBeNull()
    expect(neighborGap([], '').nextGap).toBeNull()
  })

  it('不修改传入的数组', () => {
    const input = [...DATES]
    neighborGap(input, '2026-09-17')
    expect(input).toEqual(DATES)
  })
})
