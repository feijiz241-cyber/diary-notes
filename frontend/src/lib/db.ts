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

const BASE = '/api'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function extFromType(type: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[type] || 'png'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '') // 去掉 data:...;base64, 前缀
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function parseJSON(res: Response): Promise<any> {
  if (!res.ok) throw new Error(`API ${res.status} ${res.url}`)
  return res.json()
}

/** 按日期写入；同日若存在则覆盖更新（一天一篇）。返回 entry id。 */
export async function putEntry(
  data: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const res = await fetch(`${BASE}/entries`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const e = (await parseJSON(res)) as Entry
  return e.id
}

export async function getByDate(date: string): Promise<Entry | undefined> {
  const res = await fetch(`${BASE}/entries/${encodeURIComponent(date)}`)
  if (res.status === 404) return undefined
  return (await parseJSON(res)) as Entry
}

/** 取某年某月（1-12）的全部日记。 */
export async function getMonth(year: number, month: number): Promise<Entry[]> {
  const m = `${year}-${String(month).padStart(2, '0')}`
  const res = await fetch(`${BASE}/entries?month=${encodeURIComponent(m)}`)
  return (await parseJSON(res)) as Entry[]
}

/** 取某年（1-12 月）的全部日记。 */
export async function getYear(year: number): Promise<Entry[]> {
  const res = await fetch(`${BASE}/entries?year=${year}`)
  return (await parseJSON(res)) as Entry[]
}

export async function getAll(): Promise<Entry[]> {
  const res = await fetch(`${BASE}/entries`)
  return (await parseJSON(res)) as Entry[]
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`${BASE}/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJSON(res)
}

/** ---------- 图片 ---------- */

export async function putImage(entryId: string, blob: Blob): Promise<string> {
  const base64 = await blobToBase64(blob)
  const imageId = uuid()
  const res = await fetch(`${BASE}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, entryId, ext: extFromType(blob.type), base64 }),
  })
  await parseJSON(res)
  return imageId
}

export async function getImagesByEntry(entryId: string): Promise<ImageRecord[]> {
  const res = await fetch(`${BASE}/images?entryId=${encodeURIComponent(entryId)}`)
  const list = (await parseJSON(res)) as Array<{ id: string; entryId: string; ext: string; type: string }>
  return Promise.all(
    list.map(async (m) => {
      const imgRes = await fetch(`${BASE}/images/${m.id}`)
      const buf = await imgRes.arrayBuffer()
      const blob = new Blob([buf], { type: m.type })
      return { id: m.id, entryId: m.entryId, blob, createdAt: 0 }
    }),
  )
}

export async function clearAll(): Promise<void> {
  const res = await fetch(`${BASE}/entries`, { method: 'DELETE' })
  await parseJSON(res)
}
