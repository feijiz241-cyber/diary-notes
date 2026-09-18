import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import { searchAll, searchEntries } from './search'
import { putEntry, putNote } from './db'

const mock = createMockApi()

beforeEach(() => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
})

describe('search', () => {
  it('finds by title and body, case-insensitive, empty query returns none', async () => {
    await putEntry({
      date: '2026-07-10',
      title: '旅行',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '海边很美' }] }] },
      mood: null,
      tags: [],
    })
    await putEntry({
      date: '2026-07-11',
      title: '工作',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write CODE daily' }] }] },
      mood: null,
      tags: [],
    })

    const byTitle = await searchEntries('旅行')
    expect(byTitle.length).toBe(1)
    expect(byTitle[0].date).toBe('2026-07-10')

    const byBody = await searchEntries('海边')
    expect(byBody.length).toBe(1)

    const caseInsensitive = await searchEntries('code')
    expect(caseInsensitive.length).toBe(1)

    const none = await searchEntries('XYZ')
    expect(none.length).toBe(0)

    expect(await searchEntries('')).toEqual([])
  })

  it('searchAll 同时搜日记与笔记，并用 kind 标注来源', async () => {
    await putEntry({
      date: '2026-07-10',
      title: '旅行',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '去了海边' }] }],
      },
      mood: null,
      tags: [],
    })
    await putNote({
      date: '2026-07-11',
      title: '装备清单',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '旅行要带的东西' }] }],
      },
    })

    const r = await searchAll('旅行')
    expect(r.length).toBe(2)
    expect(r.map((x) => x.kind).sort()).toEqual(['diary', 'note'])
    expect(r.every((x) => x.snippet.length > 0)).toBe(true)
  })

  it('searchEntries 仍只搜日记（森林页高亮用）', async () => {
    await putNote({
      date: '2026-07-11',
      title: '旅行笔记',
      content: { type: 'doc', content: [] },
    })
    expect(await searchEntries('旅行')).toHaveLength(0)
  })
})
