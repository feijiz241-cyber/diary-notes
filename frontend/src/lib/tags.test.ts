import { describe, it, expect } from 'vitest'
import { normalizeTags, toggleTag } from './tags'

describe('tags', () => {
  it('normalizeTags splits, trims and dedups', () => {
    expect(normalizeTags('a, b, a   c，d、e')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('normalizeTags returns empty for blank', () => {
    expect(normalizeTags('   ')).toEqual([])
  })

  it('toggleTag adds then removes', () => {
    expect(toggleTag([], 'x')).toEqual(['x'])
    expect(toggleTag(['x'], 'x')).toEqual([])
    expect(toggleTag(['x'], '  ')).toEqual(['x'])
  })
})
