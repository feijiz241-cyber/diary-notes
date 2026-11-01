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
  // 这一天还没写：后端回 200 + null（旧后端回 404），两种都当空日记
  if (res.status === 404) return undefined
  const body = (await parseJSON(res)) as Entry | null
  return body ?? undefined
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

/**
 * 只要所有日记的日期（升序）。
 * 森林页的「距上/下篇」只需要日期，用它就不用把每篇正文都下载一遍。
 */
export async function getEntryDates(): Promise<string[]> {
  const res = await fetch(`${BASE}/entries/dates`)
  return (await parseJSON(res)) as string[]
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`${BASE}/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJSON(res)
}

/** ---------- 图片 ---------- */

export async function putImage(entryId: string, blob: Blob, id?: string): Promise<string> {
  const base64 = await blobToBase64(blob)
  const imageId = id || uuid()
  const res = await fetch(`${BASE}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, entryId, ext: extFromType(blob.type), base64 }),
  })
  await parseJSON(res)
  // 刚上传的字节还在手上，直接进缓存：插入后立刻渲染，不必再下载一遍
  cacheImageBlob(imageId, blob)
  return imageId
}

/**
 * 图片字节的内存缓存（id → Blob）。
 *
 * 为什么要有：编辑器里每个图片节点以前都会「查当天图片清单 + 把当天所有图片全下载一遍」，
 * N 张图就是 N×(1+N) 个请求、N² 次全尺寸下载。现在每个节点只按 id 取自己那一张，
 * 并在这里缓存字节：同一天来回切换、或同一张图出现在两处，都不会再走网络。
 *
 * 只缓存字节、不缓存 blob URL —— URL 由调用方在卸载时 revoke，避免悬挂引用。
 * 上限 32 张，超出按插入顺序淘汰最旧的（图片本身还在磁盘上，淘汰只意味着下次重读）。
 */
const imageBlobCache = new Map<string, Blob>()
const IMAGE_CACHE_MAX = 32

function cacheImageBlob(id: string, blob: Blob): void {
  imageBlobCache.delete(id)
  imageBlobCache.set(id, blob)
  while (imageBlobCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageBlobCache.keys().next().value
    if (oldest === undefined) break
    imageBlobCache.delete(oldest)
  }
}

/**
 * 按 id 取单张图片（命中缓存不发请求）；服务端没有这张图时返回 null。
 * 对应后端 GET /api/images/:id。
 */
export async function getImage(id: string): Promise<{ blob: Blob; type: string } | null> {
  const cached = imageBlobCache.get(id)
  if (cached) return { blob: cached, type: cached.type || 'application/octet-stream' }

  const res = await fetch(`${BASE}/images/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`API ${res.status} ${res.url}`)

  // 后端回的就是原始字节 + Content-Type；测试里的 mock Response 没有 headers，按通用类型兜底
  const headerType = res.headers?.get?.('Content-Type') || ''
  const blob = new Blob([await res.arrayBuffer()], {
    type: headerType || 'application/octet-stream',
  })
  cacheImageBlob(id, blob)
  return { blob, type: blob.type }
}

/**
 * 取某一天（entryId）的全部图片字节。
 * 只给「需要整天素材」的场合用（导出备份、清理未引用素材）；
 * 编辑器渲染单张图请走 getImage，别再每个节点拉一次整天。
 */
export async function getImagesByEntry(entryId: string): Promise<ImageRecord[]> {
  const res = await fetch(`${BASE}/images?entryId=${encodeURIComponent(entryId)}`)
  const list = (await parseJSON(res)) as ImageMeta[]
  const records = await Promise.all(
    list.map(async (m) => {
      const got = await getImage(m.id)
      if (!got) return null
      return { id: m.id, entryId: m.entryId, blob: got.blob, createdAt: 0 }
    }),
  )
  return records.filter((r): r is ImageRecord => r !== null)
}

/** 只清空日记条目（不影响笔记与图片/附件）。 */
export async function clearEntries(): Promise<void> {
  const res = await fetch(`${BASE}/entries`, { method: 'DELETE' })
  await parseJSON(res)
}

/** 全量重置：日记 + 笔记 + 图片 + 附件（用于「还原备份」）。 */
export async function clearAll(): Promise<void> {
  const res = await fetch(`${BASE}/data`, { method: 'DELETE' })
  await parseJSON(res)
  imageBlobCache.clear()
}

/** 图片元数据（不含内容），供「清理未引用素材」使用。 */
export interface ImageMeta {
  id: string
  entryId: string
  ext: string
  type: string
}

/** 列出全部图片元数据（不下载内容）。 */
export async function listAllImages(): Promise<ImageMeta[]> {
  const res = await fetch(`${BASE}/images`)
  return (await parseJSON(res)) as ImageMeta[]
}

export async function deleteImage(id: string): Promise<void> {
  const res = await fetch(`${BASE}/images/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJSON(res)
  imageBlobCache.delete(id)
}

/** ---------- 笔记（一天可多篇，独立于日记） ---------- */

export interface Note {
  id: string
  date: string // 'YYYY-MM-DD'
  title: string
  content: unknown // TipTap JSON
  createdAt: number
  updatedAt: number
}

export async function getNotesByDate(date: string): Promise<Note[]> {
  const res = await fetch(`${BASE}/notes?date=${encodeURIComponent(date)}`)
  return (await parseJSON(res)) as Note[]
}

export async function getAllNotes(): Promise<Note[]> {
  const res = await fetch(`${BASE}/notes`)
  return (await parseJSON(res)) as Note[]
}

/** 新建（无 id）或更新（有 id）一篇笔记。返回保存后的 Note。 */
export async function putNote(data: {
  id?: string
  date: string
  title: string
  content: unknown
}): Promise<Note> {
  const res = await fetch(`${BASE}/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return (await parseJSON(res)) as Note
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJSON(res)
}

export async function clearAllNotes(): Promise<void> {
  const res = await fetch(`${BASE}/notes`, { method: 'DELETE' })
  await parseJSON(res)
}

/** ---------- 附件（任意类型文件，独立于图片存储） ---------- */

export interface FileRecord {
  id: string
  entryId: string
  name: string
  type: string
  size: number
  blob: Blob
}

/** 单个附件大小上限（base64 走 JSON，太大易失败）。 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

function extFromName(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name)
  return m ? m[1].toLowerCase() : 'bin'
}

/** 上传一个附件，返回其 id（可传入已有 id 以在导入时保留身份）。 */
export async function putFile(entryId: string, file: File | Blob, id?: string, name?: string): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件超过 20MB 上限`)
  }
  const filename = name || (file instanceof File ? file.name : 'attachment.bin')
  const base64 = await blobToBase64(file)
  const fileId = id || uuid()
  const res = await fetch(`${BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId,
      entryId,
      ext: extFromName(filename),
      name: filename,
      type: file.type || 'application/octet-stream',
      size: file.size,
      base64,
    }),
  })
  await parseJSON(res)
  return fileId
}

export async function getFilesByEntry(entryId: string): Promise<FileRecord[]> {
  const res = await fetch(`${BASE}/files?entryId=${encodeURIComponent(entryId)}`)
  const list = (await parseJSON(res)) as Array<{
    id: string
    entryId: string
    name: string
    type: string
    size: number
  }>
  return Promise.all(
    list.map(async (m) => {
      const r = await fetch(`${BASE}/files/${m.id}`)
      const buf = await r.arrayBuffer()
      return {
        id: m.id,
        entryId: m.entryId,
        name: m.name,
        type: m.type,
        size: m.size,
        blob: new Blob([buf], { type: m.type }),
      }
    }),
  )
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJSON(res)
}

export async function clearAllFiles(): Promise<void> {
  const res = await fetch(`${BASE}/files`, { method: 'DELETE' })
  await parseJSON(res)
}

/** 附件元数据（不含内容），供「清理未引用素材」使用。 */
export interface FileMeta {
  id: string
  entryId: string
  name: string
  type: string
  size: number
}

/** 列出全部附件元数据（不下载内容）。 */
export async function listAllFiles(): Promise<FileMeta[]> {
  const res = await fetch(`${BASE}/files`)
  return (await parseJSON(res)) as FileMeta[]
}
