import type { Entry } from './db'
import { getMood } from './mood'

export type { Entry }

export interface LeafLayout {
  date: string
  day: number
  /** 叶子中心 x（SVG 坐标，横向：日期越大越靠右） */
  x: number
  /** 叶子中心 y（SVG 坐标，在树冠下缘带内小幅波动） */
  y: number
  color: string
  moodId: string | null
}

export interface GapLayout {
  fromDay: number
  toDay: number
  emptyDays: number
  label: string
  /** 间隔标牌中心坐标（用于渲染"空 N 天"） */
  midX: number
  midY: number
}

export interface TreeLayout {
  leaves: LeafLayout[]
  gaps: GapLayout[]
  daysInMonth: number
  width: number
  height: number
  trunkX: number
  groundY: number
  crownCX: number
  crownCY: number
  crownR: number
  /** 树干顶端 y（插入树冠下缘） */
  trunkTopY: number
  /** 叶子带基准 y */
  leafBandY: number
  /** 叶子带横向宽度 */
  bandWidth: number
}

const WIDTH = 460
const HEIGHT = 700
const GROUND_H = 56
const TRUNK_H = 80
const CROWN_R = 172

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
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

/**
 * 核心时间逻辑（B 方案：整棵大树）。
 * - 整个月 = 一棵参考图风格的大树（树冠大团 + 短树干 + 地面）
 * - 日记叶按"写日记的日期"横向排列在树冠下缘：day1 在最左、月末在最右（时间逻辑）
 * - y 在树冠下缘带内由日期哈希小幅波动，避免一条直线
 * - 相邻两篇之间的空白生成间隔标牌（标注空天数与日期范围）
 */
export function computeLayout(entries: Entry[], year: number, month: number): TreeLayout {
  const dim = daysInMonth(year, month)
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))

  const trunkX = WIDTH / 2
  const groundY = HEIGHT - GROUND_H
  const crownCY = groundY - TRUNK_H - CROWN_R
  const crownCX = trunkX
  const bandWidth = CROWN_R * 1.5
  const leafBandY = crownCY + CROWN_R * 0.62
  const trunkTopY = crownCY + CROWN_R * 0.78

  const leaves: LeafLayout[] = sorted.map((e) => {
    const day = dayOf(e.date)
    const t = dim <= 1 ? 0 : (day - 1) / (dim - 1)
    const x = crownCX - bandWidth / 2 + t * bandWidth
    const h = hashDate(e.date)
    const y = leafBandY + (((h % 1000) / 1000) - 0.5) * 46
    const mood = getMood(e.mood)
    return {
      date: e.date,
      day,
      x,
      y,
      color: mood?.color ?? '#9CB86A',
      moodId: e.mood ?? null,
    }
  })

  const gaps: GapLayout[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = dayOf(sorted[i].date)
    const b = dayOf(sorted[i + 1].date)
    if (b - a > 1) {
      const emptyDays = b - a - 1
      const ta = dim <= 1 ? 0 : (a - 1) / (dim - 1)
      const tb = dim <= 1 ? 0 : (b - 1) / (dim - 1)
      const midX = crownCX - bandWidth / 2 + ((ta + tb) / 2) * bandWidth
      const midY = leafBandY + 46
      gaps.push({
        fromDay: a,
        toDay: b,
        emptyDays,
        label: `空 ${emptyDays} 天（${month}月${a + 1}–${b - 1}日）`,
        midX,
        midY,
      })
    }
  }

  return {
    leaves,
    gaps,
    daysInMonth: dim,
    width: WIDTH,
    height: HEIGHT,
    trunkX,
    groundY,
    crownCX,
    crownCY,
    crownR: CROWN_R,
    trunkTopY,
    leafBandY,
    bandWidth,
  }
}
