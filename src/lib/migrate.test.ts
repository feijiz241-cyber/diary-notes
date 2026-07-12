import { describe, it, expect, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { createMockApi } from '../test/mockApi'
import { migrateBrowserToBackend, hasBrowserData } from './migrate'

const mock = createMockApi()
const oldDb = new Dexie('diary-web')
oldDb.version(1).stores({ entries: 'id,date,updatedAt', images: 'id,entryId' })

beforeEach(async () => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
  await oldDb.table('entries').clear()
  await oldDb.table('images').clear()
})

describe('migrate browser IndexedDB -> backend', () => {
  it('migrates old entries into the backend', async () => {
    await oldDb.table('entries').add({
      id: 'e1',
      date: '2026-07-11',
      title: '旧日记',
      content: { type: 'doc', content: [] },
      mood: null,
      tags: ['a'],
      createdAt: 1,
      updatedAt: 1,
    })

    const n = await migrateBrowserToBackend()
    expect(n).toBe(1)

    const all = (await (await mock.fetch('/api/entries')).json()) as Array<{ date: string }>
    expect(all.length).toBe(1)
    expect(all[0].date).toBe('2026-07-11')
  })

  it('hasBrowserData reports false when nothing in IndexedDB', async () => {
    expect(await hasBrowserData()).toBe(false)
  })
})
