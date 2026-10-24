import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化为 'YYYY-MM-DD'（本地时区），用于日记日期主键。 */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 两个日期键之间相差的天数（b - a），跨月跨年都按真实日历算。 */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  // 用 UTC 毫秒差再取整，避免夏令时导致 23/25 小时误差
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)
  return Math.round(ms / 86400000)
}

/** 简短的月日，例如 '9月10日'。 */
export function formatShort(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${m}月${d}日`
}

/** 人类可读的日期，例如 '2026年7月11日 周六'。 */
export function formatHuman(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${y}年${m}月${d}日 ${week}`
}
