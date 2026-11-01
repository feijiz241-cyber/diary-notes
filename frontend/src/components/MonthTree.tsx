import { useMemo, type KeyboardEvent } from 'react'
import { computeLayout, type Entry, type LeafLayout } from '@/lib/tree-layout'
import {
  PIXEL,
  buildCraters,
  buildGround,
  buildMoon,
  buildMountainRange,
  buildPine,
  buildSkyBands,
  buildStars,
  buildTrunk,
  shade,
  type PixelRect,
} from '@/lib/tree-pixels'

interface MonthTreeProps {
  entries: Entry[]
  year: number
  month: number
  selectedDate?: string | null
  /** 搜索命中日期集合；非 null 时未命中叶子淡化 */
  highlightedDates?: Set<string> | null
  onSelect: (date: string) => void
}

/* ── 色板 ──────────────────────────────────────────────────────────
 * **整幅画只用这 13 个颜色**，一律平涂、硬边、不透明。
 *
 * 这是本次重做的核心决定。用户说「好粗糙而且画面有点脏」，
 * 脏的技术定义就是：用了太多中间色。之前这版有：
 *   - 5 个色标插值出的 65 条渐变天空带（每带一个插值色 → 几十个脏灰紫）
 *   - 两个 radialGradient 柔光（树冠背后那层灰雾，最直接的「脏」）
 *   - 叶子用 opacity 0.13 / 0.26 的半透明方块做光晕（叠在近黑上就是一团灰）
 *   - buildGround 的随机碎石、buildCrown 的 texture 噪点
 *
 * 参考图 wallhaven-j8eyw5 实测：**7 个颜色覆盖 90% 画面**。
 * 真像素画靠「色阶跳变 + 交界棋盘格抖动」表现过渡，不靠插值。
 *
 * 色值仍然取自 wallhaven-96glxd 的逐带取样（天顶 #1d1c23、中段 #282242、
 * 山 #102136~#162940、山脊高光 #2d3d63），只是把「渐变」换成「4 个硬边色阶」。
 */
const SKY_STOPS = [
  /* 20 级明度阶梯。每级只差 1~3 个色阶 —— 分界线在肉眼阈值以下，
   * 合起来就是一整片干净的渐变。像素画的天就是这么做出来的：
   * 不是插值出无限多色，而是把有限几级色**排得足够密**。 */
  { offset: 0.0, color: '#12101e' },
  { offset: 0.053, color: '#141121' },
  { offset: 0.105, color: '#151324' },
  { offset: 0.158, color: '#171427' },
  { offset: 0.211, color: '#19162a' },
  { offset: 0.263, color: '#1b172d' },
  { offset: 0.316, color: '#1c1930' },
  { offset: 0.368, color: '#1e1a33' },
  { offset: 0.421, color: '#201c36' },
  { offset: 0.474, color: '#221d39' },
  { offset: 0.526, color: '#231f3d' },
  { offset: 0.579, color: '#252040' },
  { offset: 0.632, color: '#272243' },
  { offset: 0.684, color: '#292346' },
  { offset: 0.737, color: '#2a2549' },
  { offset: 0.789, color: '#2c264c' },
  { offset: 0.842, color: '#2e284f' },
  { offset: 0.895, color: '#302952' },
  { offset: 0.947, color: '#312b55' },
  { offset: 1.0, color: '#332c58' },
]

const MOON_BODY = '#f0e8d2'
const MOON_CRATER = '#cfc5ab'
const STAR = '#b9b5d0'

/* 三层山脊：越远越浅越高（空气透视）。
 * 全是蓝紫系，且**每层只有 body + ridge 两个色**。 */
const MOUNT_FAR = { body: '#3a3462', ridge: '#4a4378' }
const MOUNT_MID = { body: '#282247', ridge: '#352d5c' }
const MOUNT_NEAR = { body: '#1a1633', ridge: '#241f42' }

/* 树冠是「近黑的绿」，树干是「近黑的褐」——**必须带绿**。
 *
 * 之前树冠用的是近黑紫（#0b0917），和夜空同色系，结果：
 * 1. 树和背景糊在一起，只有轮廓可辨；
 * 2. 叶子是暖黄的光点，压在蓝黑上色相完全两套，看着像贴纸
 *    （用户原话「光点是不是有点和树格格不入了」）。
 * 真树是绿的：绿底 + 暖光才是「灯挂在树上」。亮度仍然压到 p50≈14/255，
 * 夜里看还是剪影，但色相站得住。
 * 地面/山/天空保持蓝紫（月光下的草甸），树的绿与它们拉开色相。 */
const CROWN_SHADE = '#070d08'
const CROWN_BASE = '#0a120b'
const CROWN_LIT = '#0e180f'
const TRUNK_SHADE = '#0a0806'
const TRUNK_BASE = '#130f0a'
const BARK = '#070504'
const GROUND_TOP = '#1c1836'
const GROUND_BASE = '#131029'
const GROUND_SLOPE = '#0c0a1c'
const DIRT = '#0a0818'
const BUSH = '#080713'

const SEL_RING = '#ffffff'
const HIT_RING = '#ffd27a'
const LABEL_BG = '#100e1f'

/** 把一串矩形画成 <rect>。opacity 只用于极少数装饰，主体一律不透明。 */
function Rects({
  rects,
  fill,
  opacity,
}: {
  rects: PixelRect[]
  fill: string
  opacity?: number
}) {
  return (
    <>
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={fill}
          opacity={opacity}
          shapeRendering="crispEdges"
        />
      ))}
    </>
  )
}

/**
 * 叶子：树冠是近黑的绿，叶子是画面上唯一的暖光源。
 *
 * 用户先后三次否过这一块，逐条记下（别再走回去）：
 * 1. 「光点的效果也不好」→ 之前是两层 opacity 0.13/0.26 的半透明大方块叠在
 *    近黑树冠上，结果是一团灰雾，既不像发光又把周围弄脏。
 * 2. 「光点是不是有点和树格格不入了」→ 纯暖色方块直接贴在近黑绿树冠上，
 *    色相两套，看着像贴纸。
 * 3. 「日记光点做小一点，自然一点融入树中」→ 之前 32×32 的实心方块 + 一圈
 *    比它更大的深色方框，整块像钉在树上的木牌。
 *
 * 现在的画法（全部纯色、零半透明，像素画的标准做法）：
 * 1. **切角**：四角各挖掉一小块，方块变成八边形，不再是一个硬邦邦的正方形。
 * 2. **抖动光晕**：外面一圈 2px 的格子里，按棋盘格只画一半（(i+j) 偶数），
 *    用叶色的暗调。这是像素画里唯一正确的「柔化」手段 —— 靠疏密而不是靠透明度，
 *    所以既不会糊成一团灰，又能让边缘「散」进树冠里。
 * 3. **灯芯**居中偏上一档亮色，尺寸只有方块的 40%，不抢主体。
 * 4. **不画深色外框**。之前那圈 CROWN_SHADE 方框正是「像贴纸」的元凶。
 */
function LeafBlock({
  leaf,
  size,
  selected,
  dimmed,
  highlighted,
  onSelect,
  onKeyDown,
}: {
  leaf: LeafLayout
  size: number
  selected: boolean
  dimmed: boolean
  highlighted: boolean
  onSelect: () => void
  onKeyDown: (e: KeyboardEvent<SVGGElement>) => void
}) {
  const half = size / 2
  const x = leaf.x - half
  const y = leaf.y - half
  const core = shade(leaf.color, 0.45)
  const coreSize = Math.max(3, Math.round(size * 0.4))
  const coreOff = Math.round((size - coreSize) / 2)
  const notch = Math.max(2, Math.round(size * 0.22))

  // 抖动光晕：**以方块中心为圆心的圆环**，越远越稀、越远越暗。
  // 这是「自然融入」的关键 —— 边缘不是一条硬线，也不是一圈方框，而是一格一格散开的。
  // 教训 1：用 max(dx,dy)（切比雪夫距离，即到外框的距离）算 → 出来是一圈**方点虚线框**，
  //         像贴纸描边。必须用**到中心的欧氏距离**，才会读成圆形光晕。
  // 教训 2：光晕外沿 ≤ LEAF_RING(4)，因为 tree-layout 的 footprintFits 只按 4px 留白校验；
  //         超出去会在树冠边缘的夜空上撒下几粒暗色方点。
  const halo: Array<{ x: number; y: number; far: boolean }> = []
  const ringPx = 2
  const cx = x + half
  const cy = y + half
  const reach = half + 4
  for (let px = x - 4; px <= x + size + 4; px += ringPx) {
    for (let py = y - 4; py <= y + size + 4; py += ringPx) {
      const dist = Math.hypot(px + ringPx / 2 - cx, py + ringPx / 2 - cy)
      if (dist <= half - 1 || dist > reach) continue
      const far = dist > half + 2
      const gi = Math.round((px - (x - 4)) / ringPx)
      const gj = Math.round((py - (y - 4)) / ringPx)
      // 近圈隔一格，外圈只留四分之一 —— 疏密就是像素画里的「渐隐」
      if (far) {
        if (gi % 2 !== 0 || gj % 2 !== 0) continue
      } else if ((gi + gj) % 2 !== 0) {
        continue
      }
      halo.push({ x: px, y: py, far })
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${leaf.date} 这篇日记`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className="cursor-pointer outline-none"
      opacity={dimmed ? 0.4 : 1}
    >
      {/* 抖动光晕：近圈暗一档、外圈再暗一档，棋盘格散开，读作「光渗进叶子里」 */}
      {halo.map((h, i) => (
        <rect
          key={`h${i}`}
          x={h.x}
          y={h.y}
          width={ringPx}
          height={ringPx}
          fill={shade(leaf.color, h.far ? -0.66 : -0.42)}
          shapeRendering="crispEdges"
        />
      ))}
      {/* 主体：纯色，不透明 */}
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        fill={leaf.color}
        shapeRendering="crispEdges"
      />
      {/* 切角：四角挖掉，方块变八边形 */}
      <rect x={x} y={y} width={notch} height={notch} fill={CROWN_BASE} shapeRendering="crispEdges" />
      <rect
        x={x + size - notch}
        y={y}
        width={notch}
        height={notch}
        fill={CROWN_BASE}
        shapeRendering="crispEdges"
      />
      <rect
        x={x}
        y={y + size - notch}
        width={notch}
        height={notch}
        fill={CROWN_BASE}
        shapeRendering="crispEdges"
      />
      <rect
        x={x + size - notch}
        y={y + size - notch}
        width={notch}
        height={notch}
        fill={CROWN_BASE}
        shapeRendering="crispEdges"
      />
      {/* 灯芯：居中偏上一档亮色 */}
      <rect
        x={x + coreOff}
        y={y + coreOff - 1}
        width={coreSize}
        height={coreSize}
        fill={core}
        shapeRendering="crispEdges"
      />
      {(selected || highlighted) && (
        <rect
          x={x - 6}
          y={y - 6}
          width={size + 12}
          height={size + 12}
          fill="none"
          stroke={selected ? SEL_RING : HIT_RING}
          strokeWidth={2}
          shapeRendering="crispEdges"
        />
      )}
    </g>
  )
}

export function MonthTree({
  entries,
  year,
  month,
  selectedDate,
  highlightedDates,
  onSelect,
}: MonthTreeProps) {
  const layout = useMemo(() => computeLayout(entries, year, month), [entries, year, month])
  const {
    width,
    height,
    trunkX,
    groundY,
    bottomY,
    ridgeBaseY,
    crown,
    trunkTopY,
    leaves,
    gaps,
    daysInMonth,
  } = layout

  const handleKey = (date: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(date)
    }
  }

  /* ── 静态画面：全部用确定性哈希生成，同一棵树每次都一样 ── */
  const scenery = useMemo(() => {
    // 三层山脊全部站在草甸线上，只是峰高不同：远山最高最浅、近山最矮最暗。
    // 这样山体从峰顶一路实心铺到草地，中间不会漏出天空；
    // 三层叠起来靠「越远越浅」拉开纵深（空气透视）。
    //
    // floorRatio（山脊最低高度比例）是关键修正：不设下限时峰间谷会降到地平线，
    // 天空最亮的色带从缺口漏出来变成斑驳亮块。真实山脉是连绵的。
    const far = buildMountainRange(width, groundY, 190, 2.4, 0.34)
    const mid = buildMountainRange(width, groundY, 142, 6.1, 0.3)
    const near = buildMountainRange(width, groundY, 96, 9.7, 0.26)

    const moonCX = width * 0.79
    const moonCY = 182
    const moonR = 54

    // 星点只铺在月亮以上的天空带里，且躲开月盘（否则白方块压在月亮上）
    const clearOfMoon = (x: number, y: number) =>
      Math.hypot(x - moonCX, y - moonCY) > moonR * 1.7

    return {
      sky: buildSkyBands(width, height, SKY_STOPS),
      /* 云：**整块删掉了**。参考图 j8eyw5 确实有大片云，但那是「柔和数字绘画」的云，
       * 转成 10px 硬边方块后就是几团淡紫糊在山脊上 —— 用户说的「脏」有它一份。
       * 天空交给星点和月亮，留白比塞云好看。 */
      far,
      mid,
      near,
      moon: buildMoon(moonCX, moonCY, moonR),
      craters: buildCraters(moonCX, moonCY, moonR, 7),
      moonCX,
      moonCY,
      moonR,
      /* 星点：数量减到 90。130 颗在 1160 宽的画面上像撒了把盐，
       * 参考图的星空是「小而疏」，靠留空显深。 */
      stars: buildStars(width, moonCY + moonR + PIXEL * 4, 90).filter((s) =>
        clearOfMoon(s.x, s.y),
      ),
      /* 左右压两棵近黑松树剪影：参考图最有效的构图手法，
       * 立刻有「站在林间往外看」的纵深。纯剪影零细节，不抢中间那棵树。 */
      pines: [
        ...buildPine(-20, groundY + PIXEL, 300, 8),
        ...buildPine(74, groundY + PIXEL, 196, 3),
        ...buildPine(width - 78, groundY + PIXEL, 178, 5),
        ...buildPine(width + 26, groundY + PIXEL, 268, 12),
      ],
      trunk: buildTrunk(trunkX, trunkTopY, groundY, 26),
      ground: buildGround(width, groundY, bottomY),
    }
  }, [width, height, groundY, bottomY, ridgeBaseY, trunkX, trunkTopY])

  /**
   * 叶子方块边长由布局层统一算（`layout.leafSize`），因为**放置叶子时就必须知道
   * 它有多大**：叶子连外描边要完整落在树冠里，否则会啃出缺口。
   * 这里不再自己算，只取用。
   */
  const leafSize = layout.leafSize

  /**
   * 间隔怎么标才不糊：草地上压一条虚线表示空档位置；
   * 只有「明显断更」（≥ 7 天）才额外挂一块小标牌，短空档靠虚线就够了。
   *
   * 为什么不一概挂牌子：一个月 8 篇日记就有 7 个空档，全挂会挤成一排互相压字。
   * 标牌放在草地**上方**（贴地悬着），不要画进泥土带 —— 泥土是深色，
   * 字压上去糊成一团；上面的位置背景是山影，深底金字才看得清。
   */
  const gapMarks = useMemo(() => {
    const dashY = groundY + PIXEL * 2
    const badgeY = groundY - 24
    const marks = gaps.map((g) => ({
      ...g,
      dashY,
      badgeY,
      showBadge: g.emptyDays >= 7,
      badgeX: 0,
    }))
    // 长空档可能不止一个，仍然做一次防重叠：按 x 排序后往右推到不重叠为止
    let lastX = -Infinity
    const minGap = 52
    for (const m of marks) {
      if (!m.showBadge) continue
      let x = Math.max(m.midX, lastX + minGap)
      // 别把标牌钉在树干上（树干那一坨是画面主体，字压上去很怪）：
      // 落在树干范围内就往一侧挪开，优先往空间大的一侧。
      if (Math.abs(x - trunkX) < 72) {
        const right = trunkX + 72
        const left = trunkX - 72
        x = right + 24 <= width - 26 ? right : left
      }
      m.badgeX = Math.min(width - 26, Math.max(26, x))
      lastX = m.badgeX
    }
    return marks
  }, [gaps, groundY, width, trunkX])

  /** 树冠分色：上亮下暗 + 迎光勾边，和叶子分开画。 */
  const crownTones = useMemo(() => {
    const lit: PixelRect[] = []
    const base: PixelRect[] = []
    const dark: PixelRect[] = []
    for (const r of crown.rows) {
      if (r.tone === 2) lit.push(r)
      else if (r.tone === 1) base.push(r)
      else dark.push(r)
    }
    return { lit, base, dark }
  }, [crown.rows])

  return (
    <div
      className="relative mx-auto w-full overflow-x-auto border-2 border-[var(--mc-outline)]"
      // 与 SVG 同宽居中：宽屏（max-w-6xl）下左右各留一条天空空白带很难看，
      // 所以外层也跟着限宽到设计宽度，让像素画自己居中。
      style={{ maxWidth: width, background: SKY_STOPS[0].color }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${year} 年 ${month} 月的森林`}
        preserveAspectRatio="xMidYMid meet"
        // 限宽 maxWidth=设计宽度：不加的话宽屏容器（max-w-6xl）会把图放大到 1000+ 宽，
        // 高度随之超出视口，底部草地被裁掉。
        // **不能加 maxHeight**：加了以后 svg 会缩到比外层 div 窄，左右各露出一条
        // 纯色背景带（因为天空是渐变的，背景色永远对不上），截图里就是一道竖边。
        style={{ display: 'block', width: '100%', maxWidth: width, margin: '0 auto' }}
      >
        {/* 天空：4 条硬边色阶（不插值） */}
        {scenery.sky.map((b, i) => (
          <rect
            key={`sky-${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.color}
            shapeRendering="crispEdges"
          />
        ))}
        {/* 天空不做抖动：10px 方块铺出来的棋盘格在这个尺度上读作「点状虚线」，
            不管铺几行都一样（3 行密度梯度的版本也试过，还是虚线）。
            硬边色阶本身就是正统像素画做法，4 条干净色阶够了。 */}

        {/* 星点：不透明纯色。之前用 opacity 0.28~0.88 随机淡出，
            结果一半星星是灰的（脏），而参考图的星要么在要么不在。 */}
        {scenery.stars.map((s, i) => (
          <rect
            key={`st-${i}`}
            x={s.x}
            y={s.y}
            width={s.size}
            height={s.size}
            fill={STAR}
            shapeRendering="crispEdges"
          />
        ))}

        {/* 月亮：像素圆 + 环形山。**没有柔光晕** ——
            之前那个 radialGradient 大圆是画面上最大的「脏」源，
            月亮的光感靠月盘本身够亮 + 周围天空够暗，不需要雾。 */}
        <Rects rects={scenery.moon.core} fill={MOON_BODY} />
        {scenery.craters.map((c, i) => (
          <rect
            key={`cr-${i}`}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            fill={MOON_CRATER}
            shapeRendering="crispEdges"
          />
        ))}

        {/* 云：已删。10px 硬边方块表现不出柔和云，只会糊在山脊上显脏。 */}

        {/* 三层山脊：越远越浅（空气透视），山脊线比山体亮一档。
            必须全在草地之前画：山脚落在草地线上，先画山再画草地，
            草地才能把山脚压住；顺序反了会看到一条浅色横带盖在草地上。 */}
        <Rects rects={scenery.far.body} fill={MOUNT_FAR.body} />
        <Rects rects={scenery.far.ridge} fill={MOUNT_FAR.ridge} />
        <Rects rects={scenery.mid.body} fill={MOUNT_MID.body} />
        <Rects rects={scenery.mid.ridge} fill={MOUNT_MID.ridge} />
        <Rects rects={scenery.near.body} fill={MOUNT_NEAR.body} />
        <Rects rects={scenery.near.ridge} fill={MOUNT_NEAR.ridge} />

        {/* 草甸：压在山脚之上。三段纯色，靠明度阶梯做纵深。 */}
        <Rects rects={scenery.ground.grass} fill={GROUND_BASE} />
        <Rects rects={scenery.ground.edge} fill={GROUND_TOP} />
        <Rects rects={scenery.ground.grassTop} fill={GROUND_TOP} />
        <Rects rects={scenery.ground.grassMid} fill={GROUND_SLOPE} />
        {/* 中景坡地的上缘亮边：buildGround 一直在算 crestTop，但这里从来没画过，
            所以坡地和草地只差两个色阶，画面下半部看着是一整块平涂。
            补上这条边，近处的地势起伏才可见（原本是「算出来但没接线」）。 */}
        <Rects rects={scenery.ground.crestTop} fill={GROUND_TOP} />
        <Rects rects={scenery.ground.dirt} fill={DIRT} />

        {/* 画面左右的近黑松树剪影：给画面加纵深 */}
        <Rects rects={scenery.pines} fill={BUSH} />

        {/* 树干：**柱身是直柱**（不收分）+ 底部三级台阶树根（压暗的裙摆）。
            用户 2026-11-01 的两次反馈合起来才是正解：先否掉「逐行收分」的层次
            （「直直的就行…你这层次做的真僵硬,不如直接不衔接了」），
            随后又指着树根截图说「这个树根保留」⇒ 柱子直、树根台阶留着。
            所以这里先画 roots（TRUNK_SHADE），柱身会盖住中间，只露出两侧台阶。
            粗细只由 `buildTrunk(..., halfWidth=26)` 决定。 */}
        <Rects rects={scenery.trunk.roots} fill={TRUNK_SHADE} />
        <Rects rects={scenery.trunk.body} fill={TRUNK_BASE} />
        <Rects rects={scenery.trunk.bark} fill={BARK} />

        {/* 树冠：上亮下暗三段 + 暗描边；整体压得很暗，把注意力留给叶子。
            没有逆光雾 —— 树冠的形体靠「枝间透光」和迎光勾边，不靠柔光。 */}
        <Rects rects={crownTones.dark} fill={CROWN_SHADE} />
        <Rects rects={crownTones.base} fill={CROWN_BASE} />
        <Rects rects={crownTones.lit} fill={CROWN_LIT} />
        <Rects rects={crown.edge} fill={CROWN_SHADE} />
        {/* 迎光勾边：月光从右上打过来，只有这一圈亮一档 */}
        {/* 树冠轮廓光（crown.rim）**删掉了**：给整圈外缘刷一道浅紫，
            放大看就是「给树勾了个线」，把剪影的实感全毁了。
            参考图里的树是纯剪影，边缘靠与背景的明度差自然分明。 */}

        {/* 叶子：发光的日记方块 */}
        {leaves.map((leaf) => (
          <LeafBlock
            key={leaf.date}
            leaf={leaf}
            size={leafSize}
            selected={selectedDate === leaf.date}
            dimmed={highlightedDates ? !highlightedDates.has(leaf.date) : false}
            highlighted={highlightedDates ? highlightedDates.has(leaf.date) : false}
            onSelect={() => onSelect(leaf.date)}
            onKeyDown={handleKey(leaf.date)}
          />
        ))}

        {/* 间隔：短空档只在地面压一段虚线，长空档才挂小牌子 */}
        {gapMarks.map((g, i) => (
          <g key={`gap-${i}`}>
            <line
              x1={g.fromX}
              y1={g.dashY}
              x2={g.toX}
              y2={g.dashY}
              stroke={GROUND_TOP}
              strokeWidth={PIXEL}
              strokeDasharray={`${PIXEL} ${PIXEL}`}
              shapeRendering="crispEdges"
            >
              <title>{g.label}</title>
            </line>
            {g.showBadge && (
              <>
                <rect
                  x={g.badgeX - 22}
                  y={g.badgeY}
                  width={44}
                  height={16}
                  fill={LABEL_BG}
                  stroke={HIT_RING}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={g.badgeX}
                  y={g.badgeY + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill={HIT_RING}
                >
                  {`空${g.emptyDays}天`}
                </text>
              </>
            )}
          </g>
        ))}

        {/* 空月：一块插在草地上的木牌，**居中放在树前面**。
            之前挪到树干左侧（trunkX-306），结果牌面正好盖在树冠左下角那片枝上，
            把整棵树咬掉一块 —— 空月本来就没叶子，树是画面唯一主体，不能挡。
            居中时牌在树干前方，深底不透明，读起来就是「立在树前的告示牌」。 */}
        {leaves.length === 0 && (
          <g>
            {(() => {
              const w = 196
              const h = 44
              /* 放在树干左侧、错开树的轴线 —— 之前居中时牌子正压在树干上，
               * 深底不透明的牌面把树干截成上下两段，读起来像树被劈开了。 */
              const x = Math.max(24, Math.round(trunkX - w - 60))
              /* 牌面整体下沉：底边压在草地上（groundY 下方 20px），
               * 立柱再从牌底扎到 groundY+70 —— 之前牌底正好贴 groundY，
               * 立柱只到地平线就断了，看起来像浮在空中。 */
              const y = groundY - h + 20
              const postBottom = groundY + 70
              const postX1 = x + 28
              const postX2 = x + w - 28
              return (
                <>
                  <rect x={postX1} y={y + h} width={8} height={postBottom - y - h} fill={TRUNK_SHADE} shapeRendering="crispEdges" />
                  <rect x={postX2} y={y + h} width={8} height={postBottom - y - h} fill={TRUNK_SHADE} shapeRendering="crispEdges" />
                  <rect x={x} y={y} width={w} height={h} fill={LABEL_BG} stroke={HIT_RING} strokeWidth={2} shapeRendering="crispEdges" />
                  <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fdf6e3">
                    本月还没有日记
                  </text>
                </>
              )
            })()}
          </g>
        )}

        {/* 角落统计：这个月写了几天（淡淡的，不抢主体） */}
        <text x={16} y={26} fontSize={12} fontWeight={700} fill="#6f6a92">
          {`${month} 月 · 写了 ${leaves.length}/${daysInMonth} 天`}
        </text>
      </svg>
    </div>
  )
}
