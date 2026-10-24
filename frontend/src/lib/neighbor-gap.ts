import { daysBetween } from './utils'

export interface NeighborGap {
  /** 与上一篇的真实相差天数（没有上一篇则为 null） */
  prevGap: number | null
  /** 与下一篇的真实相差天数（没有下一篇则为 null） */
  nextGap: number | null
  prevDate: string | null
  nextDate: string | null
}

/**
 * 在「全部日记的日期列表」里找某一天的上下篇。
 *
 * 三条容易搞错的地方（都踩过）：
 * 1. 必须传**全部**日记，不是当月 —— 否则每月第一篇会显示成没有上篇。
 * 2. 差值是**真实相隔天数**（`daysBetween`），不是「中间空着几天」。
 *    9月10日 → 9月17日 是 7 天，空着 6 天；写成 6 天读起来就是错的。
 * 3. 列表要先排好序，这里不再排。
 */
export function neighborGap(sortedDates: readonly string[], date: string): NeighborGap {
  const idx = sortedDates.indexOf(date)
  if (idx < 0) return { prevGap: null, nextGap: null, prevDate: null, nextDate: null }
  const prevDate = idx > 0 ? sortedDates[idx - 1] : null
  const nextDate = idx < sortedDates.length - 1 ? sortedDates[idx + 1] : null
  return {
    prevGap: prevDate != null ? daysBetween(prevDate, date) : null,
    nextGap: nextDate != null ? daysBetween(date, nextDate) : null,
    prevDate,
    nextDate,
  }
}
