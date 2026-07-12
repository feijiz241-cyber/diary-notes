import { getAll, putEntry, putImage, clearAll, getImagesByEntry } from './db'
import { docToText } from './editor-serialize'
import { getMood } from './mood'
import type { Entry } from './db'

export interface ExportImage {
  id: string
  entryId: string
  dataUrl: string
}

export interface ExportBundle {
  version: 1
  exportedAt: string
  entries: Entry[]
  images: ExportImage[]
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
  const images: ExportImage[] = []
  for (const e of entries) {
    const recs = await getImagesByEntry(e.date)
    for (const rec of recs) {
      images.push({ id: rec.id, entryId: rec.entryId, dataUrl: await blobToDataUrl(rec.blob) })
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), entries, images }
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

/** 导入导出包：清空后还原全部日记与图片（即"还原备份"）。 */
export async function importBundle(bundle: ExportBundle): Promise<void> {
  if (!bundle || !Array.isArray(bundle.entries)) throw new Error('无效的备份文件')
  await clearAll()
  for (const e of bundle.entries) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
    await putEntry(rest)
  }
  for (const img of bundle.images ?? []) {
    await putImage(img.entryId, dataUrlToBlob(img.dataUrl))
  }
}
