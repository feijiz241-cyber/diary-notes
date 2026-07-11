import type { Entry } from './db'
import { getMood } from './mood'

export type { Entry }

export interface LeafLayout {
  date: string
  day: number
  /** 叶子中心 x（SVG 坐标） */
  x: number
  /** 叶子中心 y（SVG 坐标） */
  y: number
  side: 'left' | 'right'
  /** 分支起点 x（主干处） */
  branchFromX: number
  /** 分支终点 x（叶子处） */
  branchToX: number
  color: string
  moodId: string | null
}

export interface GapLayout {
  fromDay: number
  toDay: number
  emptyDays: number
  label: string
  yStart: number
  yEnd: number
}

export interface TreeLayout {
  leaves: LeafLayout[]
  gaps: GapLayout[]
  daysInMonth: number
  width: number
  height: number
  trunkX: number
}

const WIDTH = 360
const HEIGHT = 760
const PADDING_TOP = 48
const PADDING_BOTTOM = 48
export const TRUNK_X = WIDTH / 2

export function daysInMonth(year: number, month: number): number {
  // month: 1-12；用下月 0 号得到当月最后一天
  return new Date(year, month, 0).getDate()
}

/** day(1..dim) → y 坐标：day1 在底部，dim 在顶部（天数 = 高度）。 */
export function yForDay(day: number, dim: number): number {
  if (dim <= 1) return HEIGHT - PADDING_BOTTOM
  const t = (day - 1) / (dim - 1)
  return HEIGHT - PADDING_BOTTOM - t * (HEIGHT - PADDING_TOP - PADDING_BOTTOM)
}

/** 由日期字符串生成稳定的伪随机数（保证同日期同布局）。 */
function hashDate(date: string): number {
  let h = 2166136261
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function dayOf(date: string): number {
  return parseInt(date.slice(8, 10), 10)
}

function makeGap(fromDay: number, toDay: number, month: number, dim: number): GapLayout {
  const emptyDays = toDay - fromDay - 1
  const a = fromDay + 1
  const b = toDay - 1
  const label =
    emptyDays > 0 ? `空 ${emptyDays} 天（${month}月${a}–${b}日）` : `${month}月${toDay}日`
  return { fromDay, toDay, emptyDays, label, yStart: yForDay(fromDay, dim), yEnd: yForDay(toDay, dim) }
}

/**
 * 核心时间逻辑：把一个月的日记映射到一棵树。
 * - 叶子纵向位置由"写日记的日期"严格决定（天数 = 高度）
 * - 左右与伸出长度由日期哈希确定性得出
 * - 相邻两篇之间的空白枝生成间隔段（标注空天数与日期范围）
 */
export function computeLayout(entries: Entry[], year: number, month: number): TreeLayout {
  const dim = daysInMonth(year, month)
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))

  const leaves: LeafLayout[] = sorted.map((e) => {
    const day = dayOf(e.date)
    const y = yForDay(day, dim)
    const h = hashDate(e.date)
    const side: 'left' | 'right' = h % 2 === 0 ? 'left' : 'right'
    const reach = 64 + (h % 46) // 64..109
    const x = side === 'left' ? TRUNK_X - reach : TRUNK_X + reach
    const mood = getMood(e.mood)
    return {
      date: e.date,
      day,
      x,
      y,
      side,
      branchFromX: TRUNK_X,
      branchToX: x,
      color: mood?.color ?? '#9CB86A',
      moodId: e.mood ?? null,
    }
  })

  const gaps: GapLayout[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = dayOf(sorted[i].date)
    const b = dayOf(sorted[i + 1].date)
    if (b - a > 1) gaps.push(makeGap(a, b, month, dim))
  }

  return { leaves, gaps, daysInMonth: dim, width: WIDTH, height: HEIGHT, trunkX: TRUNK_X }
}
