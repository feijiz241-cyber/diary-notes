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

  const yBottom = yForDay(1, daysInMonth)
  const yTop = yForDay(daysInMonth, daysInMonth)

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
        {/* 树干 */}
        <path
          d={`M ${trunkX} ${yBottom} C ${trunkX - 14} ${(yBottom + yTop) / 2}, ${
            trunkX + 14
          } ${(yBottom + yTop) / 2}, ${trunkX} ${yTop}`}
          className="fill-none stroke-amber-800/80 dark:stroke-amber-900/80"
          strokeWidth={11}
          strokeLinecap="round"
        />

        {/* 间隔段：空白日刻度 + 标注 */}
        {gaps.map((g, i) => {
          const midY = (g.yStart + g.yEnd) / 2
          const ticks = []
          for (let d = g.fromDay + 1; d <= g.toDay - 1; d++) {
            ticks.push(
              <circle
                key={d}
                cx={trunkX}
                cy={yForDay(d, daysInMonth)}
                r={2.2}
                className="fill-amber-700/40 dark:fill-amber-500/40"
              />,
            )
          }
          return (
            <g key={`gap-${i}`}>
              {ticks}
              <text
                x={trunkX + 14}
                y={midY}
                dominantBaseline="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {g.label}
              </text>
            </g>
          )
        })}

        {/* 叶子 */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const dimmed = highlightedDates != null && !highlightedDates.has(leaf.date)
          const isHit = highlightedDates?.has(leaf.date)
          const branchPath = `M ${leaf.branchFromX} ${leaf.y} Q ${
            (leaf.branchFromX + leaf.branchToX) / 2
          } ${leaf.y - 12} ${leaf.branchToX} ${leaf.y}`
          return (
            <g
              key={leaf.date}
              role="button"
              tabIndex={0}
              aria-label={`${month}月${leaf.day}日 日记 · 心情${mood?.label ?? '未设'}`}
              onClick={() => onSelect(leaf.date)}
              onKeyDown={handleKey(leaf.date)}
              className={cn(
                'cursor-pointer outline-none transition-opacity',
                dimmed && 'opacity-30',
                !dimmed && 'opacity-100',
              )}
              style={{ opacity: dimmed ? 0.3 : 1 }}
            >
              <path
                d={branchPath}
                className="fill-none stroke-amber-800/70 dark:stroke-amber-900/70"
                strokeWidth={3}
              />
              <ellipse
                cx={leaf.x}
                cy={leaf.y}
                rx={16}
                ry={22}
                transform={`rotate(${leaf.side === 'left' ? 22 : -22} ${leaf.x} ${leaf.y})`}
                fill={leaf.color}
                className={cn(
                  'transition-[stroke,stroke-width]',
                  isSelected && 'stroke-foreground',
                  isHit && 'stroke-sky-500',
                )}
                strokeWidth={isSelected || isHit ? 3 : 1.5}
                stroke={isSelected ? 'var(--foreground)' : isHit ? '#0ea5e9' : 'rgba(0,0,0,0.25)'}
              />
              <text
                x={leaf.x}
                y={leaf.y + 40}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {leaf.day}日
              </text>
            </g>
          )
        })}

        {/* 空月提示 */}
        {leaves.length === 0 && (
          <text
            x={trunkX}
            y={(yBottom + yTop) / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-sm"
          >
            本月还没有日记
          </text>
        )}
      </svg>
    </div>
  )
}
