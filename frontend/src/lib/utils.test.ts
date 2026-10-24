import { describe, it, expect } from 'vitest'
import { daysBetween, formatShort, toDateKey, formatHuman } from './utils'

describe('daysBetween', () => {
  it('同一天返回 0', () => {
    expect(daysBetween('2026-09-17', '2026-09-17')).toBe(0)
  })

  it('相邻两天返回 1，而不是 0', () => {
    // 曾经的 bug：页面显示「距下篇 0 天」，实际是第二天，差 1 天
    expect(daysBetween('2026-09-17', '2026-09-18')).toBe(1)
  })

  it('9月10日 到 9月17日 是 7 天，不是中间空着的 6 天', () => {
    expect(daysBetween('2026-09-10', '2026-09-17')).toBe(7)
  })

  it('跨月按真实日历算', () => {
    expect(daysBetween('2026-09-28', '2026-10-02')).toBe(4)
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
  })

  it('跨年按真实日历算', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11)
  })

  it('闰年 2 月 29 日参与计算', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2028-02-29', '2028-03-01')).toBe(1)
  })

  it('反向相减得到负数（对称）', () => {
    expect(daysBetween('2026-09-18', '2026-09-17')).toBe(-1)
  })

  it('跨夏令时不会少一天（按 UTC 毫秒算）', () => {
    // 美国夏令时切换日，本地时区做差会出现 23 小时，取整必须仍为 1
    expect(daysBetween('2026-03-07', '2026-03-08')).toBe(1)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
  })
})

describe('formatShort', () => {
  it('输出「9月10日」这样的简短月日', () => {
    expect(formatShort('2026-09-10')).toBe('9月10日')
    expect(formatShort('2026-12-01')).toBe('12月1日')
  })
})

describe('既有格式化函数', () => {
  it('toDateKey 用本地时区补零', () => {
    expect(toDateKey(new Date(2026, 8, 7))).toBe('2026-09-07')
  })

  it('formatHuman 带星期', () => {
    expect(formatHuman('2026-09-17')).toBe('2026年9月17日 周四')
  })
})
