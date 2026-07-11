import { useMemo, type KeyboardEvent } from 'react'
import { computeLayout, yForDay, type Entry } from '@/lib/tree-layout'
import { getMood } from '@/lib/mood'
import { buildClump, clumpBounds } from '@/lib/pixel-clump'
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

const BLOCK = 8 // 像素树叶丛方块边长
const TRUNK_W = 26
const BRANCH_H = 7
const OUTLINE = '#3d2c1d' // 深棕/木炭描边

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
  const groundY = height - 32
  const trunkTop = Math.max(18, yTop - 14)

  const handleKey = (date: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(date)
    }
  }

  // 地面像素草：交替草块
  const grassBlocks = useMemo(() => {
    const w = 12
    const total = Math.ceil(width / w)
    return Array.from({ length: total }, (_, i) => i * w)
  }, [width])

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-y-auto" style={{ maxHeight: '68vh' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${year}年${month}月 的日记树，共 ${leaves.length} 篇`}
      >
        {/* 地面/泥土 */}
        <rect x={0} y={groundY} width={width} height={height - groundY} className="fill-amber-200 dark:fill-stone-800" />
        {/* 草地 */}
        {grassBlocks.map((x) => (
          <rect key={x} x={x} y={groundY - 6} width={12} height={6} className="fill-green-600 dark:fill-green-700" stroke={OUTLINE} strokeWidth={1} />
        ))}
        <line x1={0} y1={groundY} x2={width} y2={groundY} stroke={OUTLINE} strokeWidth={2} />

        {/* 树干：3D 木块（左亮右暗） */}
        <rect
          x={trunkX - TRUNK_W / 2}
          y={trunkTop}
          width={TRUNK_W}
          height={groundY - trunkTop}
          className="fill-amber-700 dark:fill-amber-600"
          stroke={OUTLINE}
          strokeWidth={2}
        />
        <rect
          x={trunkX - TRUNK_W / 2 + 2}
          y={trunkTop + 4}
          width={6}
          height={groundY - trunkTop - 8}
          className="fill-amber-600/60 dark:fill-amber-500/40"
        />
        <rect
          x={trunkX + TRUNK_W / 2 - 6}
          y={trunkTop + 4}
          width={4}
          height={groundY - trunkTop - 8}
          className="fill-amber-900/40 dark:fill-amber-950/40"
        />
        {/* 树皮横纹 */}
        {[0.3, 0.55, 0.8].map((t, i) => {
          const ly = trunkTop + (groundY - trunkTop) * t
          return (
            <line
              key={i}
              x1={trunkX - TRUNK_W / 2 + 2}
              y1={ly}
              x2={trunkX + TRUNK_W / 2 - 2}
              y2={ly}
              className="stroke-amber-900/30 dark:stroke-amber-950/40"
              strokeWidth={2}
            />
          )
        })}

        {/* 间隔段：空心像素块 + 标签 */}
        {gaps.map((g, i) => {
          const ticks = []
          for (let d = g.fromDay + 1; d <= g.toDay - 1; d++) {
            const ty = yForDay(d, daysInMonth)
            ticks.push(
              <rect
                key={d}
                x={trunkX - 5}
                y={ty - 5}
                width={10}
                height={10}
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
                <rect x={0} y={-9} width={labelW} height={18} rx={0} className="fill-stone-100 dark:fill-stone-700" stroke={OUTLINE} strokeWidth={1.5} />
                <text x={labelW / 2} y={0} textAnchor="middle" dominantBaseline="central" className="fill-stone-600 dark:fill-stone-200 text-[9px] font-bold">
                  {g.label}
                </text>
              </g>
            </g>
          )
        })}

        {/* 树枝 */}
        {leaves.map((leaf) => {
          const isLeft = leaf.side === 'left'
          const branchX1 = isLeft ? trunkX - TRUNK_W / 2 + 2 : trunkX + TRUNK_W / 2 - 2
          const branchX2 = leaf.x + (isLeft ? BLOCK : -BLOCK)
          const x = Math.min(branchX1, branchX2)
          const w = Math.abs(branchX2 - branchX1)
          return (
            <rect
              key={`branch-${leaf.date}`}
              x={x}
              y={leaf.y - BRANCH_H / 2}
              width={w}
              height={BRANCH_H}
              className="fill-amber-800 dark:fill-amber-700"
              stroke={OUTLINE}
              strokeWidth={1.5}
            />
          )
        })}

        {/* 树叶丛（像素块） */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const isHit = highlightedDates?.has(leaf.date)
          const dimmed = highlightedDates != null && !isHit
          const blocks = buildClump(leaf.date, leaf.color, leaf.x, leaf.y, BLOCK)
          const bounds = clumpBounds(leaf.x, leaf.y, BLOCK)
          const outlineStroke = isSelected ? '#ffffff' : isHit ? '#38bdf8' : OUTLINE
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
              {/* 选中/命中外框 */}
              <rect
                x={bounds.x - 3}
                y={bounds.y - 3}
                width={bounds.w + 6}
                height={bounds.h + 6}
                fill="none"
                stroke={outlineStroke}
                strokeWidth={isSelected ? 3 : isHit ? 3 : 0}
              />
              {/* 像素块 */}
              {blocks.map((b, idx) => (
                <rect key={idx} x={b.x} y={b.y} width={b.size} height={b.size} fill={b.fill} stroke={OUTLINE} strokeWidth={1} />
              ))}
              {/* 心情 emoji */}
              <text x={leaf.x} y={leaf.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                {mood?.emoji ?? '🍃'}
              </text>
              {/* 日号牌 */}
              <g transform={`translate(${leaf.x}, ${bounds.y + bounds.h + 10})`}>
                <rect x={-10} y={-8} width={20} height={16} fill={OUTLINE} />
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="#ffffff" className="text-[8px] font-bold">
                  {leaf.day}
                </text>
              </g>
            </g>
          )
        })}

        {/* 空月提示 */}
        {leaves.length === 0 && (
          <text x={trunkX} y={(trunkTop + groundY) / 2} textAnchor="middle" className="fill-muted-foreground text-sm font-bold">
            本月还没有日记
          </text>
        )}
      </svg>
    </div>
  )
}
