import { beforeEach, describe, it, expect } from 'vitest'
import {
  putEntry,
  getByDate,
  deleteEntry,
  putImage,
  getImagesByEntry,
  getAll,
  clearAll,
} from './db'

beforeEach(async () => {
  await clearAll()
})

const sample = {
  date: '2026-07-11',
  title: '你好',
  content: { type: 'doc', content: [] },
  mood: 'joy',
  tags: ['a'],
}

describe('data layer', () => {
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
})
