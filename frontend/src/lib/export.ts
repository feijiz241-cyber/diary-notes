import {
  getAll,
  putEntry,
  putImage,
  clearAll,
  getImagesByEntry,
  getAllNotes,
  putNote,
  clearAllNotes,
  getFilesByEntry,
  putFile,
  clearAllFiles,
} from './db'
import { docToText } from './editor-serialize'
import { getMood } from './mood'
import type { Entry, Note } from './db'

export interface ExportImage {
  id: string
  entryId: string
  dataUrl: string
}

export interface ExportFile {
  id: string
  entryId: string
  name: string
  type: string
  size: number
  dataUrl: string
}

export interface ExportBundle {
  version: 1
  exportedAt: string
  entries: Entry[]
  notes?: Note[]
  images: ExportImage[]
  files?: ExportFile[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = (meta.match(/:(.*?);/) || [, 'application/octet-stream'])[1]
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** 构造可下载的导出包（图片以 base64 dataURL 内联）。 */
export async function buildExportBundle(): Promise<ExportBundle> {
  const entries = await getAll()
  const notes = await getAllNotes()
  // 图片/附件都按日期（entryId）归属，日记与笔记同一天共享
  const entryIds = new Set<string>()
  for (const e of entries) entryIds.add(e.date)
  for (const n of notes) entryIds.add(n.date)

  const images: ExportImage[] = []
  const files: ExportFile[] = []
  for (const entryId of entryIds) {
    for (const rec of await getImagesByEntry(entryId)) {
      images.push({ id: rec.id, entryId: rec.entryId, dataUrl: await blobToDataUrl(rec.blob) })
    }
    for (const rec of await getFilesByEntry(entryId)) {
      files.push({
        id: rec.id,
        entryId: rec.entryId,
        name: rec.name,
        type: rec.type,
        size: rec.size,
        dataUrl: await blobToDataUrl(rec.blob),
      })
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), entries, notes, images, files }
}

export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function entryToMarkdown(e: Entry): string {
  const mood = getMood(e.mood)
  const head = `# ${e.title || '(无标题)'}\n`
  const meta = `> ${e.date}${mood ? ' · ' + mood.emoji + mood.label : ''}${e.tags.length ? ' · #' + e.tags.join(' #') : ''}\n`
  const body = docToText(e.content)
  return `${head}${meta}\n${body}\n`
}

export function entriesToMarkdown(entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  return sorted.map(entryToMarkdown).join('\n---\n\n')
}

/** 导入导出包：清空后还原全部日记、笔记与图片（即"还原备份"）。 */
export async function importBundle(bundle: ExportBundle): Promise<void> {
  if (!bundle || !Array.isArray(bundle.entries)) throw new Error('无效的备份文件')
  await clearAll()
  for (const e of bundle.entries) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
    await putEntry(rest)
  }
  // 笔记：先清空再按原 id 还原（保留身份，天数内多篇关系不变）
  if (Array.isArray(bundle.notes)) {
    await clearAllNotes()
    for (const n of bundle.notes) {
      await putNote({ id: n.id, date: n.date, title: n.title, content: n.content })
    }
  }
  for (const img of bundle.images ?? []) {
    // 传入原 id，保证日记内容里引用的 imageId 在还原后依然有效
    await putImage(img.entryId, dataUrlToBlob(img.dataUrl), img.id)
  }
  // 附件：先清空再按原 id / 原文件名还原
  await clearAllFiles()
  for (const f of bundle.files ?? []) {
    await putFile(f.entryId, dataUrlToBlob(f.dataUrl), f.id, f.name)
  }
}
