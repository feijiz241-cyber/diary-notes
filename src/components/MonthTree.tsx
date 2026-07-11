import { useMemo, type KeyboardEvent } from 'react'
import { computeLayout, type Entry } from '@/lib/tree-layout'
import { getMood } from '@/lib/mood'
import { buildClump, buildCrown } from '@/lib/pixel-clump'

interface MonthTreeProps {
  entries: Entry[]
  year: number
  month: number
  selectedDate?: string | null
  /** 搜索命中日期集合；非 null 时未命中叶子淡化 */
  highlightedDates?: Set<string> | null
  onSelect: (date: string) => void
}

const OUTLINE = '#3d2c1d' // 深棕/木炭描边
const LEAF_SIZE = 6 // 叶子像素丛单块边长（总体约 30px）
const CROWN_COLOR = '#52c41a' // 树冠绿叶色
const TRUNK_W = 30

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
  const { width, height, trunkX, groundY, crownCX, crownCY, crownR, trunkTopY, leaves, gaps } = layout

  // 树冠大团（参考图风格的蓬松像素冠）
  const crownBlocks = useMemo(
    () => buildCrown(crownCX, crownCY, crownR, CROWN_COLOR, 8),
    [crownCX, crownCY, crownR],
  )

  const handleKey = (date: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(date)
    }
  }

  const grassWidth = 16
  const grassCount = Math.ceil(width / grassWidth)

  return (
    <div className="mx-auto w-full max-w-[460px] overflow-y-auto" style={{ maxHeight: '70vh' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${year}年${month}月 的日记树，共 ${leaves.length} 篇`}
      >
        {/* 天空背景 */}
        <rect x={0} y={0} width={width} height={height} className="fill-sky-200 dark:fill-stone-900" />
        {/* 地面 / 泥土 */}
        <rect x={0} y={groundY} width={width} height={height - groundY} className="fill-amber-300 dark:fill-stone-800" />
        {/* 草皮条 */}
        {Array.from({ length: grassCount }, (_, i) => (
          <rect
            key={i}
            x={i * grassWidth}
            y={groundY - 8}
            width={grassWidth}
            height={8}
            className="fill-green-600 dark:fill-green-700"
            stroke={OUTLINE}
            strokeWidth={1}
          />
        ))}
        <line x1={0} y1={groundY} x2={width} y2={groundY} stroke={OUTLINE} strokeWidth={2} />

        {/* 树冠大团 */}
        <g stroke={OUTLINE} strokeWidth={1}>
          {crownBlocks.map((b, idx) => (
            <rect key={idx} x={b.x} y={b.y} width={b.size} height={b.size} fill={b.fill} />
          ))}
        </g>

        {/* 树干（短粗 3D 木块） */}
        <rect
          x={trunkX - TRUNK_W / 2}
          y={trunkTopY}
          width={TRUNK_W}
          height={groundY - trunkTopY}
          className="fill-amber-800 dark:fill-amber-700"
          stroke={OUTLINE}
          strokeWidth={2}
        />
        <rect
          x={trunkX - TRUNK_W / 2 + 3}
          y={trunkTopY + 4}
          width={7}
          height={groundY - trunkTopY - 8}
          className="fill-amber-600/60 dark:fill-amber-500/40"
        />
        <rect
          x={trunkX + TRUNK_W / 2 - 7}
          y={trunkTopY + 4}
          width={4}
          height={groundY - trunkTopY - 8}
          className="fill-amber-900/40 dark:fill-amber-950/40"
        />

        {/* 间隔标牌：两篇日记之间的空档 */}
        {gaps.map((g, i) => {
          const labelW = Math.max(56, g.label.length * 6 + 16)
          return (
            <g key={`gap-${i}`} transform={`translate(${g.midX - labelW / 2}, ${g.midY})`}>
              <rect x={0} y={-9} width={labelW} height={18} className="fill-orange-100 dark:fill-stone-700" stroke={OUTLINE} strokeWidth={1.5} />
              <text
                x={labelW / 2}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-stone-700 dark:fill-stone-100 text-[9px] font-bold"
              >
                {g.label}
              </text>
            </g>
          )
        })}

        {/* 日记叶（树冠下沿按日期横向排列，可点击） */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const isHit = highlightedDates?.has(leaf.date)
          const dimmed = highlightedDates != null && !isHit
          const blocks = buildClump(leaf.date, leaf.color, leaf.x, leaf.y, LEAF_SIZE)
          const half = (blocks.length ? LEAF_SIZE * 2.5 : 0)
          const outlineStroke = isSelected ? '#ffffff' : isHit ? '#38bdf8' : OUTLINE
          return (
            <g
              key={leaf.date}
              role="button"
              tabIndex={0}
              aria-label={`${month}月${leaf.day}日 日记 · 心情${mood?.label ?? '未设'}`}
              onClick={() => onSelect(leaf.date)}
              onKeyDown={handleKey(leaf.date)}
              className="cursor-pointer outline-none"
              style={{ opacity: dimmed ? 0.3 : 1 }}
            >
              {/* 选中 / 命中外框 */}
              <rect
                x={leaf.x - half - 3}
                y={leaf.y - half - 3}
                width={half * 2 + 6}
                height={half * 2 + 6}
                fill="none"
                stroke={outlineStroke}
                strokeWidth={isSelected ? 3 : isHit ? 3 : 0}
              />
              {blocks.map((b, idx) => (
                <rect key={idx} x={b.x} y={b.y} width={b.size} height={b.size} fill={b.fill} stroke={OUTLINE} strokeWidth={1} />
              ))}
              {/* 心情 emoji */}
              <text x={leaf.x} y={leaf.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                {mood?.emoji ?? '🍃'}
              </text>
              {/* 日号牌 */}
              <g transform={`translate(${leaf.x}, ${leaf.y + half + 11})`}>
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
          <text
            x={trunkX}
            y={crownCY + crownR + 36}
            textAnchor="middle"
            className="fill-stone-700 dark:fill-stone-200 text-sm font-bold"
          >
            本月还没有日记
          </text>
        )}
      </svg>
    </div>
  )
}
