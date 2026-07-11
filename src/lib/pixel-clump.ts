export interface PixelBlock {
  x: number
  y: number
  size: number
  fill: string
}

function hash(seed: string, i: number, j: number): number {
  let h = 0
  for (let k = 0; k < seed.length; k++) {
    h = (h << 5) - h + seed.charCodeAt(k)
  }
  h = (h + i * 31 + j * 97) | 0
  return (Math.abs(h) % 1000) / 1000
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r + amount, g + amount, b + amount)
}

/** 生成像参考图那样的像素树叶丛（5x5 方块网格，部分缺失，带明暗） */
export function buildClump(
  seed: string,
  color: string,
  cx: number,
  cy: number,
  blockSize: number,
): PixelBlock[] {
  const blocks: PixelBlock[] = []
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const d = Math.sqrt(i * i + j * j)
      if (d > 2.5) continue
      const h = hash(seed, i, j)
      // 外缘随机缺失，制造蓬松感
      if (d > 1.8 && h < 0.28) continue
      // 明暗：固定高光/阴影位置，加上少量随机
      let fill = color
      if (i + j <= -2 || h < 0.18) fill = shade(color, 26)
      else if (i + j >= 2 || h > 0.78) fill = shade(color, -28)
      blocks.push({
        x: cx + i * blockSize - blockSize / 2,
        y: cy + j * blockSize - blockSize / 2,
        size: blockSize,
        fill,
      })
    }
  }
  return blocks
}

export function clumpBounds(cx: number, cy: number, blockSize: number): { x: number; y: number; w: number; h: number } {
  const span = 5 * blockSize
  return { x: cx - span / 2, y: cy - span / 2, w: span, h: span }
}

/**
 * 生成参考图风格的大蓬松像素树冠（圆形网格 + 外缘缺失 + 体积明暗）。
 * 用于"整棵大树"方案的主体树冠。
 */
export function buildCrown(
  cx: number,
  cy: number,
  radius: number,
  color: string,
  blockSize = 8,
): PixelBlock[] {
  const blocks: PixelBlock[] = []
  const half = Math.round(radius / blockSize)
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      const px = i * blockSize
      const py = j * blockSize
      const dist = Math.sqrt(px * px + py * py)
      if (dist > radius) continue
      const edge = dist / radius
      // 外缘随机缺失，制造蓬松轮廓
      if (edge > 0.84) {
        const h = hash(`${cx},${cy},${i},${j}`, i, j)
        if (h < 0.32) continue
      }
      // 体积明暗：左上亮、右下暗
      let fill = color
      if (i + j <= -2) fill = shade(color, 30)
      else if (i + j >= 2) fill = shade(color, -34)
      else fill = shade(color, -2)
      blocks.push({
        x: cx + px - blockSize / 2,
        y: cy + py - blockSize / 2,
        size: blockSize,
        fill,
      })
    }
  }
  return blocks
}
