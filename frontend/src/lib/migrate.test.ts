import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import { migrateBrowserToBackend, hasBrowserData } from './migrate'

const mock = createMockApi()

/** 旧版库名与表结构，与 migrate.ts 保持一致。 */
const DB_NAME = 'diary-web'
const ENTRIES = 'entries'
const IMAGES = 'images'

/** 删除旧库，保证每个用例从干净状态开始（也让 onupgradeneeded 必然触发）。 */
function deleteOldDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('删除旧库失败'))
    // 仍有未关闭的连接时删除会被阻塞，这里不卡死，让后续 open 自己排队。
    req.onblocked = () => resolve()
  })
}

/** 用原生 IndexedDB 建库并写入种子数据（结构等价于历史数据的第 1 版结构）。 */
async function seedOldDB(
  entries: Array<Record<string, unknown>>,
  images: Array<Record<string, unknown>> = [],
): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(ENTRIES)) d.createObjectStore(ENTRIES, { keyPath: 'id' })
      if (!d.objectStoreNames.contains(IMAGES)) d.createObjectStore(IMAGES, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('建旧库失败'))
  })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ENTRIES, IMAGES], 'readwrite')
    const entryStore = tx.objectStore(ENTRIES)
    for (const e of entries) entryStore.put(e)
    const imageStore = tx.objectStore(IMAGES)
    for (const i of images) imageStore.put(i)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('写入种子数据失败'))
  })
  db.close()
}

const oneEntry = {
  id: 'e1',
  date: '2026-07-11',
  title: '旧日记',
  content: { type: 'doc', content: [] },
  mood: null,
  tags: ['a'],
  createdAt: 1,
  updatedAt: 1,
}

beforeEach(async () => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
  await deleteOldDB()
})

describe('migrate browser IndexedDB -> backend', () => {
  it('migrates old entries into the backend', async () => {
    await seedOldDB([oneEntry])

    const n = await migrateBrowserToBackend()
    expect(n).toBe(1)

    const all = (await (await mock.fetch('/api/entries')).json()) as Array<{ date: string }>
    expect(all.length).toBe(1)
    expect(all[0].date).toBe('2026-07-11')
  })

  it('hasBrowserData reports false when nothing in IndexedDB', async () => {
    expect(await hasBrowserData()).toBe(false)
  })

  it('hasBrowserData reports true when old entries exist', async () => {
    await seedOldDB([oneEntry])
    expect(await hasBrowserData()).toBe(true)
  })
})
