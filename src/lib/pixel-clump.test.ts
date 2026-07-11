import { describe, it, expect } from 'vitest'
import { buildClump, clumpBounds, shade } from './pixel-clump'

describe('pixel-clump', () => {
  it('shade 可以变亮/变暗', () => {
    const base = '#808080'
    expect(shade(base, 20)).toMatch(/^#9/)
    expect(shade(base, -20)).toMatch(/^#6/)
  })

  it('buildClump 中心附近必有方块，外缘可缺失', () => {
    const blocks = buildClump('2026-07-03', '#BBF7D0', 100, 100, 8)
    expect(blocks.length).toBeGreaterThan(15)
    // 中心方块 (0,0) 必须存在
    expect(blocks.some((b) => b.x === 100 - 4 && b.y === 100 - 4)).toBe(true)
  })

  it('clumpBounds 给出 5x5 方块包围盒', () => {
    const bounds = clumpBounds(100, 100, 8)
    expect(bounds.w).toBe(40)
    expect(bounds.h).toBe(40)
    expect(bounds.x).toBe(80)
    expect(bounds.y).toBe(80)
  })

  it('相同种子生成相同布局（确定性）', () => {
    const a = buildClump('seed-a', '#FDE68A', 0, 0, 8)
    const b = buildClump('seed-a', '#FDE68A', 0, 0, 8)
    expect(a.map((x) => `${x.x},${x.y},${x.fill}`).join('|')).toBe(
      b.map((x) => `${x.x},${x.y},${x.fill}`).join('|'),
    )
  })
})
