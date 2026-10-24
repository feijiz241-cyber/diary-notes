import { putEntry, putImage, type Entry } from './db'

/** 旧版（浏览器 IndexedDB）数据库名与表名，与历史前端数据层保持一致。 */
const DB_NAME = 'diary-web'
const ENTRIES_STORE = 'entries'
const IMAGES_STORE = 'images'

interface OldEntry {
  id: string
  date: string
  title: string
  content: unknown
  mood: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}

interface OldImage {
  id: string
  entryId: string
  blob: Blob
  createdAt: number
}

/**
 * 打开旧版 IndexedDB。
 * 注意：库不存在时 indexedDB.open 会创建它（默认 version 1 且不带任何表），
 * 这不影响判断——后续读表前会先看 objectStoreNames，缺表即按「没有数据」处理。
 */
function openOldDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开旧版 IndexedDB 失败'))
  })
}

/** 读某张表的全部记录；表不存在时返回空数组（旧库可能只有 entries 没有 images）。 */
function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error ?? new Error(`读取 ${store} 失败`))
  })
}

/** 统计某张表的记录数；表不存在时返回 0。 */
function countAll(db: IDBDatabase, store: string): Promise<number> {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve(0)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(`统计 ${store} 失败`))
  })
}

/** 去掉旧记录里由后端生成的字段，只留 putEntry 需要的部分。 */
function toEntryPayload(e: OldEntry): Omit<Entry, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = e
  return rest
}

/** 旧浏览器 IndexedDB 中是否还有日记。库不存在 / 没有 entries 表 / 表为空 → false。 */
export async function hasBrowserData(): Promise<boolean> {
  let db: IDBDatabase | undefined
  try {
    db = await openOldDB()
    return (await countAll(db, ENTRIES_STORE)) > 0
  } finally {
    db?.close()
  }
}

/** 把旧 IndexedDB 的日记与图片迁移到本地后端文件。返回迁移的日记篇数。 */
export async function migrateBrowserToBackend(): Promise<number> {
  let db: IDBDatabase | undefined
  try {
    db = await openOldDB()
    const entries = await readAll<OldEntry>(db, ENTRIES_STORE)
    const images = await readAll<OldImage>(db, IMAGES_STORE)
    for (const e of entries) {
      await putEntry(toEntryPayload(e))
    }
    for (const img of images) {
      await putImage(img.entryId, img.blob)
    }
    return entries.length
  } finally {
    db?.close()
  }
}
