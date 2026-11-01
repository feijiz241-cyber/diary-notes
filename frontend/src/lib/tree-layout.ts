import type { Entry } from './db'
import { getMood } from './mood'
import { PIXEL, buildCrown, findCrownY, hash2, insideCrown, type CrownShape } from './tree-pixels'

export type { Entry }

export interface LeafLayout {
  date: string
  day: number
  /** 叶子方块中心 x（SVG 坐标，横向：日期越大越靠右） */
  x: number
  /** 叶子方块中心 y（SVG 坐标，落在树冠填充区内） */
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
  /** 标牌横向起止（画一条虚线段用） */
  fromX: number
  toX: number
}

export interface TreeLayout {
  leaves: LeafLayout[]
  gaps: GapLayout[]
  daysInMonth: number
  width: number
  height: number
  trunkX: number
  /** 树干顶端 y（埋在树冠内部，看不见） */
  trunkTopY: number
  /** 三层山脊的脚（≈52% 高度） */
  ridgeBaseY: number
  /** 草甸线：树站在这里（≈78% 高度） */
  groundY: number
  /** 画布底边 */
  bottomY: number
  crownCX: number
  crownCY: number
  crownRX: number
  crownRY: number
  /** 已光栅化的树冠（供渲染与叶子定位复用） */
  crown: CrownShape
  /** 叶子横向带的左右边界 */
  bandLeft: number
  bandRight: number
  /**
   * 叶子方块边长（偶数，像素格对齐）。
   * 由布局层统一算，因为**放置时就要知道它有多大**：
   * 叶子连同外描边必须完整落在树冠里，否则会啃出缺口（真实踩过）。
   */
  leafSize: number
}

/**
 * 画布尺寸与构图比例。
 *
 * 比例是**照参考图实测出来的**，不是估的（wallhaven-96glxd 1920×1080）：
 * - 地平线（山脚）在画面 **52%** 高度
 * - 月亮中心 **(79%, 28%)**、直径占画布高 **16.8%**
 * - 暗部（luma < 40）占全画面 **58%**
 *
 * 上一版把地平线放在 86%、树占满中间，所以用户说「画面比例不协调」——
 * 那是把风景画拍成了一张「树的特写」。
 *
 * 现在的三层结构：
 *   天空 0 ~ 47%（月亮、云、星）
 *   三层山脊 47% ~ 78%（空气透视：越远越浅越高）
 *   草甸 78% ~ 100%（树站在这里）
 */
const WIDTH = 1160
const HEIGHT = 650

/** 山脚线（三层山脊都站在这里，草甸压住山脚）。≈52% 高度 */
const RIDGE_BASE_Y = 340
/** 草甸线（树站在这里）。≈77% 高度 —— 再往下就只剩一条窄窄的前景带 */
const GROUND_H = 92

/* 树的比例：整棵树约占画面高度的 55%（360/650），宽度只占 34%。
 * 参考图里的树都是「画面里的一棵树」，不是「一棵树的画面」——
 * 上方要留大片天给月亮和星，左右要留出松树剪影的框。 */
const CROWN_RX = 188
const CROWN_RY = 188
/** 树冠中心 y */
const CROWN_CY = 252
/**
 * 树干顶端伸进树冠多深（相对 crownRY，从树冠底边往上量）。
 *
 * ⚠️ 这里出过一个真 bug（用户看到的是「树干这里还是有断层」）：
 * 原来写的是 `trunkTopY = groundY - TRUNK_VISIBLE_H`（从地面往上量 100px），
 * 算出 458，而树冠底边在 `crownCY + crownRY` = 415 —— **中间空出 43px**，
 * 山脊从这条缝里露出来，屏幕上看就是树冠和树干断成两截。
 * 根因是「树干长度」和「树冠位置」是两个独立常量，改任一个都会重新裂开。
 *
 * 现在改成从树冠底边往**上**量：树干顶端一定插进树冠内部，
 * 被树冠遮住（渲染顺序上树冠画在树干之后），怎么调树冠尺寸都不会再露缝。
 */
const TRUNK_TOP_INSET = 0.4

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

/** 把一个坐标吸到「像素格中心」，保证叶子方块与整棵树的像素网格对齐、且整块落在填充格内。 */
function snapCellCenter(v: number): number {
  return Math.floor(v / PIXEL) * PIXEL + PIXEL / 2
}

/** 某列是否至少有一个填充格（叶子要在有枝的地方发芽）。 */
function columnHasCrown(shape: CrownShape, col: number): boolean {
  if (col < 0 || col >= shape.cols) return false
  for (let row = 0; row < shape.rowsCount; row++) {
    if (shape.grid[row][col]) return true
  }
  return false
}

/**
 * 某一列在树冠里的纵向范围（top 是该列最上面那个填充格的上沿，
 * bottom 是最下面那个填充格的下沿）。列完全空时返回 null。
 *
 * 用途：叶子要在「这一列实际有树冠的高度」里分布，
 * 而不是在整个树冠的包围盒里分布 —— 锥形树冠的上部列很短，
 * 用包围盒会把叶子甩到树冠外面去。
 */
function crownColumnRange(
  crown: CrownShape,
  col: number,
): { top: number; bottom: number } | null {
  if (col < 0 || col >= crown.cols) return null
  let top = -1
  let bottom = -1
  for (let row = 0; row < crown.rowsCount; row++) {
    // 注意：crown.grid 是**二维**的（grid[row][col]），不是一维铺平。
    // 曾写成 grid[row * crown.cols + col]，那等于拿行号去索引二维数组，
    // 结果 top 恒为 0、bottom 只到第 1 行 —— 每列的可用范围被算成「只有顶上两行」，
    // 叶子于是全挤到树冠上部、并沿着塔形轮廓排成一条弧（真实踩过）。
    if (crown.grid[row][col]) {
      if (top < 0) top = row
      bottom = row
    }
  }
  if (top < 0) return null
  return {
    top: crown.origin.y + top * PIXEL,
    bottom: crown.origin.y + (bottom + 1) * PIXEL,
  }
}

/**
 * 核心时间逻辑（像素树版）。
 * - 整月 = 一棵用像素方块拼出来的大树（树冠 + 树干 + 树根 + 地面）
 * - 日记叶按「写日记的日期」横向排列：day1 在最左、月末在最右（时间逻辑）
 * - 每片叶子的 y 由日期哈希决定，再吸附到树冠内部最近的填充格 → 看起来是"长在树上"
 * - 相邻两篇之间若隔了空白天，生成间隔标牌
 */
export function computeLayout(entries: Entry[], year: number, month: number): TreeLayout {
  const dim = daysInMonth(year, month)
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))

  const trunkX = WIDTH / 2
  const ridgeBaseY = RIDGE_BASE_Y
  const groundY = HEIGHT - GROUND_H
  const crownCX = trunkX
  const crownCY = CROWN_CY
  const crownRX = CROWN_RX
  const crownRY = CROWN_RY
  const crown = buildCrown(crownCX, crownCY, crownRX, crownRY)

  // 树干顶端插进树冠内部（从树冠底边往**上**量），保证永远被树冠盖住、不会露缝。
  // 详见 TRUNK_TOP_INSET 的注释：原来从地面往上量，和树冠底边差了 43px。
  const trunkTopY = crownCY + crownRY - crownRY * TRUNK_TOP_INSET
  // 叶子横向带：树冠横向铺得比 trunkX±rx*0.74 更宽（松枝最外沿约 rx*1.0），
  // 带子太窄的话月初月末的叶子永远长不到最外那两根长枝上，全挤在中间。
  // 叶子横向铺开范围。别用满整个树冠宽（0.86 太宽）：
  // 树冠是塔形，越靠外的列实心段越短，叶子被 findCrownY 吸附后就全贴到底部，
  // 横向一铺开就成了「一条斜线」。收到 0.62 后所有列都在树冠中段，
  // 纵向可用空间足够，y 才铺得开。
  // 叶子多的时候横向带要更宽，否则相邻日期的 x 只差 8px，方块必然互相压住。
  // 8 篇时 0.62 够用（间距 36px）；31 篇时要放到 0.9（间距 12px）。
  const bandScale = Math.max(0.62, Math.min(0.9, 0.62 + (sorted.length - 8) * 0.012))
  const bandLeft = crownCX - crownRX * bandScale
  const bandRight = crownCX + crownRX * bandScale

  /**
   * 叶子方块边长。两个约束互相拉扯：
   *
   * 1. **不能太大**（用户两次说「光点做小一点」）。上一版 8 篇时算到 32px，
   *    在 1160 宽的画布上是一块 32×32 的色板，像贴纸，不像树上的灯。
   *    现在封顶 22、常见 12~18。
   * 2. **不能太小**（小于 10 就和夜空里的星点分不开，读不成「灯」）。
   *
   * 另外必须**连外描边一起**塞得进树冠，所以实际占位是 size + 2*RING，
   * 放置叶子时按这个占位留白（见下面的 LEAF_RING）。
   */
  const leafSize = (() => {
    if (sorted.length <= 1) return 22
    const hGap = (bandRight - bandLeft) / Math.max(1, sorted.length - 1)
    // 纵向：树冠里实际能排几行。31 篇时横向只有 12px，光看横向不够。
    const vGap = (crownRY * 2) / Math.max(2, Math.min(11, Math.ceil(sorted.length / 5)))
    const gap = Math.min(hGap, vGap)
    // 下限 10：树冠改窄变高之后（188×188、18 层）列间更紧，
    // 再小就和夜空星点分不开、也不好点。与 tests 里「10~22」的断言一致。
    const raw = Math.max(10, Math.min(22, gap * 0.8))
    return Math.max(10, Math.round(raw / 2) * 2)
  })()

  /** 叶子外圈（把光点「长」进树里的那一层）相对方块的溢出量，必须与 MonthTree 一致。 */
  const LEAF_RING = 4

  // 叶子位置：贪心二维布点。
  //
  // 演进过程（每一版的失败现象都记下来，别再走回去）：
  // ① 纯哈希定 y → 31 篇时聚堆（挤左下、右上空着）。
  // ② 「每列分档位」（usedSlots）→ 铺满了，但**排成一条斜线**：
  //    x 是日期的线性函数，y 又被限制在「该列实心段」里，
  //    树冠是塔形 → 靠边的列实心段短 → y 只能贴底 → 成了 y = f(x)。
  // ③ 现在：横向 x 仍按日期（时间逻辑不能破），纵向**逐个避让已放好的叶子**。
  //    每片叶子沿本列从哈希起点开始找第一个「四周留白」的位置，
  //    找不到就取碰撞最轻的。这样既不重叠，也不会排成直线。
  //
  /**
   * 整块叶子（含外描边）是否完整落在树冠里。
   *
   * 为什么要查：用户看到「树怎么有缺块」，其中一半是叶子啃出来的 ——
   * 叶子中心在树冠内，但方块连外圈有 size/2 + 4 的半径，
   * 靠边的叶子四个角会探到树冠轮廓之外，近黑的树冠上就出现一个个方口子。
   * 这里查 9 个点（四角 + 四边中点 + 中心），比只查中心严格得多。
   */
  const half = leafSize / 2 + LEAF_RING
  const footprintFits = (px: number, py: number): boolean => {
    for (const dx of [-half, 0, half]) {
      for (const dy of [-half, 0, half]) {
        if (!insideCrown(crown, px + dx, py + dy)) return false
      }
    }
    return true
  }

  /**
   * 两片叶子「连同光晕」不互相压住，中心距（切比雪夫）至少要这么大。
   *
   * ⚠️ 这里错过一次（用户截图指出「这里不是有点挤在一起了吗」）：
   * 第一版写成 `leafSize / 2 + LEAF_RING`（= 9），那是**一片叶子自己的半宽**，
   * 拿它当两片叶子的最小间距等于把判据缩小了一半 —— 代码认为「不重叠」，
   * 屏幕上两团光晕照样糊成一颗。正确值是 `leafSize + 2 * LEAF_RING`：
   * 每片叶子从中心到光晕外沿是 `size/2 + RING`，两片加起来就是 `size + 2*RING`。
   */
  const need = leafSize + LEAF_RING * 2
  const step = PIXEL * 2
  /** 允许横向挪几格去找空位（10 格 = 50px，画布宽度的 4.3%）。 */
  const OFFSET_CELLS = 10

  interface Spot {
    x: number
    y: number
  }

  /** 到最近一片已放叶子的切比雪夫距离（方块是方的，用 max(|dx|,|dy|) 判压不压住）。 */
  const nearestOf = (spot: Spot, others: Spot[]): number => {
    let near = Infinity
    for (const p of others) {
      const d = Math.max(Math.abs(p.x - spot.x), Math.abs(p.y - spot.y))
      if (d < near) near = d
    }
    return near
  }

  /**
   * 给一片叶子找落点：本列所有可落的 y + 左右各挪 1~OFFSET_CELLS 格的可落点。
   *
   * 选择顺序 = ① 能不能和已放叶子拉开 `need`（满足就压过一切）② 离已放叶子多远
   * （最远点采样，避免全挤在树冠中下部）③ 同分留在本列，尽量保住「x 表示日期」的读法。
   */
  const scanSpot = (baseX: number, h: number, others: Spot[]): Spot => {
    let best: Spot = {
      x: baseX,
      y: snapCellCenter(findCrownY(crown, baseX, crownCY) ?? crownCY),
    }
    let bestScore = -Infinity
    for (let offset = 0; offset <= OFFSET_CELLS; offset++) {
      for (const k of offset === 0 ? [0] : [offset, -offset]) {
        const candX = snapCellCenter(baseX + k * PIXEL)
        const colRange = crownColumnRange(
          crown,
          Math.floor((candX - crown.origin.x) / PIXEL),
        )
        if (!colRange) continue
        const count = Math.max(
          1,
          Math.floor((colRange.bottom - colRange.top - PIXEL) / step) + 1,
        )
        // 起点用强混合哈希打散，保证同日期同结果、且不跟 x 相关
        const startIdx = Math.floor(hash2(h, 31) * count) % count
        for (let q = 0; q < count; q++) {
          const idx = (startIdx + q) % count
          const seedY = snapCellCenter(colRange.top + PIXEL / 2 + idx * step)
          const found = findCrownY(crown, candX, seedY)
          if (found === null) continue
          const candY = snapCellCenter(found)
          if (!footprintFits(candX, candY)) continue

          const near = nearestOf({ x: candX, y: candY }, others)
          const ok = near >= need
          // 分两档：能满足 `need` 的候选优先（1e6），档内**优先不挪**（每个 -2），
          // 档外则比「离最近叶子多远 − 挪动代价」。这样稀疏月份不会为了「更匀」把叶子甩到 50px 外。
          const score =
            others.length === 0
              ? hash2(h, 53) - Math.abs(k) * 2
              : (ok ? 1e6 : 0) - Math.abs(k) * 2 + Math.min(near, need) * (ok ? 0.001 : 1)
          if (score > bestScore) {
            bestScore = score
            best = { x: candX, y: candY }
          }
        }
      }
    }
    return best
  }

  const leaves: LeafLayout[] = []

  {
    // ① 每片叶子先按日期算一个基准列；列落在树冠外（塔形上部很窄）→ 找最近的有填充的列。
    const items = sorted.map((e) => {
      const day = dayOf(e.date)
      const t = dim <= 1 ? 0.5 : (day - 1) / (dim - 1)
      let baseX = snapCellCenter(bandLeft + t * (bandRight - bandLeft))
      if (!columnHasCrown(crown, Math.floor((baseX - crown.origin.x) / PIXEL))) {
        const homeCol = Math.floor((baseX - crown.origin.x) / PIXEL)
        for (let s = 1; s <= crown.cols; s++) {
          if (columnHasCrown(crown, homeCol + s)) {
            baseX = crown.origin.x + (homeCol + s) * PIXEL + PIXEL / 2
            break
          }
          if (columnHasCrown(crown, homeCol - s)) {
            baseX = crown.origin.x + (homeCol - s) * PIXEL + PIXEL / 2
            break
          }
        }
      }
      return { e, day, baseX, h: hashDate(e.date) }
    })

    // ② 按日期顺序贪心放一遍（后来的叶子往空处推）。
    const spots: Spot[] = []
    for (const it of items) spots.push(scanSpot(it.baseX, it.h, spots))

    // ③ 松弛三轮：轮流把每片叶子「从板上拿下来」，在其余叶子都摆好的前提下重新找位置。
    //
    // 为什么还要这一步（2026-11-01 实测）：贪心按日期顺序放，写到月末那几片时
    // 好位置已经被占，31 篇时会剩 3~4 对光晕相碰 —— 而几何上完全放得下（31 片 × 18px 只占树冠一小块）。
    // 让每片叶子都有机会「看着全体重来一次」，就能把这几对解开。
    // 只在「离最近叶子更远」时才接受（严格变好），同分保留原位，保证结果是确定的。
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < items.length; i++) {
        const others = spots.filter((_, j) => j !== i)
        // 每轮给哈希起点加一点偏移，否则同样的输入永远算出同样的位置
        const cand = scanSpot(items[i].baseX, items[i].h + pass * 7919, others)
        if (nearestOf(cand, others) > nearestOf(spots[i], others) + 1e-9) {
          spots[i] = cand
        }
      }
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const mood = getMood(it.e.mood)
      leaves.push({
        date: it.e.date,
        day: it.day,
        x: spots[i].x,
        y: spots[i].y,
        color: mood?.color ?? '#9CB86A',
        moodId: it.e.mood ?? null,
      })
    }
  }

  const gaps: GapLayout[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = dayOf(sorted[i].date)
    const b = dayOf(sorted[i + 1].date)
    if (b - a > 1) {
      const emptyDays = b - a - 1
      const ta = dim <= 1 ? 0.5 : (a - 1) / (dim - 1)
      const tb = dim <= 1 ? 0.5 : (b - 1) / (dim - 1)
      const fromX = bandLeft + ta * (bandRight - bandLeft)
      const toX = bandLeft + tb * (bandRight - bandLeft)
      gaps.push({
        fromDay: a,
        toDay: b,
        emptyDays,
        label: `空 ${emptyDays} 天（${month}月${a + 1}–${b - 1}日）`,
        midX: (fromX + toX) / 2,
        midY: groundY - 30,
        fromX,
        toX,
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
    trunkTopY,
    ridgeBaseY,
    groundY,
    bottomY: HEIGHT,
    crownCX,
    crownCY,
    crownRX,
    crownRY,
    crown,
    bandLeft,
    bandRight,
    leafSize,
  }
}
