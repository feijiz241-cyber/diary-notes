import { useId, useMemo, type KeyboardEvent } from 'react'
import { computeLayout, type Entry } from '@/lib/tree-layout'
import { getMood } from '@/lib/mood'

interface MonthTreeProps {
  entries: Entry[]
  year: number
  month: number
  selectedDate?: string | null
  /** 搜索命中日期集合；非 null 时未命中叶子淡化 */
  highlightedDates?: Set<string> | null
  onSelect: (date: string) => void
}

// 黄昏/黎明过渡 调色（仅本组件作用域，不污染全局）
const SIL = '#14102a' // 前景树 / 最近剪影（近黑紫）
const SIL_NEAR = '#271d44' // 近山
const SIL_FAR = '#3a2c5e' // 远山（偏雾紫）
const GROUND = '#0d0a1a' // 地面
const MOON = '#f3ecd6' // 月亮
const STAR = '#f7f0e0' // 星点
const DAY_TXT = '#d9d2ea' // 日期文字
const GAP_TXT = 'rgba(217,210,234,0.55)' // 间隔文字
const SEL_RING = '#ffffff' // 选中环
const HIT_RING = '#ffd27a' // 搜索命中环

export function MonthTree({
  entries,
  year,
  month,
  selectedDate,
  highlightedDates,
  onSelect,
}: MonthTreeProps) {
  const uid = useId().replace(/[:]/g, '')
  const layout = useMemo(
    () => computeLayout(entries, year, month),
    [entries, year, month],
  )
  const { width, height, trunkX, groundY, crownCY, crownR, trunkTopY, leaves, gaps } = layout

  const handleKey = (date: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(date)
    }
  }

  // 确定性星点（同一棵树稳定）
  const stars = useMemo(() => {
    const rng = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    const count = 46
    return Array.from({ length: count }, (_, i) => ({
      x: rng(i * 2 + 1) * width,
      y: rng(i * 2 + 2) * height * 0.45,
      r: rng(i) * 1.1 + 0.4,
    }))
  }, [width, height])

  return (
    <div className="mx-auto w-full overflow-y-auto" style={{ maxHeight: '80vh' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${year}年${month}月 的日记树，共 ${leaves.length} 篇`}
      >
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#241a40" />
            <stop offset="42%" stopColor="#5b3f7a" />
            <stop offset="78%" stopColor="#b86a6a" />
            <stop offset="100%" stopColor="#e0a06a" />
          </linearGradient>
          <radialGradient id={`moon-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={MOON} stopOpacity="0.55" />
            <stop offset="100%" stopColor={MOON} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ---------- 天空 ---------- */}
        <rect x={0} y={0} width={width} height={height} fill={`url(#sky-${uid})`} />

        {/* ---------- 星点 ---------- */}
        <g fill={STAR}>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={0.85} />
          ))}
        </g>

        {/* ---------- 月亮 ---------- */}
        <circle cx={width - 70} cy={92} r={46} fill={`url(#moon-${uid})`} />
        <circle cx={width - 70} cy={92} r={22} fill={MOON} />

        {/* ---------- 地面 ---------- */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill={GROUND} />

        {/* ---------- 远山（雾紫，较高） ---------- */}
        <path
          d={mountainPath(width, groundY, groundY - 150, [0.5, 0.35, 0.62, 0.4, 0.55, 0.3, 0.58])}
          fill={SIL_FAR}
        />
        {/* ---------- 近山（更深，较低） ---------- */}
        <path
          d={mountainPath(width, groundY, groundY - 108, [0.3, 0.45, 0.25, 0.5, 0.32, 0.46, 0.28, 0.5])}
          fill={SIL_NEAR}
        />

        {/* ---------- 前景树剪影（根部带过渡、树干锥形、树冠自然） ---------- */}
        <path d={treePath(trunkX, groundY, trunkTopY, crownCY, crownR)} fill={SIL} />

        {/* ---------- 间隔文字 ---------- */}
        {gaps.map((g, i) => (
          <text
            key={`gap-${i}`}
            x={g.midX}
            y={g.midY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fill={GAP_TXT}
          >
            {g.label}
          </text>
        ))}

        {/* ---------- 日记叶：树上发光点（心情色辉光） ---------- */}
        {leaves.map((leaf) => {
          const mood = getMood(leaf.moodId)
          const isSelected = selectedDate === leaf.date
          const isHit = highlightedDates?.has(leaf.date)
          const dimmed = highlightedDates != null && !isHit
          const glow = leaf.color
          const ringStroke = isSelected ? SEL_RING : isHit ? HIT_RING : 'none'
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
              {/* 选中 / 命中外环 */}
              {ringStroke !== 'none' && (
                <circle cx={leaf.x} cy={leaf.y} r={13} fill="none" stroke={ringStroke} strokeWidth={2} />
              )}
              {/* 辉光 */}
              <circle cx={leaf.x} cy={leaf.y} r={11} fill={glow} opacity={0.22} />
              {/* 光晕 */}
              <circle cx={leaf.x} cy={leaf.y} r={5} fill={glow} />
              {/* 亮核 */}
              <circle cx={leaf.x} cy={leaf.y} r={2.2} fill="#fff8e7" />
              {/* 日期 */}
              <text
                x={leaf.x}
                y={leaf.y + 18}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fontWeight="bold"
                fill={DAY_TXT}
              >
                {leaf.day}
              </text>
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

/** 生成三角峰剪影多边形路径（baseY 为山脚，topY 为峰顶基准） */
function mountainPath(width: number, baseY: number, topY: number, peaks: number[]): string {
  const n = peaks.length
  const step = width / (n - 1)
  let d = `M 0 ${baseY}`
  peaks.forEach((p, i) => {
    const x = i * step
    const y = topY + (baseY - topY) * (1 - p)
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  })
  d += ` L ${width} ${baseY} Z`
  return d
}

/** 生成带根部过渡、树干锥形、树冠自然的树剪影路径 */
function treePath(
  tx: number,
  groundY: number,
  trunkTopY: number,
  crownCY: number,
  crownR: number
): string {
  const baseY = groundY
  const rootSpread = 70
  const baseW = 42
  const topW = 20
  const canSpread = crownR * 0.86
  const canY = crownCY + crownR * 0.75
  const topY = crownCY - crownR * 0.95

  const rootL = tx - rootSpread
  const rootR = tx + rootSpread
  const baseL = tx - baseW
  const baseR = tx + baseW
  const topL = tx - topW
  const topR = tx + topW
  const canL = tx - canSpread
  const canR = tx + canSpread

  return [
    `M ${rootL} ${baseY}`,
    // 左根 → 树干底
    `C ${rootL + 12} ${baseY - 2}, ${baseL - 8} ${baseY - 12}, ${baseL} ${baseY - 14}`,
    // 左树干底 → 树干顶
    `C ${baseL + 6} ${baseY - 58}, ${topL - 4} ${trunkTopY + 20}, ${topL} ${trunkTopY}`,
    // 树干顶 → 左树冠下沿
    `C ${topL} ${canY + 4}, ${canL + 40} ${canY}, ${canL} ${canY}`,
    // 左树冠下沿 → 树顶
    `C ${canL - 20} ${canY - 32}, ${tx - 70} ${topY + 60}, ${tx} ${topY}`,
    // 树顶 → 右树冠下沿
    `C ${tx + 70} ${topY + 60}, ${canR + 20} ${canY - 32}, ${canR} ${canY}`,
    // 右树冠下沿 → 树干顶
    `C ${canR - 40} ${canY}, ${topR} ${canY + 4}, ${topR} ${trunkTopY}`,
    // 右树干顶 → 右树干底
    `C ${topR + 4} ${trunkTopY + 20}, ${baseR - 6} ${baseY - 58}, ${baseR} ${baseY - 14}`,
    // 右树干底 → 右根
    `C ${baseR + 8} ${baseY - 12}, ${rootR - 12} ${baseY - 2}, ${rootR} ${baseY}`,
    'Z',
  ].join(' ')
}
