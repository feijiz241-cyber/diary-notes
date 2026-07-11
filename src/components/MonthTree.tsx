import { useMemo, type KeyboardEvent } from 'react'
import { computeLayout, type Entry } from '@/lib/tree-layout'
import { getMood } from '@/lib/mood'
import { buildCrown } from '@/lib/pixel-clump'

interface MonthTreeProps {
  entries: Entry[]
  year: number
  month: number
  selectedDate?: string | null
  /** 搜索命中日期集合；非 null 时未命中叶子淡化 */
  highlightedDates?: Set<string> | null
  onSelect: (date: string) => void
}

const OUTLINE = '#2a1d10' // 深褐/木炭描边
const CROWN_COLOR = '#4f8f33' // 我的世界树叶基绿
const TRUNK_W = 30
const LEAF = 22 // 物品栏格子边长

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

  // 树冠：真实 MC 树叶纹理
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

  const grassW = 16

  return (
    <div className="mx-auto w-full max-w-[460px] overflow-y-auto" style={{ maxHeight: '70vh' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${year}年${month}月 的日记树，共 ${leaves.length} 篇`}
      >
        {/* ---------- 天空 ---------- */}
        <rect x={0} y={0} width={width} height={height} className="fill-[var(--mc-sky)]" />

        {/* 太阳 */}
        <circle cx={width - 56} cy={56} r={20} className="fill-[var(--mc-sun)]" />
        <circle cx={width - 56} cy={56} r={26} className="fill-[var(--mc-sun)] opacity-20" />

        {/* 像素云 */}
        <g className="fill-[var(--mc-cloud)]">
          <Cloud x={70} y={70} />
          <Cloud x={250} y={120} scale={0.8} />
          <Cloud x={150} y={200} scale={0.6} />
        </g>

        {/* ---------- 地面：草方块 + 泥土 + 基岩 ---------- */}
        <GrassGround width={width} groundY={groundY} grassW={grassW} height={height} />

        {/* 树投影（树干落在地面的像素阴影） */}
        <ellipse
          cx={trunkX}
          cy={groundY + 4}
          rx={TRUNK_W * 1.7}
          ry={9}
          fill="rgba(0,0,0,0.18)"
        />

        {/* ---------- 树冠：MC 树叶 ---------- */}
        <g stroke={OUTLINE} strokeWidth={1}>
          {crownBlocks.map((b, idx) => (
            <rect key={idx} x={b.x} y={b.y} width={b.size} height={b.size} fill={b.fill} />
          ))}
        </g>

        {/* ---------- 树干：MC 原木 ---------- */}
        <rect
          x={trunkX - TRUNK_W / 2}
          y={trunkTopY}
          width={TRUNK_W}
          height={groundY - trunkTopY}
          className="fill-[var(--mc-log)]"
          stroke={OUTLINE}
          strokeWidth={2}
        />
        {/* 左亮 / 右暗 面 */}
        <rect x={trunkX - TRUNK_W / 2 + 3} y={trunkTopY + 3} width={6} height={groundY - trunkTopY - 6} className="fill-[var(--mc-log-light)]" />
        <rect x={trunkX + TRUNK_W / 2 - 8} y={trunkTopY + 3} width={5} height={groundY - trunkTopY - 6} className="fill-[var(--mc-log-dark)]" />
        {/* 树皮竖纹 */}
        {[trunkX - 6, trunkX + 2, trunkX + 8].map((x, i) => (
          <line key={i} x1={x} y1={trunkTopY + 6} x2={x} y2={groundY - 6} className="stroke-[var(--mc-log-dark)]" strokeWidth={1.5} opacity={0.5} />
        ))}
        {/* 树顶年轮（与树冠交界） */}
        <ellipse cx={trunkX} cy={trunkTopY} rx={TRUNK_W / 2} ry={7} className="fill-[var(--mc-log-light)]" stroke={OUTLINE} strokeWidth={1.5} />

        {/* ---------- 间隔木牌 ---------- */}
        {gaps.map((g, i) => {
          const labelW = Math.max(56, g.label.length * 6 + 16)
          return (
            <g key={`gap-${i}`} transform={`translate(${g.midX - labelW / 2}, ${g.midY})`}>
              <rect x={0} y={-9} width={labelW} height={18} className="fill-[var(--mc-plank)]" stroke={OUTLINE} strokeWidth={1.5} />
              <text
                x={labelW / 2}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[#2a1c0d] text-[9px] font-bold"
              >
                {g.label}
              </text>
            </g>
          )
        })}

        {/* ---------- 日记叶：MC 物品栏格子 ---------- */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const isHit = highlightedDates?.has(leaf.date)
          const dimmed = highlightedDates != null && !isHit
          const half = LEAF / 2
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
                width={LEAF + 6}
                height={LEAF + 6}
                fill="none"
                stroke={outlineStroke}
                strokeWidth={isSelected ? 3 : isHit ? 3 : 0}
              />
              {/* 灰格子底（物品栏） */}
              <rect x={leaf.x - half} y={leaf.y - half} width={LEAF} height={LEAF} className="fill-[var(--mc-stone)]" stroke={OUTLINE} strokeWidth={1.5} />
              {/* 心情色内块 */}
              <rect x={leaf.x - half + 3} y={leaf.y - half + 3} width={LEAF - 6} height={LEAF - 6} fill={leaf.color} stroke={OUTLINE} strokeWidth={1} />
              {/* 心情 emoji */}
              <text x={leaf.x} y={leaf.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={13}>
                {mood?.emoji ?? '🍃'}
              </text>
              {/* 日号牌 */}
              <g transform={`translate(${leaf.x}, ${leaf.y + half + 11})`}>
                <rect x={-10} y={-8} width={20} height={16} className="fill-[var(--mc-plank)]" stroke={OUTLINE} strokeWidth={1.5} />
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central" className="fill-[#2a1c0d] text-[8px] font-bold">
                  {leaf.day}
                </text>
              </g>
            </g>
          )
        })}

        {/* ---------- 空月提示 ---------- */}
        {leaves.length === 0 && (
          <text
            x={trunkX}
            y={crownCY + crownR + 36}
            textAnchor="middle"
            className="fill-[hsl(var(--foreground))] text-sm font-bold"
          >
            本月还没有日记
          </text>
        )}
      </svg>
    </div>
  )
}

/** 像素云：几块白色方块拼成 */
function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = 8 * scale
  const blocks = [
    [0, 1], [1, 0], [2, 1], [3, 0], [4, 1], [1, 1], [2, 2], [3, 1],
  ]
  return (
    <g transform={`translate(${x}, ${y})`}>
      {blocks.map(([bx, by], i) => (
        <rect key={i} x={bx * s} y={by * s} width={s} height={s} />
      ))}
    </g>
  )
}

/** 地面：草方块顶面 + 泥土 + 基岩，草尖点缀 */
function GrassGround({ width, groundY, grassW, height }: { width: number; groundY: number; grassW: number; height: number }) {
  const grassCount = Math.ceil(width / grassW)
  return (
    <g>
      {/* 泥土层 */}
      <rect x={0} y={groundY + 14} width={width} height={28} className="fill-[var(--mc-dirt)]" />
      {/* 基岩/石头层 */}
      <rect x={0} y={groundY + 42} width={width} height={height - (groundY + 42)} className="fill-[var(--mc-stone-dark)]" />
      {/* 草顶面 */}
      <rect x={0} y={groundY} width={width} height={14} className="fill-[var(--mc-grass-top)]" stroke={OUTLINE} strokeWidth={1} />
      {/* 草方块分隔 + 草尖 */}
      {Array.from({ length: grassCount }, (_, i) => {
        const x = i * grassW
        return (
          <g key={i}>
            <line x1={x} y1={groundY} x2={x} y2={groundY + 14} className="stroke-[var(--mc-grass-top2)]" strokeWidth={1} opacity={0.6} />
            <rect x={x + grassW / 2 - 3} y={groundY - 5} width={6} height={6} className="fill-[var(--mc-grass-top)]" stroke={OUTLINE} strokeWidth={0.5} />
            <rect x={x + grassW / 2 - 3} y={groundY} width={6} height={6} className="fill-[var(--mc-grass-top2)]" />
          </g>
        )
      })}
    </g>
  )
}
