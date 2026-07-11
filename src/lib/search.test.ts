import { beforeEach, describe, it, expect } from 'vitest'
import { searchEntries } from './search'
import { putEntry, clearAll } from './db'

beforeEach(async () => {
  await clearAll()
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
})
