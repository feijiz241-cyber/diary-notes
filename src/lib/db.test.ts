import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import {
  putEntry,
  getByDate,
  deleteEntry,
  putImage,
  getImagesByEntry,
  getAll,
  getYear,
} from './db'

const mock = createMockApi()

beforeEach(() => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
})

const sample = {
  date: '2026-07-11',
  title: '你好',
  content: { type: 'doc', content: [] },
  mood: 'joy',
  tags: ['a'],
}

describe('data layer (fetch → backend)', () => {
  it('put then getByDate', async () => {
    await putEntry(sample)
    const e = await getByDate('2026-07-11')
    expect(e?.title).toBe('你好')
    expect(e?.mood).toBe('joy')
  })

  it('same date upserts into one entry per day', async () => {
    await putEntry(sample)
    await putEntry({ ...sample, title: '更新' })
    const all = await getAll()
    expect(all.length).toBe(1)
    expect((await getByDate('2026-07-11'))?.title).toBe('更新')
  })

  it('deleteEntry removes entry and its images', async () => {
    const id = await putEntry(sample)
    await putImage('2026-07-11', new Blob(['x'], { type: 'image/png' }))
    expect((await getImagesByEntry('2026-07-11')).length).toBe(1)

    await deleteEntry(id)
    expect(await getByDate('2026-07-11')).toBeUndefined()
    expect((await getImagesByEntry('2026-07-11')).length).toBe(0)
  })

  it('getYear returns only entries of the specified year', async () => {
    await putEntry({ ...sample, date: '2026-01-10' })
    await putEntry({ ...sample, date: '2026-07-11' })
    await putEntry({ ...sample, date: '2025-12-31' })
    const year2026 = await getYear(2026)
    expect(year2026.length).toBe(2)
    expect(year2026.map((e) => e.date).sort()).toEqual(['2026-01-10', '2026-07-11'])
  })
})
