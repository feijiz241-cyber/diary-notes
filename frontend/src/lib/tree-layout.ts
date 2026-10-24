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
const CROWN_RX = 215
const CROWN_RY = 145
/** 树冠中心 y */
const CROWN_CY = 270
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
    const raw = Math.max(8, Math.min(22, gap * 0.8))
    return Math.max(6, Math.round(raw / 2) * 2)
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
  // LEAF_GAP 只用来给「第一片叶子」一个哈希起点扰动，
  // 后续叶子靠最远点采样自然分开，不硬性规定最小间距。
  const LEAF_GAP = 16
  const placed: Array<{ x: number; y: number }> = []

  /**
   * 整块叶子（含外描边）是否完整落在树冠里。
   *
   * 为什么要查：用户看到「树怎么有缺块」，其中一半是叶子啃出来的 ——
   * 叶子中心在树冠内，但方块连外圈有 size/2 + 4 的半径，
   * 靠边的叶子四个角会探到树冠轮廓之外，近黑的树冠上就出现一个个方口子。
   * 这里查 9 个点（四角 + 四边中点 + 中心），比只查中心严格得多。
   */
  const footprintFits = (x: number, y: number, half: number): boolean => {
    for (const dx of [-half, 0, half]) {
      for (const dy of [-half, 0, half]) {
        if (!insideCrown(crown, x + dx, y + dy)) return false
      }
    }
    return true
  }

  const leaves: LeafLayout[] = sorted.map((e) => {
    const day = dayOf(e.date)
    const t = dim <= 1 ? 0.5 : (day - 1) / (dim - 1)
    const rawX = bandLeft + t * (bandRight - bandLeft)
    let x = snapCellCenter(rawX)

    // 该列可能落在树冠外（塔形上部很窄）→ 向两侧找最近的有填充的列。
    if (!columnHasCrown(crown, Math.floor((x - crown.origin.x) / PIXEL))) {
      for (let step = 1; step <= crown.cols; step++) {
        const leftCol = Math.floor((x - crown.origin.x) / PIXEL) - step
        const rightCol = Math.floor((x - crown.origin.x) / PIXEL) + step
        if (columnHasCrown(crown, rightCol)) {
          x = crown.origin.x + rightCol * PIXEL + PIXEL / 2
          break
        }
        if (columnHasCrown(crown, leftCol)) {
          x = crown.origin.x + leftCol * PIXEL + PIXEL / 2
          break
        }
      }
    }

    const h = hashDate(e.date)
    const half = leafSize / 2 + LEAF_RING

    // 候选 y：本列实心段内每 2 格一个位置（步长 PIXEL*2 = 10px）
    const step = PIXEL * 2

    /**
     * 在某一列里挑一个「离已放叶子最远、且整块塞得进树冠」的 y。
     * 返回 null 表示这一列从头到尾都塞不下（树冠在这一列太薄）。
     */
    const pickY = (cx0: number): number | null => {
      const colIdx = Math.floor((cx0 - crown.origin.x) / PIXEL)
      const colRange = crownColumnRange(crown, colIdx)
      if (!colRange) return null
      const top = colRange.top
      const bottom = colRange.bottom
      const count = Math.max(1, Math.floor((bottom - top - PIXEL) / step) + 1)
      // 起点用强混合哈希打散，保证同日期同结果、且不跟 x 相关
      const startIdx = Math.floor(hash2(h, 31) * count) % count

      let bestY: number | null = null
      let bestScore = -Infinity
      for (let k = 0; k < count; k++) {
        const idx = (startIdx + k) % count
        const candY = snapCellCenter(top + PIXEL / 2 + idx * step)
        const found = findCrownY(crown, cx0, candY)
        if (found === null) continue
        const y = snapCellCenter(found)
        if (!footprintFits(cx0, y, half)) continue

        // 到最近一片已放叶子的距离（欧氏）；没有已放叶子时用哈希决定起点
        let nearest = Infinity
        for (const q of placed) {
          const d = Math.hypot(q.x - cx0, q.y - y)
          if (d < nearest) nearest = d
        }
        if (nearest === Infinity) nearest = hash2(h, 53) * LEAF_GAP * 2
        const score = nearest + hash2(h, 59) * 0.01
        if (score > bestScore) {
          bestScore = score
          bestY = y
        }
      }
      return bestY
    }

    // 最远点采样：本列所有候选 y 都试一遍，挑「离已放叶子最远」的那个。
    // 之前是「挑第一个不碰撞的位置」，结果叶子全挤在最先试到的地方（树冠中下部），
    // 上半截空着、下半截一串阶梯。最远点采样天然会把后来的叶子往空处推。
    //
    // 若本列整块塞不下（塔形树冠边缘的列很薄），就按「离树冠中线由近到远」的
    // 顺序往内挪一格再试 —— 时间逻辑靠 x 体现，挪一两格（10~20px）不影响读图。
    let bestY = pickY(x)
    if (bestY === null) {
      const dir = x < crownCX ? 1 : -1
      for (let k = 1; k <= 12 && bestY === null; k++) {
        const candX = snapCellCenter(x + dir * k * PIXEL)
        if (!columnHasCrown(crown, Math.floor((candX - crown.origin.x) / PIXEL))) continue
        const y = pickY(candX)
        if (y !== null) {
          x = candX
          bestY = y
        }
      }
    }
    if (bestY === null) {
      // 兜底：理论上到不了这里（树冠中段一定塞得下）。真到了就贴树冠中线。
      bestY = snapCellCenter(findCrownY(crown, crownCX, crownCY) ?? crownCY)
    }

    placed.push({ x, y: bestY })

    const mood = getMood(e.mood)
    return {
      date: e.date,
      day,
      x,
      y: bestY,
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
