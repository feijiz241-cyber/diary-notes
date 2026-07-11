import { describe, it, expect } from 'vitest'
import { getMood, MOODS } from './mood'

describe('mood', () => {
  it('getMood 返回带颜色的完整心情', () => {
    const joy = getMood('joy')
    expect(joy).toBeDefined()
    expect(joy?.emoji).toBe('😄')
    expect(joy?.color).toMatch(/^#/)
  })

  it('未知/空 id 返回 undefined', () => {
    expect(getMood('nope')).toBeUndefined()
    expect(getMood(null)).toBeUndefined()
    expect(getMood(undefined)).toBeUndefined()
  })

  it('每个心情都有颜色（供叶子配色）', () => {
    for (const m of MOODS) {
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
