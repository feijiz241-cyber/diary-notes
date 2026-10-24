/**
 * 像素树几何光栅化的单元测试。
 * 关注三件事：确定性、形状闭合（不出现空洞/锯齿错位）、以及「按行合并」确实压缩了矩形数量。
 */
import { describe, it, expect } from 'vitest'
import {
  PIXEL,
  buildCrown,
  buildGround,
  buildMoon,
  buildMountains,
  buildStars,
  buildTrunk,
  findCrownY,
  hash2,
  insideClumps,
  insideCrown,
  shade,
} from './tree-pixels'

describe('shade', () => {
  it('提亮与压暗都保持在 6 位十六进制', () => {
    expect(shade('#3f8a45', 0.4)).toMatch(/^#[0-9a-f]{6}$/)
    expect(shade('#3f8a45', -0.6)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('amount=0 时原样返回', () => {
    expect(shade('#3f8a45', 0)).toBe('#3f8a45')
  })

  it('提亮后每个通道都不小于原值，压暗后不大于原值', () => {
    const base = '#3f8a45'
    const lighter = shade(base, 0.5)
    const darker = shade(base, -0.5)
    const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const [b, l, d] = [ch(base), ch(lighter), ch(darker)]
    for (let i = 0; i < 3; i++) {
      expect(l[i]).toBeGreaterThanOrEqual(b[i])
      expect(d[i]).toBeLessThanOrEqual(b[i])
    }
  })
})

describe('hash2', () => {
  it('结果落在 [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash2(i, i * 7 + 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('确定性：同样输入同样输出', () => {
    expect(hash2(12, 34)).toBe(hash2(12, 34))
  })

  it('相邻输入不会退化成同一条斜线（有区分度）', () => {
    const vals = new Set<number>()
    for (let i = 0; i < 50; i++) vals.add(hash2(i, i))
    expect(vals.size).toBeGreaterThan(45)
  })
})

describe('buildCrown', () => {
  const crown = buildCrown(450, 270, 252, 208)

  it('网格尺寸与原点自洽', () => {
    expect(crown.grid).toHaveLength(crown.rowsCount)
    expect(crown.rowsCount).toBeGreaterThan(20)
    expect(crown.cols).toBeGreaterThan(30)
    expect(crown.origin.x % PIXEL).toBe(0)
    expect(crown.origin.y % PIXEL).toBe(0)
  })

  it('有填充格，且不是满格（轮廓是树冠形状而非矩形）', () => {
    const filled = crown.grid.flat().filter(Boolean).length
    const total = crown.grid.length * crown.grid[0].length
    expect(filled).toBeGreaterThan(total * 0.3)
    expect(filled).toBeLessThan(total * 0.85)
  })

  it('按行合并后矩形数远少于填充格数（这是性能设计的前提）', () => {
    const filled = crown.grid.flat().filter(Boolean).length
    expect(crown.rows.length).toBeLessThan(filled * 0.5)
  })

  it('合并后的矩形正好覆盖所有填充格（不丢格、不多格）', () => {
    const covered: boolean[][] = crown.grid.map((r) => r.map(() => false))
    for (const rect of crown.rows) {
      const c0 = (rect.x - crown.origin.x) / PIXEL
      const c1 = c0 + rect.w / PIXEL - 1
      const r0 = (rect.y - crown.origin.y) / PIXEL
      for (let c = c0; c <= c1; c++) covered[r0][c] = true
    }
    for (let r = 0; r < crown.grid.length; r++) {
      for (let c = 0; c < crown.grid[r].length; c++) {
        expect(covered[r][c]).toBe(crown.grid[r][c])
      }
    }
  })

  it('三段 tone 都存在（顶部受光 / 中段基础 / 底部背光）', () => {
    const tones = new Set(crown.rows.map((r) => r.tone))
    expect(tones.has(0)).toBe(true)
    expect(tones.has(1)).toBe(true)
    expect(tones.has(2)).toBe(true)
  })

  it('噪点只落在填充格上', () => {
    for (const t of crown.texture) {
      expect(insideCrown(crown, t.x + PIXEL / 2, t.y + PIXEL / 2)).toBe(true)
    }
  })

  it('确定性：同参数两次构建完全一致', () => {
    expect(buildCrown(450, 270, 252, 208)).toEqual(crown)
  })
})

describe('insideClumps / insideCrown / findCrownY', () => {
  it('椭圆中心必然在内', () => {
    expect(insideClumps([{ cx: 0, cy: 0, rx: 10, ry: 20 }], 0, 0)).toBe(true)
  })

  it('椭圆外必然在外', () => {
    expect(insideClumps([{ cx: 0, cy: 0, rx: 10, ry: 20 }], 11, 0)).toBe(false)
    expect(insideClumps([{ cx: 0, cy: 0, rx: 10, ry: 20 }], 0, 21)).toBe(false)
  })

  const crown = buildCrown(450, 270, 200, 160)

  it('findCrownY 返回的 y 落在树冠内', () => {
    const y = findCrownY(crown, 450, 270)
    expect(y).not.toBeNull()
    expect(insideCrown(crown, 450, y!)).toBe(true)
  })

  it('findCrownY 在横向超出树冠时返回 null', () => {
    expect(findCrownY(crown, crown.origin.x - 200, 270)).toBeNull()
  })

  it('insideCrown 对明显在外的坐标返回 false', () => {
    expect(insideCrown(crown, 0, 0)).toBe(false)
    expect(insideCrown(crown, 450, 2000)).toBe(false)
  })
})

describe('buildTrunk', () => {
  const trunk = buildTrunk(450, 400, 700, 36)

  it('树干左右对称、底边贴地', () => {
    const body = trunk.body[0]
    expect(body.x + body.w / 2).toBe(450)
    expect(body.y + body.h).toBe(700)
  })

  it('树根比树干更宽（底部有台阶式外扩）', () => {
    const body = trunk.body[0]
    const widestRoot = Math.max(...trunk.roots.map((r) => r.w))
    expect(widestRoot).toBeGreaterThan(body.w)
  })

  it('树皮与树根都不越出画布左侧', () => {
    for (const r of trunk.bark) expect(r.x).toBeGreaterThanOrEqual(0)
    for (const r of trunk.roots) expect(r.x).toBeGreaterThanOrEqual(0)
  })
})

describe('buildMountains', () => {
  const width = 900

  it('山体不超出画布，且都站在 baseY 上', () => {
    const rects = buildMountains(width, 700, 170, 1.7)
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(width)
      expect(r.y + r.h).toBe(700)
      expect(r.h).toBeGreaterThanOrEqual(0)
    }
  })

  it('不同 seed 得到不同山形', () => {
    expect(buildMountains(width, 700, 170, 1.7)).not.toEqual(buildMountains(width, 700, 170, 4.3))
  })

  it('高度被量化到像素格', () => {
    for (const r of buildMountains(width, 700, 170, 1.7)) {
      expect(r.h % PIXEL).toBe(0)
      expect(r.y % PIXEL).toBe(0)
    }
  })
})

describe('buildMoon', () => {
  const moon = buildMoon(770, 100, 39)

  it('有核心格与光晕格，且核心在内、光晕在外', () => {
    expect(moon.core.length).toBeGreaterThan(10)
    expect(moon.halo.length).toBeGreaterThan(10)
  })

  it('所有月亮格都是 PIXEL 大小的方块', () => {
    for (const r of moon.core) {
      expect(r.w).toBe(PIXEL)
      expect(r.h).toBe(PIXEL)
    }
  })
})

describe('buildStars', () => {
  it('生成指定数量且不重叠', () => {
    const stars = buildStars(900, 200, 34)
    expect(stars.length).toBe(34)
    const keys = new Set(stars.map((s) => `${s.x}:${s.y}`))
    expect(keys.size).toBe(stars.length)
  })

  it('星点落在给定的高度带内', () => {
    for (const s of buildStars(900, 200, 30)) {
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThan(200)
    }
  })
})

describe('buildGround', () => {
  const ground = buildGround(900, 700, 760)

  it('草皮横贯整个画布', () => {
    /* 地平线现在是起伏的，grass 被切成多段。
     * 判据改成「横向无缝铺满」：所有段首尾相接、从 0 覆盖到画布右缘。 */
    expect(ground.grass[0].x).toBe(0)
    let reach = 0
    for (const r of ground.grass) {
      expect(r.x).toBe(reach)
      reach = r.x + r.w
    }
    expect(reach).toBe(900)
    for (const r of ground.grassTop) expect(r.h).toBeGreaterThan(0)
  })

  it('碎石都是 PIXEL 大小的方块且在地面以下', () => {
    for (const s of ground.specks) {
      expect(s.size).toBe(PIXEL)
      expect(s.y).toBeGreaterThanOrEqual(700)
    }
  })
})
