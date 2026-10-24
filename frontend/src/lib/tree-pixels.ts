/**
 * 像素画的几何光栅化。
 *
 * 森林页那幅画是「真·像素方块」风格：所有形状先落到 PIXEL 大小的格子上，
 * 再按行/按列合并成矩形交给 SVG 画。好处是轮廓天然带阶梯感（就是像素画的样子），
 * 而 SVG 节点数是「段数」量级而不是「格子数」量级。
 *
 * 本文件全部是纯函数 + 确定性哈希：同一棵树每次都画出一样的结果。
 */

/** 一个像素格的边长（SVG 用户单位）。改这里 = 整体缩放像素粗细。 */
export const PIXEL = 5

/** 椭圆团块：树冠由若干椭圆团并集而成，比单个圆更有「一团团鼓起」的轮廓。 */
export interface Clump {
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PixelSpeck {
  x: number
  y: number
  size: number
  lighter: boolean
}

/** 带颜色的矩形（天空色阶用）。 */
export interface ColorBand extends PixelRect {
  color: string
}

/** 树冠的一行：tone 2=受光 / 1=基础 / 0=背光，用来做由上到下的体积感。 */
export interface CrownRow extends PixelRect {
  tone: 0 | 1 | 2
}

export interface CrownShape {
  /** 按行合并后的填充矩形（画树冠用） */
  rows: CrownRow[]
  /** 轮廓格：贴着外边的一圈（压暗画出像素描边） */
  edge: PixelRect[]
  /** 迎光边的格（右上侧），用来点一道月光勾边 */
  rim: PixelRect[]
  /** 确定性噪点格（模拟像素画里的叶块深浅） */
  texture: PixelSpeck[]
  /** 网格：grid[row][col] 表示该格是否在树冠内 */
  grid: boolean[][]
  /** 网格原点（第 0 行第 0 列的左上角） */
  origin: { x: number; y: number }
  cell: number
  /** 网格尺寸 */
  cols: number
  rowsCount: number
}

/** 确定性 2D 哈希，返回 [0, 1)。 */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** 十六进制色：amount > 0 提亮、< 0 压暗，取值 -1 ~ 1。 */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const t = amount > 0 ? 255 : 0
    const v = Math.round(c + (t - c) * Math.abs(amount))
    return Math.max(0, Math.min(255, v))
  })
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** 两个十六进制色按 t∈[0,1] 线性插值。 */
export function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h)
    const n = m ? parseInt(m[1], 16) : 0
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const k = Math.max(0, Math.min(1, t))
  const ch = [ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k].map((c) =>
    Math.max(0, Math.min(255, Math.round(c))),
  )
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 天空：横向切成 PIXEL 高的色带，每条带**直接取色板里的一个色**，绝不插值。
 *
 * 这是「像素画 vs 假像素画」的分水岭。早期版本把 5 个色标插值成 65 条带，
 * 看上去像平滑渐变 —— 那是 CSS 渐变，而且插出来的中间色全是脏灰紫，
 * 整片天糊成一层雾。真像素画只用色板里那十来个色，靠「色阶跳变 + 交界抖动」
 * 表现过渡（参考图 j8eyw5 就是这么干的）。
 *
 * 所以这里取「最后一个 offset <= t 的色标」，得到硬边色带；
 * 交界处的柔和过渡交给 buildSkyDither 用两色棋盘格补。
 */
export function buildSkyBands(
  width: number,
  height: number,
  stops: Array<{ offset: number; color: string }>,
): ColorBand[] {
  const cell = PIXEL
  const bands: ColorBand[] = []
  const rows = Math.ceil(height / cell)
  for (let row = 0; row < rows; row++) {
    const y = row * cell
    const t = (y + cell / 2) / height
    let color = stops[0].color
    for (const s of stops) {
      if (s.offset <= t) color = s.color
    }
    bands.push({ x: 0, y, w: width, h: Math.min(cell, height - y), color })
  }
  return bands
}

/**
 * 树冠团块布局：**一整棵实心的针叶树**，边缘有层次但不分叉。
 *
 * 用户明确要求：「树其实可以做成一颗整体的，不用做那么多分支」。
 * 之前做过 6 层左右分开的枝（枝间留大片天空），辨识上是老松，
 * 但缩小到森林页的实际显示尺寸后，分开的枝读成「几根横条」，
 * 树冠不成一个形。所以改回实心整体轮廓。
 *
 * 做法：把树冠当成一个**剪影**来做，而不是一叠椭圆。
 * 对每一行算「这一行该有多宽」，宽度由两段轮廓拼成：
 * - 上段（t: 0 → 0.88）：`rx * (t/0.88)^0.85` —— 锥形，上部收得快
 * - 下段（t: 0.88 → 1）：`rx * sqrt(1 - ((t-0.88)/0.12)^2)` —— **圆弧收底**
 *
 * 为什么要圆弧收底（这一版的关键修正）：只用单一锥形时，最下面一层
 * 是整棵树冠最宽的一层，它的下沿是一条**水平直线**，在画面上读成
 * 树冠底下横着一块「裙板/盘子」（放大截图里非常明显）。
 * 让最后 12% 的高度按圆弧收窄，底缘就是圆的了。
 *
 * 再叠两条低频正弦让半宽不呈等差 —— 等差就是「圣诞树台阶」。
 * 每行左右各甩一个小团，边缘才参差。
 */
export function crownClumps(cx: number, cy: number, rx: number, ry: number): Clump[] {
  const clumps: Clump[] = []
  const tiers = 11
  const topY = cy - ry
  const span = ry * 2
  // 最宽点落在 t=0.72（约七成高），之后收底。
  //
  // 之前是 0.88：树冠最宽处几乎贴着底边，下缘于是横出一条又长又平的边，
  // 看着像树冠坐在一块板子上（截图里就是「裙边/托盘」）。上移到 0.72 后
  // 底部有了收拢的弧度，才像一丛树枝自然垂下来。
  const WIDEST = 0.84

  /** 这一行（t: 0 顶 → 1 底）的半宽。 */
  const halfAt = (t: number): number => {
    let w: number
    if (t <= WIDEST) {
      // 指数 0.58：同样高度下更早变宽，轮廓从「窄尖锥」变成「圆润塔形」。
      // 这不只是好看：锥形太尖时，靠边的列只有最底部一小段是实心的，
      // 叶子落在那些列就只能贴地排，横向一铺开就成斜线（真实踩过）。
      w = Math.pow(t / WIDEST, 0.58)
    } else {
      // 收底用椭圆弧，但只收到 0.45 而不是 0：
      // 收到 0 会让最下面一行缩成一个点，树冠底部出现「尖屁股」，
      // 和树干接不上。留 0.45 让底缘是一条略宽的短边，被树干挡住。
      const k = (t - WIDEST) / (1 - WIDEST)
      // 收到 0.16：底行只剩 ~35px 宽的窄颈，正好被树干（半宽 20）挡住。
      // 之前留 0.34~0.5 时底行还有 70~105px 宽，屏幕上就是一条平直横边。
      w = 0.16 + 0.84 * Math.sqrt(Math.max(0, 1 - k * k))
    }
    // 低频起伏：破等差，避免圣诞树台阶
    const wobble = Math.sin(t * Math.PI * 2.3 + 0.7) * 0.05 + Math.sin(t * Math.PI * 4.1) * 0.028
    return rx * Math.min(1, Math.max(0.06, w + wobble))
  }

  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const y = topY + t * span
    // 半高略大于行距的一半，相邻行才叠成实心（行距 = span/(tiers-1)）
    const bandRy = (span / (tiers - 1)) * 0.66

    // 左右不对称：各给一个扰动，别让树像镜像出来的
    const jL = 1 + (hash2(i, 91) - 0.5) * 0.13
    const jR = 1 + (hash2(i, 97) - 0.5) * 0.13
    const wl = halfAt(t) * jL
    const wr = halfAt(t) * jR
    clumps.push({ cx: cx - wl * 0.32, cy: y, rx: wl * 0.68, ry: bandRy })
    clumps.push({ cx: cx + wr * 0.32, cy: y, rx: wr * 0.68, ry: bandRy })

    // 左右各甩一个小团：让边缘是参差的针叶尖，不是直尺。
    //
    // 参数是三次试错调出来的（截图对照）：
    // ① rx*0.05~0.12 的小团 + 甩到 0.88~1.04 倍宽处 → 每层左右都鼓出一个尖，
    //    11 层排下来是「一排整齐的小翅膀」，树看着像被锯了边。
    // ② 只在哈希通过时才甩（概率 ~55%），且尺寸/位置都放大范围 → 参差自然。
    // ③ 底部三行完全不甩：那里甩出去就是裙边，树冠会横出一个底盘。
    if (t < 0.78 && hash2(i, 61) < 0.55) {
      for (const side of [-1, 1] as const) {
        const w = side < 0 ? wl : wr
        const tipRx = rx * (0.04 + hash2(i * 5 + side, 79) * 0.1)
        // 关键钳制：侧团的外缘（偏移 + 自身半径）不能超过本行半宽。
        // 不钳的话偏移能到 1.04w、半径再加 0.14rx，合起来 1.17rx 冲出轮廓，
        // 树冠两侧就鼓出一排「小翅膀」（截图里很明显）。
        const wantOut = w * (0.82 + hash2(i, side + 71) * 0.22)
        const maxOut = Math.max(0, w * 1.02 - tipRx)
        clumps.push({
          cx: cx + side * Math.min(wantOut, maxOut),
          cy: y + bandRy * (0.05 + hash2(i * 3 + side, 73) * 0.5),
          rx: tipRx,
          ry: ry * (0.025 + hash2(i * 7 + side, 83) * 0.05),
        })
      }
    }
  }

  // 底部垂枝：树冠底缘必须是参差的，不能是一条平直的横线。
  //
  // 只靠 tier 循环做不出来：11 层里最下面一层是一条宽度 ~0.5rx 的扁椭圆，
  // 它的底边就是一条直线，截图里树冠像坐在一块板子上。
  // 这里沿底缘撒一丛丛小枝，各自下垂不同深度，把底边打成锯齿。
  //
  // ⚠️ 这里出过一个真 bug（用户看到的是「树怎么有缺块」）：
  // 原来 13 丛铺在 1.8rx 宽上（间距 0.138rx），而每丛 rx 只有 0.06~0.13rx
  // （直径 0.12~0.26rx）—— 间距大于直径，相邻丛之间就断开；
  // 更糟的是 drop 上限算到 0.22ry，而丛自身 ry 只有 0.05~0.11ry，
  // 丛顶跑到主体底缘下方，整丛直接脱开，屏幕上就是树冠底下一串漂浮的黑块。
  // 现在：丛数加密到 23、间距 0.078rx 保证相邻重叠、drop 上限压到丛自身高度以内，
  // 让每丛都牢牢「挂」在主体底边上，只把下缘打出锯齿。
  const bottomY = topY + span
  const fringeCount = 23
  for (let i = 0; i < fringeCount; i++) {
    const u = (i + 0.5) / fringeCount // 0..1 横向位置
    const x = cx + (u * 2 - 1) * rx * 0.94
    // 中间垂得深、两侧浅一点（底缘整体是弧，但局部是锯齿）
    const arc = 1 - Math.pow(Math.abs(u * 2 - 1), 1.5)
    const frx = rx * (0.075 + hash2(i, 103) * 0.055)
    const fry = ry * (0.055 + hash2(i, 107) * 0.045)
    // 下垂量必须小于「丛自身半高 + 丛心相对底边的抬高量」，
    // 否则丛顶掉到主体下面 = 缺块。抬高量是 ry*0.1，所以上限 ≈ fry + ry*0.1。
    const maxDrop = fry + ry * 0.1 - ry * 0.02
    const wantDrop = ry * (0.02 + arc * 0.11) * (0.55 + hash2(i, 101) * 0.9)
    clumps.push({
      cx: x,
      cy: bottomY - ry * 0.1 + Math.min(wantDrop, maxDrop),
      rx: frx,
      ry: fry,
    })
  }

  // 树顶尖：没有它顶部是一个圆头，针叶树的尖顶是辨识特征。
  // 光一个尖会像插了根杆子，左右各补一个小团收出「尖 → 稍宽 → 更宽」的层次。
  clumps.push({ cx, cy: topY - ry * 0.04, rx: rx * 0.13, ry: ry * 0.09 })
  clumps.push({ cx: cx - rx * 0.055, cy: topY + ry * 0.07, rx: rx * 0.1, ry: ry * 0.07 })
  clumps.push({ cx: cx + rx * 0.06, cy: topY + ry * 0.09, rx: rx * 0.095, ry: ry * 0.075 })
  return clumps
}

/** 点是否落在任一椭圆团内。 */
export function insideClumps(clumps: Clump[], x: number, y: number): boolean {
  for (const c of clumps) {
    const dx = (x - c.cx) / c.rx
    const dy = (y - c.cy) / c.ry
    if (dx * dx + dy * dy <= 1) return true
  }
  return false
}

/**
 * 树冠的一行：直接读「叶簇网格」切段。
 * 相邻格 tone 不同就断开，渲染出来是一簇一簇的方块。
 */
function crownRowSegments(
  row: number,
  cols: number,
  grid: boolean[][],
  clusterGrid: Array<Array<0 | 1 | 2 | -1>>,
  originX: number,
  originY: number,
  cell: number,
): CrownRow[] {
  const y = originY + row * cell
  const out: CrownRow[] = []
  let start = -1
  for (let col = 0; col <= cols; col++) {
    const filled = col < cols && grid[row][col]
    if (filled && start < 0) start = col
    if (!filled && start >= 0) {
      let segStart = start
      let segTone = clusterGrid[row][segStart]
      for (let c = start + 1; c <= col; c++) {
        const next = c < col ? clusterGrid[row][c] : -1
        if (next !== segTone) {
          out.push({
            x: originX + segStart * cell,
            y,
            w: (c - segStart) * cell,
            h: cell,
            tone: segTone === -1 ? 0 : segTone,
          })
          segStart = c
          segTone = next
        }
      }
      start = -1
    }
  }
  return out
}

/**
 * 把椭圆并集光栅化成像素格，再按行合并成矩形。
 * - 每行的连续填充格合并成一条 rect → 节点数 = 段数，不是格子数
 * - tone 按「靠上受光、靠下背光」分配
 * - 撒一层确定性噪点，让叶块有深浅变化（像素画的典型手法）
 * - 内部再挖几处透光孔：轮廓中间露出天空，才像「一团团树叶」而不是实心球
 */
export function buildCrown(cx: number, cy: number, rx: number, ry: number): CrownShape {
  const clumps = crownClumps(cx, cy, rx, ry)
  const cell = PIXEL

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const c of clumps) {
    minX = Math.min(minX, c.cx - c.rx)
    maxX = Math.max(maxX, c.cx + c.rx)
    minY = Math.min(minY, c.cy - c.ry)
    maxY = Math.max(maxY, c.cy + c.ry)
  }

  const originX = Math.floor(minX / cell) * cell
  const originY = Math.floor(minY / cell) * cell
  const cols = Math.ceil((maxX - originX) / cell)
  const rowsCount = Math.ceil((maxY - originY) / cell)

  const grid: boolean[][] = []
  for (let row = 0; row < rowsCount; row++) {
    const line: boolean[] = []
    for (let col = 0; col < cols; col++) {
      const px = originX + col * cell + cell / 2
      const py = originY + row * cell + cell / 2
      line.push(insideClumps(clumps, px, py))
    }
    grid.push(line)
  }

  // ── 明暗：形状由松枝负责，树冠内部就该是**一整块近黑**（参考图实测 p50=14/255）。
  // 教训链：
  // ① 按 2×2 格撒 ±1 抖动 → 缩放后是迷彩脏斑
  // ② 三档色差只有 2~3 个色阶时，任何内部噪点都只会变脏
  // 剪影的层次靠「边缘受光」（rim）和「枝间透光」，不靠内部噪点。
  // 所以现在 tone 只按「枝层」分：靠上的枝受月光、靠下的沉入暗部，
  // 且**每层内部同色**（同一层不会一半亮一半暗，否则又变成横条纹）。
  const clusterGrid: Array<Array<0 | 1 | 2 | -1>> = grid.map((row) =>
    row.map(() => -1 as const),
  )
  for (let row = 0; row < rowsCount; row++) {
    const t = rowsCount <= 1 ? 0.5 : row / (rowsCount - 1)
    // 顶部一小段受月光、底部沉入暗部，其余全部是同一档主体色。
    const base: 0 | 1 | 2 = t < 0.16 ? 2 : t > 0.88 ? 0 : 1
    for (let col = 0; col < cols; col++) {
      if (!grid[row][col]) continue
      clusterGrid[row][col] = base
    }
  }

  const rows: CrownRow[] = []
  for (let row = 0; row < rowsCount; row++) {
    rows.push(...crownRowSegments(row, cols, grid, clusterGrid, originX, originY, cell))
  }

  // 轮廓格：上下左右任一侧不是填充格的就是边。描边用这个，像素画的「外轮廓压暗」。
  const edge: PixelRect[] = []
  const rim: PixelRect[] = []
  for (let row = 0; row < rowsCount; row++) {
    for (let col = 0; col < cols; col++) {
      if (!grid[row][col]) continue
      const up = row > 0 && grid[row - 1][col]
      const down = row < rowsCount - 1 && grid[row + 1][col]
      const left = col > 0 && grid[row][col - 1]
      const right = col < cols - 1 && grid[row][col + 1]
      const rect = { x: originX + col * cell, y: originY + row * cell, w: cell, h: cell }
      if (!up || !down || !left || !right) edge.push(rect)
      // 迎光边：上方或右侧是空的 → 月光从右上打过来，这一圈最亮
      if (!up || !right) rim.push(rect)
    }
  }

  // texture 保留字段以兼容既有调用方与测试，但**不再产生任何噪点**。
  // 树冠内部必须是一整块纯色：三档色差只有 2~3 个色阶时，撒噪点只会变成脏斑。
  const texture: PixelSpeck[] = []

  return {
    rows,
    edge,
    rim,
    texture,
    grid,
    origin: { x: originX, y: originY },
    cell,
    cols,
    rowsCount,
  }
}

/** 判断某点是否位于树冠填充区内。 */
export function insideCrown(shape: CrownShape, x: number, y: number): boolean {
  const col = Math.floor((x - shape.origin.x) / shape.cell)
  const row = Math.floor((y - shape.origin.y) / shape.cell)
  if (row < 0 || row >= shape.grid.length) return false
  if (col < 0 || col >= shape.grid[row].length) return false
  return shape.grid[row][col]
}

/**
 * 从 targetY 开始，在 x 这一列上向下/向上找最近的「树冠内」格子，返回其中心 y。
 * 找不到就返回 null（调用方自己决定回退）。
 */
export function findCrownY(shape: CrownShape, x: number, targetY: number): number | null {
  const col = Math.floor((x - shape.origin.x) / shape.cell)
  if (col < 0 || col >= shape.cols) return null
  const startRow = Math.floor((targetY - shape.origin.y) / shape.cell)
  const maxStep = Math.max(startRow, shape.rowsCount - startRow) + 2
  for (let step = 0; step <= maxStep; step++) {
    for (const row of step === 0 ? [startRow] : [startRow + step, startRow - step]) {
      if (row < 0 || row >= shape.rowsCount) continue
      if (shape.grid[row][col]) {
        return shape.origin.y + row * shape.cell + shape.cell / 2
      }
    }
  }
  return null
}

/**
 * 树干：一根方柱 + 左右两条压暗的树皮边 + 零星竖纹 + 底部两级台阶树根。
 * topY 可以画进树冠内部（反正被树冠盖住看不见）。
 */
export function buildTrunk(
  cx: number,
  topY: number,
  groundY: number,
  halfWidth = 34,
): { body: PixelRect[]; bark: PixelRect[]; roots: PixelRect[] } {
  const cell = PIXEL
  const left = Math.round((cx - halfWidth) / cell) * cell
  const right = Math.round((cx + halfWidth) / cell) * cell
  const top = Math.round(topY / cell) * cell
  const bottom = Math.round(groundY / cell) * cell

  const body: PixelRect[] = [{ x: left, y: top, w: right - left, h: bottom - top }]

  const bark: PixelRect[] = [
    { x: left, y: top, w: cell, h: bottom - top },
    { x: right - cell, y: top, w: cell, h: bottom - top },
  ]
  for (let y = top + cell * 2; y < bottom - cell; y += cell * 2) {
    const h = hash2(Math.round(y / cell), Math.round(cx / cell))
    if (h < 0.5) {
      bark.push({ x: left + cell * (h < 0.25 ? 2 : 4), y, w: cell, h: cell })
    }
  }

  const roots: PixelRect[] = [
    { x: left - cell * 2, y: bottom - cell * 2, w: right - left + cell * 4, h: cell * 2 },
    { x: left - cell, y: bottom - cell * 4, w: right - left + cell * 2, h: cell * 2 },
  ]

  return { body, bark, roots }
}

/**
 * 山：按列算起伏高度并量化到格子，同高的相邻列合并成矩形。
 * seed 不同 → 山形不同。
 *
 * 这是「一条山脊」的基础版本（保留给测试与简单场景）。
 * 实际画面的远近层次用 buildMountainRange，它额外给出迎光的山脊线。
 */
export function buildMountains(
  width: number,
  baseY: number,
  maxHeight: number,
  seed: number,
): PixelRect[] {
  const cell = PIXEL
  const total = Math.ceil(width / cell)
  const heights: number[] = []
  for (let i = 0; i < total; i++) {
    const t = i / Math.max(1, total - 1)
    const wave =
      Math.sin(t * Math.PI * 1.0 + seed) * 0.55 +
      Math.sin(t * Math.PI * 2.3 + seed * 1.7) * 0.3 +
      Math.sin(t * Math.PI * 4.1 + seed * 0.4) * 0.15
    const h = Math.max(0, (wave * 0.5 + 0.55) * maxHeight)
    heights.push(Math.round(h / cell) * cell)
  }

  const rects: PixelRect[] = []
  let i = 0
  while (i < total) {
    const h = heights[i]
    let j = i
    while (j + 1 < total && heights[j + 1] === h) j++
    if (h > 0) rects.push({ x: i * cell, y: baseY - h, w: (j - i + 1) * cell, h })
    i = j + 1
  }
  return rects
}

/**
 * 积云：像素风的云不是柔雾，而是**一叠圆角坨**堆出来的。
 *
 * 参考图（月夜山脉）地平线上方压着大片浅蓝灰积云，占了画面近一半的视觉重量。
 * 少这一层天空会显得空洞，而且没法把远处的山和天分开。
 *
 * 做法：沿一条水平线排若干「坨」，每坨是半圆鼓包（用行宽按 sin 收缩近似），
 * 叠在一起就是积云的平底鼓顶轮廓；下方再阴影一档。
 * 云必须比山亮得多，才能一眼分出前后（实测参考图云 #adb3c5 vs 山 #1b2b47）。
 */
export function buildClouds(
  x0: number,
  x1: number,
  baseY: number,
  height: number,
  seed: number,
): { body: PixelRect[]; shade: PixelRect[] } {
  const cell = PIXEL
  const cols = Math.round((x1 - x0) / cell)
  if (cols < 6) return { body: [], shade: [] }
  const colStart = Math.round(x0 / cell)

  // 云团要「小而多」才有一串圆鼓包；两三朵大团会拼出一个几何形状（像兔子耳朵）。
  const puffCount = Math.max(4, Math.round(cols / 5))
  const heights = new Array<number>(cols).fill(0)
  for (let p = 0; p < puffCount; p++) {
    const pcx = ((p + 0.5) / puffCount) * cols + (hash2(p, seed) - 0.5) * 3
    const pr = 2 + hash2(p, seed + 3) * 3.5 // 2~5.5 格 → 一口一口的小鼓包
    // 中间的坨更高，两侧矮下去 → 一朵云的拱形总体轮廓
    const arch = Math.sin(((p + 0.5) / puffCount) * Math.PI)
    const ph = height * (0.28 + arch * 0.62) * (0.75 + hash2(p, seed + 5) * 0.35)
    for (let c = 0; c < cols; c++) {
      const d = Math.abs(c - pcx)
      if (d >= pr) continue
      // sqrt 让肩部饱满（sin 会把肩削成细尖）
      const h = Math.sqrt(1 - (d / pr) * (d / pr)) * ph
      if (h > heights[c]) heights[c] = h
    }
  }
  // 底线：整片云底部留 2 格实心，云才会连成一团而不是散成几撮
  for (let c = 0; c < cols; c++) heights[c] = Math.max(heights[c], cell * 2)

  const body: PixelRect[] = []
  const shade: PixelRect[] = []
  let c = 0
  while (c < cols) {
    const h = Math.round(heights[c] / cell) * cell
    let c2 = c
    while (c2 + 1 < cols && Math.round(heights[c2 + 1] / cell) * cell === h) c2++
    const w = (c2 - c + 1) * cell
    const x = (colStart + c) * cell
    body.push({ x, y: baseY - h, w, h })
    // 云底压暗一格 → 有厚度感，不像贴纸
    if (h > cell * 2) shade.push({ x, y: baseY - cell, w, h: cell })
    c = c2 + 1
  }
  return { body, shade }
}

/**
 * 一条山脉：山体 + 迎光的山脊线。
 *
 * 参考图（月夜山脉）里的山是**一个个尖峰**，不是正弦起伏的土包。
 * 所以这里不是叠加波形，而是撒若干三角峰取最大高度：
 *   height(x) = max over peaks of (1 - |x-px|/slope) * ph
 * 这样得到的是真山脊线——峰角尖锐、峰与峰之间有清楚的谷。
 * 峰的位置/高度/坡度全部由 seed 决定 → 每次都一样。
 */
export function buildMountainRange(
  width: number,
  baseY: number,
  maxHeight: number,
  seed: number,
  /** 山脊的最低高度比例（相对 maxHeight）。0 = 允许山脊降到地平线（会出现缺口） */
  floorRatio = 0,
): { body: PixelRect[]; ridge: PixelRect[] } {
  const cell = PIXEL
  const total = Math.ceil(width / cell)

  // 峰的数量按宽度定：约每 90px 一座，太小会碎、太少会平
  const peakCount = Math.max(4, Math.round(width / 90))
  const peaks: Array<{ px: number; ph: number; slope: number }> = []
  for (let i = 0; i < peakCount; i++) {
    const px = (i + 0.1 + hash2(i, seed) * 0.8) / peakCount
    // 高低错落：少数高峰 + 多数中低峰，轮廓才不是锯齿梳子
    const tall = hash2(i, seed + 3) > 0.62
    const ph = maxHeight * (tall ? 0.82 + hash2(i, seed + 5) * 0.18 : 0.35 + hash2(i, seed + 5) * 0.4)
    const slope = 0.1 + hash2(i, seed + 7) * 0.16
    peaks.push({ px, ph, slope })
  }

  const heights: number[] = []
  for (let i = 0; i < total; i++) {
    const t = i / Math.max(1, total - 1)
    let h = 0
    for (const p of peaks) {
      const d = Math.abs(t - p.px)
      if (d >= p.slope) continue
      // 1.35 次方让两侧略凹，峰顶更尖
      const v = Math.pow(1 - d / p.slope, 1.35) * p.ph
      if (v > h) h = v
    }
    /* 山脊最低高度：**这是关键修正**。
     * 不设下限时，峰与峰之间的谷会一路降到地平线，天空最亮的那条色带就从
     * 这些缺口里漏出来，形成一块块斑驳的亮斑（截图里看得很明显，也是「脏」的一种）。
     * 真实山脉是连绵的：谷再低也不会低于山体的某个基准高度。 */
    const floor = maxHeight * floorRatio * (0.86 + hash2(i, seed + 11) * 0.28)
    h = Math.max(h, floor)
    heights.push(Math.round(Math.max(0, h) / cell) * cell)
  }
  const body: PixelRect[] = []
  const ridge: PixelRect[] = []
  let i = 0
  while (i < total) {
    const h = heights[i]
    let j = i
    while (j + 1 < total && heights[j + 1] === h) j++
    const w = (j - i + 1) * cell
    if (h > 0) {
      body.push({ x: i * cell, y: baseY - h, w, h })
      // 山脊：最上面一格（高峰两格），比山体亮一档 → 月光照在棱线上
      const ridgeH = h >= maxHeight * 0.6 ? cell * 2 : cell
      ridge.push({ x: i * cell, y: baseY - h, w, h: ridgeH })
    }
    i = j + 1
  }
  return { body, ridge }
}

/** 像素月亮：格子拼出的圆 + 两圈低透明度光晕。 */
export function buildMoon(
  cx: number,
  cy: number,
  radius: number,
): { core: PixelRect[]; halo: PixelRect[] } {
  const cell = PIXEL
  const core: PixelRect[] = []
  const halo: PixelRect[] = []
  const half = Math.ceil((radius + cell * 2.2) / cell)
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const px = cx + col * cell + cell / 2
      const py = cy + row * cell + cell / 2
      const d = Math.hypot(px - cx, py - cy)
      const rect = { x: cx + col * cell, y: cy + row * cell, w: cell, h: cell }
      if (d <= radius) core.push(rect)
      else if (d <= radius + cell * 2.2) halo.push(rect)
    }
  }
  return { core, halo }
}

/** 月亮上的环形山：格子大小的暗斑，位置由哈希决定。 */
export function buildCraters(
  cx: number,
  cy: number,
  radius: number,
  count = 7,
): Array<PixelRect & { big: boolean }> {
  const cell = PIXEL
  const out: Array<PixelRect & { big: boolean }> = []
  for (let i = 0; i < count; i++) {
    // 环形山偏向左上，且不出月盘边缘 → 不会撞出一个「笑脸」
    const a = hash2(i, 61) * Math.PI * 1.5 + Math.PI * 0.85
    const r = Math.sqrt(hash2(i, 67)) * radius * 0.62
    const px = Math.round((cx + Math.cos(a) * r) / cell) * cell
    const py = Math.round((cy + Math.sin(a) * r) / cell) * cell
    const big = hash2(i, 71) > 0.62
    out.push({ x: px, y: py, w: big ? cell * 2 : cell, h: big ? cell : cell, big })
  }
  return out
}

/** 像素星点：远看是一点微光，所以尺寸小于一格（大颗的星空会像下雪）。 */
export function buildStars(
  width: number,
  bandHeight: number,
  count: number,
): Array<{ x: number; y: number; size: number }> {
  const cell = PIXEL
  const cols = Math.max(1, Math.floor(width / cell))
  const rows = Math.max(1, Math.floor(bandHeight / cell))
  const stars: Array<{ x: number; y: number; size: number }> = []
  const seen = new Set<string>()
  let i = 0
  while (stars.length < count && i < count * 30) {
    const col = Math.floor(hash2(i, 11) * cols)
    const row = Math.floor(hash2(i, 29) * rows)
    const key = `${col}:${row}`
    i++
    if (seen.has(key)) continue
    seen.add(key)
    // 大部分是极小的细星，少数稍大；锚在格子左上角 + 半个偏移，视觉上居中
    const size = hash2(i, 47) < 0.8 ? cell * 0.4 : cell * 0.7
    stars.push({ x: col * cell + (cell - size) / 2, y: row * cell + (cell - size) / 2, size })
  }
  return stars
}

/**
 * 十字闪星：像素画里最亮的星星不是方点，而是「+」形。
 * 参考图的夜空里就有几颗这种，是提亮整片天空的关键小细节。
 */
export function buildSparkles(
  width: number,
  bandHeight: number,
  count: number,
): Array<{ x: number; y: number; arm: number }> {
  const cell = PIXEL
  const cols = Math.max(1, Math.floor(width / cell))
  const rows = Math.max(1, Math.floor(bandHeight / cell))
  const out: Array<{ x: number; y: number; arm: number }> = []
  const seen = new Set<string>()
  let i = 0
  while (out.length < count && i < count * 40) {
    const col = 1 + Math.floor(hash2(i, 83) * (cols - 2))
    const row = 1 + Math.floor(hash2(i, 89) * (rows - 2))
    const key = `${col}:${row}`
    i++
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ x: col * cell, y: row * cell, arm: hash2(i, 97) < 0.5 ? cell : cell * 1.4 })
  }
  return out
}

/**
 * 画框两边的松树剪影。
 *
 * 参考图（月夜山脉 / 蓝色夜景）最有效的构图手法：左右边缘各压一棵近黑的树，
 * 画面立刻有「站在林间往外看」的纵深，而且纯剪影零细节，完全不抢中间那棵树。
 *
 * 形状要点（踩过三次坑）：
 * - **实心**。留水平缝隙会变成一排「货架横条」；分成一层层枝盘也还是货架。
 * - 轮廓靠逐行宽度递减 + 每几行探出一小片枝尖来做出参差，
 *   而不是靠缝隙。近黑剪影里看不见内部结构，只有轮廓有意义。
 * - 顶部要有一个单独的尖，底部要有主干，否则像一块石头。
 */
export function buildPine(
  cx: number,
  baseY: number,
  height: number,
  seed: number,
): PixelRect[] {
  const cell = PIXEL
  const rowsCount = Math.max(6, Math.round(height / cell))
  const baseRow = Math.round(baseY / cell)
  const centerCol = Math.round(cx / cell)

  // 逐行半宽：从顶部 0 到最宽，用 pow 让下半部更宽（松树的实际轮廓）
  const halfAt = (i: number) => {
    const k = i / (rowsCount - 1) // 0=顶 1=底
    const base = Math.pow(k, 0.72) * height * 0.34
    // 每 3 行做一次「轮生」起伏：边缘忽宽忽窄 → 锯齿轮廓
    const wave = 1 + (hash2(Math.floor(i / 3), seed) - 0.5) * 0.26
    return Math.max(1, base * wave)
  }

  // 逐行算出左右列，相邻同宽的行合并成一条 rect
  const rows: Array<{ c0: number; c1: number; row: number }> = []
  for (let i = 0; i < rowsCount; i++) {
    const half = Math.max(1, Math.round(halfAt(i) / cell))
    rows.push({ c0: centerCol - half, c1: centerCol + half, row: baseRow - rowsCount + i })
  }

  const rects: PixelRect[] = []
  let runStart = 0
  for (let i = 1; i <= rows.length; i++) {
    const prev = rows[i - 1]
    const cur = rows[i]
    if (cur && cur.c0 === prev.c0 && cur.c1 === prev.c1) continue
    const group = rows.slice(runStart, i)
    rects.push({
      x: group[0].c0 * cell,
      y: group[0].row * cell,
      w: (group[0].c1 - group[0].c0 + 1) * cell,
      h: group.length * cell,
    })
    runStart = i
  }

  // 每隔几行甩出一小片枝尖：轮廓才不是一条干净的梯形边
  for (let i = 3; i < rowsCount - 2; i += 3) {
    if (hash2(i, seed + 41) < 0.35) continue
    const r = rows[i]
    const side = hash2(i, seed + 43) > 0.5 ? 1 : -1
    const len = 1 + Math.floor(hash2(i, seed + 47) * 2)
    rects.push({
      x: (side > 0 ? r.c1 + 1 : r.c0 - len) * cell,
      y: r.row * cell,
      w: len * cell,
      h: cell,
    })
  }

  // 主干：从最下层伸到地面
  rects.push({
    x: (centerCol - 1) * cell,
    y: (baseRow - 2) * cell,
    w: cell * 2,
    h: cell * 2,
  })

  return rects.filter((r) => r.h > 0 && r.w > 0)
}

/**
 * 草甸：三段纯色，靠明度阶梯做纵深（不做棋盘格抖动）。
 *
 * 这里踩过两次坑：
 * 1. 最早撒「草土交界参差边 + 泥土深浅颗粒（10% 密度）」→ 截图里是一条满是杂点的脏带，
 *    这就是用户说的「画面有点脏」。
 * 2. 改用棋盘格抖动做过渡 → 截图里是一条**贯穿画面的点状虚线**。
 *    原因：抖动只有在「跨 3 行以上、且两色差别足够大」时才读作过渡；
 *    只铺 1~2 行、两色又只差几个色阶，人眼看到的是虚线，不是过渡。
 *
 * 所以现在最省事也最干净：三段硬边纯色。近处草地亮一档、中段草地本色、
 * 画面最下缘压最暗 —— 这就是参考图里草甸的做法（它的草甸也没有任何抖动）。
 */
export function buildGround(
  width: number,
  groundY: number,
  bottomY: number,
): {
  grass: PixelRect[]
  grassTop: PixelRect[]
  grassMid: PixelRect[]
  crestTop: PixelRect[]
  edge: PixelRect[]
  dirt: PixelRect[]
  specks: PixelSpeck[]
} {
  const cell = PIXEL
  const top = Math.round(groundY / cell) * cell
  const bottom = Math.round(bottomY / cell) * cell
  const cols = Math.ceil(width / cell)

  /* 尺寸一律用绝对像素再量化到格，不要写成 cell*N ——
   * PIXEL 从 10 改成 5 之后，所有 cell*N 都悄悄缩了一半，
   * 草皮亮边从 20px 变成 10px、底缘压暗从 50px 变成 25px，画面下缘直接空掉。 */
  const band = (px: number) => Math.max(cell, Math.round(px / cell) * cell)

  /* 地平线不是一条直线：用低频正弦叠出缓坡，起伏幅度约 ±3 格（±15px）。
   * 完全笔直的地平线是「粗糙」的元凶之一 —— 一眼就能看出是两块矩形拼的。
   * 起伏必须低频（一个波长跨 200px 以上），高频会变成锯齿草地，反而更脏。 */
  const topAt = (col: number) => {
    const x = col * cell
    const w =
      Math.sin(x / 210) * 1.6 + Math.sin(x / 97 + 1.7) * 0.9 + Math.sin(x / 43 + 3.1) * 0.4
    return top - Math.round(w / cell) * cell * 2
  }

  // 草甸主体：从起伏的地平线铺到底边，不留缝
  const grass: PixelRect[] = []
  const grassTop: PixelRect[] = []
  let runCol = 0
  for (let col = 1; col <= cols; col++) {
    const cur = col < cols ? topAt(col) : NaN
    const base = topAt(runCol)
    if (col < cols && cur === base) continue
    const x = runCol * cell
    const w = (col - runCol) * cell
    grass.push({ x, y: base, w, h: bottom - base })
    grassTop.push({ x, y: base, w, h: band(22) })
    runCol = col
  }
  /* 中景坡地：草地中央一大片空板是「粗糙」的元凶之一 ——
   * 参考图的下半部永远有起伏的地形，不会留一整块平涂。
   * 但**不能画成横带**（试过，草地里横着一条暗直线，整幅画像沙漠）。
   * 所以做成低频起伏的坡地轮廓：上缘起伏，往下一直铺到画面底边，
   * 用比草地暗一档的色，读起来就是「近处的地势比远处低」。 */
  /* 起伏幅度必须够大：草地带只有约 150px 高、1200px 宽（8:1 的扁条），
   * ±10px 的起伏在画面上就是一条直线。这里用 ±40px、周期约 400px，
   * 画面上刚好 3 个坡，近处地势才有「高低」。 */
  const crestAt = (col: number) => {
    const x = col * cell
    /* 注意量纲：sin 出来是 ±1.5，**必须先乘成像素再量化**。
     * 之前写成 Math.round(w / cell) * cell * 4 —— w 只有 ±1.5，除以 5 恒为 0，
     * 量化直接把起伏吃干净，坡地变成一条直线（截图里完全看不出来）。 */
    const px = (Math.sin(x / 400 + 0.6) * 1.0 + Math.sin(x / 190 + 2.4) * 0.55) * 26
    return top + band(46) - Math.round(px / cell) * cell
  }
  const grassMid: PixelRect[] = []
  const crestTop: PixelRect[] = []
  {
    let run = 0
    for (let col = 1; col <= cols; col++) {
      const cur = col < cols ? crestAt(col) : NaN
      const base = crestAt(run)
      if (col < cols && cur === base) continue
      const x = run * cell
      const w = (col - run) * cell
      grassMid.push({ x, y: base, w, h: bottom - base })
      // 坡地上缘一条亮边：没有它，坡地和草地只差两个色阶，肉眼看不见，等于白加
      crestTop.push({ x, y: base, w, h: band(8) })
      run = col
    }
  }
  // 最下缘压暗：给画面一个「底」，否则下方是一块平涂的死板空板
  const dirt: PixelRect[] = [{ x: 0, y: bottom - band(46), w: width, h: band(46) }]

  /* 草尖：沿地平线一格格探出来的小草。这不是噪点 ——
   * 噪点是撒在色块**内部**的散点（那才显脏），草尖是画在两条色块的**交界线**上，
   * 作用是把地平线从一条死直线变成起伏的轮廓。像素画里这是标准做法。 */
  const edge: PixelRect[] = []
  for (let col = 0; col < cols; col++) {
    const h = hash2(col, 211)
    if (h < 0.45) continue
    // 高低两档，避免全部一样高像梳子
    const tuftH = h > 0.86 ? cell * 2 : cell
    // 草尖长在**起伏后的**地平线上，不是原来那条直线
    edge.push({ x: col * cell, y: topAt(col) - tuftH, w: cell, h: tuftH })
  }

  // specks 保留字段以兼容既有调用方与测试，但**不再产生任何杂点**。
  return { grass, grassTop, grassMid, crestTop, edge, dirt, specks: [] }
}

/**
 * 天空抖动：像素画用棋盘格网纹代替平滑过渡。
 *
 * 参考图 j8eyw5 的招牌手法 —— 两条色带交界处不引入第三种颜色，
 * 而是把这两种颜色按棋盘格交错铺，远看就是中间色，近看是像素点。
 *
 * 关键约束（这次修的重点）：
 * 1. **只用色板里已有的两个色**，不再 lerpHex 算中间色。插值色是脏的主因。
 * 2. 只在「带交界上下各 1 格」铺，铺满整片天会显脏。
 */
export function buildSkyDither(
  width: number,
  height: number,
  stops: Array<{ offset: number; color: string }>,
): ColorBand[] {
  const cell = PIXEL
  const rows = Math.ceil(height / cell)
  const cols = Math.ceil(width / cell)
  const out: ColorBand[] = []

  /** 该行属于哪一档色标（硬边，不插值）。 */
  const stopAt = (t: number) => {
    let idx = 0
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].offset <= t) idx = i
    }
    return idx
  }

  /* 过渡带的密度梯度：上密下疏。
   * 这是像素画「用两个色做出中间色」的标准写法 ——
   * 3 行分别是 3/4、1/2、1/4 覆盖率，人眼会把它们平均成两个中间色，
   * 于是 4 条硬边色阶之间就有了平滑过渡，而且**一个中间色都没引入**。
   *
   * 之前只铺 1 行 1/2 棋盘格 → 截图里是一条点状虚线（比硬边还难看）。
   * 原因是单行棋盘格读作「虚线」，只有跨 3 行以上、密度递增才读作「过渡」。 */
  const DENSITY = [0.75, 0.5, 0.25]

  for (let row = 1; row < rows; row++) {
    const y = row * cell
    const cur = stopAt((y + cell / 2) / height)
    const prev = stopAt((y - cell / 2) / height)
    if (prev === cur) continue
    // 交界处往下铺 3 行过渡
    for (let k = 0; k < DENSITY.length; k++) {
      const d = DENSITY[k]
      const yy = y + k * cell
      if (yy >= height) break
      for (let col = 0; col < cols; col++) {
        // 4 个 2×2 子格：按密度决定填几个，形成稳定的棋盘格纹理
        const evenCol = col % 2 === 0
        const evenRow = (row + k) % 2 === 0
        let filled: boolean
        if (d >= 0.75) filled = !(evenCol && evenRow)
        else if (d >= 0.5) filled = !(evenCol === evenRow)
        else filled = evenCol && evenRow
        if (!filled) continue
        out.push({ x: col * cell, y: yy, w: cell, h: cell, color: stops[prev].color })
      }
    }
  }
  return out
}
