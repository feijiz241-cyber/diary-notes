import Dexie, { type Table } from 'dexie'
import { putEntry, putImage } from './db'

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

/** 读取旧版（IndexedDB）数据用的库结构，与历史 db.ts 保持一致。 */
class OldDB extends Dexie {
  entries!: Table<OldEntry, string>
  images!: Table<OldImage, string>
  constructor() {
    super('diary-web')
    this.version(1).stores({
      entries: 'id, date, updatedAt',
      images: 'id, entryId',
    })
  }
}

/** 旧浏览器 IndexedDB 中是否还有日记。 */
export async function hasBrowserData(): Promise<boolean> {
  const db = new OldDB()
  try {
    return (await db.entries.count()) > 0
  } finally {
    db.close()
  }
}

/** 把旧 IndexedDB 的日记与图片迁移到本地后端文件。返回迁移的日记篇数。 */
export async function migrateBrowserToBackend(): Promise<number> {
  const old = new OldDB()
  try {
    const entries = await old.entries.toArray()
    const images = await old.images.toArray()
    for (const e of entries) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
      await putEntry(rest)
    }
    for (const img of images) {
      await putImage(img.entryId, img.blob)
    }
    return entries.length
  } finally {
    old.close()
  }
}
