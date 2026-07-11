import { useMemo, type KeyboardEvent } from 'react'
import { computeLayout, yForDay, type Entry } from '@/lib/tree-layout'
import { getMood } from '@/lib/mood'
import { cn } from '@/lib/utils'

interface MonthTreeProps {
  entries: Entry[]
  year: number
  month: number
  selectedDate?: string | null
  /** 搜索命中日期集合；非 null 时未命中叶子淡化 */
  highlightedDates?: Set<string> | null
  onSelect: (date: string) => void
}

const TILE = 34 // 像素砖边长
const HALF = TILE / 2
const TRUNK_W = 22
const OUTLINE = '#4a3b30' // 统一的复古描边色（深棕），浅/深色下都清晰

export function MonthTree({
  entries,
  year,
  month,
  selectedDate,
  highlightedDates,
  onSelect,
}: MonthTreeProps) {
  const layout = useMemo(
    () => computeLayout(entries, year, month),
    [entries, year, month],
  )
  const { width, height, trunkX, leaves, gaps, daysInMonth } = layout

  const yTop = yForDay(daysInMonth, daysInMonth)
  const groundY = height - 26
  const trunkTop = Math.max(20, yTop - 12)

  const handleKey = (date: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(date)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-y-auto" style={{ maxHeight: '68vh' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${year}年${month}月 的日记树，共 ${leaves.length} 篇`}
      >
        {/* 地面 */}
        <rect x={0} y={groundY} width={width} height={height - groundY} className="fill-amber-100 dark:fill-stone-800" />
        <line x1={0} y1={groundY} x2={width} y2={groundY} className="stroke-amber-300 dark:stroke-stone-700" strokeWidth={2} />

        {/* 树干：笔直像素柱 */}
        <rect
          x={trunkX - TRUNK_W / 2}
          y={trunkTop}
          width={TRUNK_W}
          height={groundY - trunkTop}
          rx={6}
          className="fill-amber-700 dark:fill-amber-600"
          stroke={OUTLINE}
          strokeWidth={2.5}
        />
        {/* 树干纹理：两道横纹 */}
        {[0.35, 0.62].map((t, i) => {
          const ly = trunkTop + (groundY - trunkTop) * t
          return (
            <line
              key={i}
              x1={trunkX - TRUNK_W / 2 + 3}
              y1={ly}
              x2={trunkX + TRUNK_W / 2 - 3}
              y2={ly}
              className="stroke-amber-900/40 dark:stroke-amber-950/50"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}

        {/* 间隔段：空心像素块 + 胶囊标签 */}
        {gaps.map((g, i) => {
          const ticks = []
          for (let d = g.fromDay + 1; d <= g.toDay - 1; d++) {
            const ty = yForDay(d, daysInMonth)
            ticks.push(
              <rect
                key={d}
                x={trunkX - 4}
                y={ty - 4}
                width={8}
                height={8}
                rx={2}
                className="fill-amber-200 dark:fill-stone-600"
                stroke={OUTLINE}
                strokeWidth={1.5}
              />,
            )
          }
          const labelW = Math.max(48, g.label.length * 6 + 14)
          const midY = (g.yStart + g.yEnd) / 2
          return (
            <g key={`gap-${i}`}>
              {ticks}
              <g transform={`translate(${trunkX + TRUNK_W / 2 + 10}, ${midY})`}>
                <rect x={0} y={-9} width={labelW} height={18} rx={9} className="fill-stone-100 dark:fill-stone-700" stroke={OUTLINE} strokeWidth={1.5} />
                <text x={labelW / 2} y={0} textAnchor="middle" dominantBaseline="central" className="fill-stone-600 dark:fill-stone-200 text-[9px] font-medium">
                  {g.label}
                </text>
              </g>
            </g>
          )
        })}

        {/* 叶子：像素砖 */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const isHit = highlightedDates?.has(leaf.date)
          const dimmed = highlightedDates != null && !isHit
          const tileX = leaf.x - HALF
          const tileY = leaf.y - HALF
          const branchX2 = leaf.side === 'left' ? leaf.x + HALF : leaf.x - HALF
          const ringStroke = isSelected ? '#ffffff' : isHit ? '#0ea5e9' : OUTLINE
          return (
            <g
              key={leaf.date}
              role="button"
              tabIndex={0}
              aria-label={`${month}月${leaf.day}日 日记 · 心情${mood?.label ?? '未设'}`}
              onClick={() => onSelect(leaf.date)}
              onKeyDown={handleKey(leaf.date)}
              className={cn('cursor-pointer outline-none')}
              style={{ opacity: dimmed ? 0.3 : 1 }}
            >
              {/* 分支 */}
              <line x1={trunkX} y1={leaf.y} x2={branchX2} y2={leaf.y} className="stroke-amber-800 dark:stroke-amber-700" strokeWidth={5} strokeLinecap="round" />
              {/* 选中外环 */}
              {isSelected && (
                <rect x={tileX - 3} y={tileY - 3} width={TILE + 6} height={TILE + 6} rx={11} fill="none" stroke={OUTLINE} strokeWidth={2} />
              )}
              {/* 像素砖 */}
              <rect
                x={tileX}
                y={tileY}
                width={TILE}
                height={TILE}
                rx={8}
                fill={leaf.color}
                stroke={ringStroke}
                strokeWidth={isSelected || isHit ? 3 : 2.5}
              />
              {/* 心情 emoji */}
              <text x={leaf.x} y={leaf.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={18}>
                {mood?.emoji ?? '🍃'}
              </text>
              {/* 日号 */}
              <text x={leaf.x} y={tileY + TILE + 11} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">
                {leaf.day}
              </text>
            </g>
          )
        })}

        {/* 空月提示 */}
        {leaves.length === 0 && (
          <text x={trunkX} y={(trunkTop + groundY) / 2} textAnchor="middle" className="fill-muted-foreground text-sm">
            本月还没有日记
          </text>
        )}
      </svg>
    </div>
  )
}
