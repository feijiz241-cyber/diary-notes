import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import {
  putEntry,
  getByDate,
  deleteEntry,
  putImage,
  getImage,
  getImagesByEntry,
  getAll,
  getYear,
  getEntryDates,
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

  it('还没写的一天是 undefined，不是抛错（后端回 200 + null）', async () => {
    expect(await getByDate('2031-02-03')).toBeUndefined()
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

describe('图片单张取（编辑器渲染用）', () => {
  /** 只统计 GET /api/images/:id 的次数，用来证明没有重复下载 */
  function countingFetch() {
    const hits: string[] = []
    const wrapped = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.toString()
      if ((init.method || 'GET').toUpperCase() === 'GET' && /\/api\/images\/[^?]+$/.test(url)) {
        hits.push(url)
      }
      return mock.fetch(input, init)
    })
    vi.stubGlobal('fetch', wrapped)
    return hits
  }

  /** 直接走后端接口塞一张图，绕开 putImage 的内存缓存，模拟"页面刷新后再打开" */
  async function seedImageRaw(id: string, entryId: string, base64: string, type = 'image/png') {
    await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: id, entryId, ext: 'png', base64, type }),
    })
  }

  it('getImage 单张下载一次，重复取命中缓存', async () => {
    await seedImageRaw('img-1', '2026-07-11', 'YWJj')
    const hits = countingFetch()

    const first = await getImage('img-1')
    expect(first?.blob.type).toBe('image/png')
    expect(first?.blob.size).toBe(3)

    await getImage('img-1')
    expect(hits.length).toBe(1)
  })

  it('getImage 对不存在的 id 返回 null，不抛错', async () => {
    countingFetch()
    expect(await getImage('no-such-image')).toBeNull()
  })

  it('刚刚插进编辑器的图（putImage 之后）零请求即可渲染', async () => {
    const id = await putImage('2026-07-11', new Blob(['xyz'], { type: 'image/png' }))
    const hits = countingFetch()
    const got = await getImage(id)
    expect(got?.blob.size).toBe(3)
    expect(hits.length).toBe(0)
  })
})

describe('日期清单（森林页算间隔用）', () => {
  it('只取日期，不下载正文', async () => {
    await putEntry({ date: '2026-08-20', title: '正文很长的日记', content: { type: 'doc', content: [] }, mood: null, tags: [] })
    await putEntry({ date: '2026-07-02', title: 'b', content: { type: 'doc', content: [] }, mood: null, tags: [] })

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => mock.fetch(input, init)),
    )

    const dates = await getEntryDates()

    expect(dates).toEqual(['2026-07-02', '2026-08-20'])
    // 返回值里只有字符串：正文根本没被传过来
    expect(dates.every((d) => typeof d === 'string')).toBe(true)
    const urls = (fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls.map(
      (c) => String(c[0]),
    )
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('/api/entries/dates')
  })
})
