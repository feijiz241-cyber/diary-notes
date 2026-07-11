import Dexie, { type Table } from 'dexie'

export interface Entry {
  id: string
  date: string // 'YYYY-MM-DD'，一天一篇
  title: string
  content: unknown // TipTap JSON
  mood: string | null // 心情 emoji id
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface ImageRecord {
  id: string
  entryId: string
  blob: Blob
  createdAt: number
}

class DiaryDB extends Dexie {
  entries!: Table<Entry, string>
  images!: Table<ImageRecord, string>

  constructor() {
    super('diary-web')
    this.version(1).stores({
      entries: 'id, date, updatedAt',
      images: 'id, entryId',
    })
  }
}

export const db = new DiaryDB()

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** 按日期写入；同日若存在则覆盖更新（一天一篇）。返回 entry id。 */
export async function putEntry(
  data: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const now = Date.now()
  const existing = await db.entries.where('date').equals(data.date).first()
  if (existing) {
    await db.entries.update(existing.id, { ...data, updatedAt: now })
    return existing.id
  }
  const id = uuid()
  const entry: Entry = { id, createdAt: now, updatedAt: now, ...data }
  await db.entries.add(entry)
  return id
}

export async function getByDate(date: string): Promise<Entry | undefined> {
  return db.entries.where('date').equals(date).first()
}

export async function getById(id: string): Promise<Entry | undefined> {
  return db.entries.get(id)
}

/** 取某年某月（1-12）的全部日记。 */
export async function getMonth(year: number, month: number): Promise<Entry[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return db.entries.where('date').startsWith(prefix).toArray()
}

/** 取某年（1-12 月）的全部日记。 */
export async function getYear(year: number): Promise<Entry[]> {
  const prefix = `${year}-`
  return db.entries.where('date').startsWith(prefix).toArray()
}

export async function getAll(): Promise<Entry[]> {
  return db.entries.toArray()
}

export async function deleteEntry(id: string): Promise<void> {
  const entry = await db.entries.get(id)
  await db.transaction('rw', db.entries, db.images, async () => {
    await db.entries.delete(id)
    if (entry) await deleteImagesByEntry(entry.date)
  })
}

/** ---------- 图片 ---------- */

export async function putImage(entryId: string, blob: Blob): Promise<string> {
  const id = uuid()
  await db.images.add({ id, entryId, blob, createdAt: Date.now() })
  return id
}

export async function getImagesByEntry(entryId: string): Promise<ImageRecord[]> {
  return db.images.where('entryId').equals(entryId).toArray()
}

export async function deleteImagesByEntry(entryId: string): Promise<void> {
  await db.images.where('entryId').equals(entryId).delete()
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.entries, db.images, async () => {
    await db.entries.clear()
    await db.images.clear()
  })
}
