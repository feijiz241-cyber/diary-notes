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

/** 导入前的目标形态：整份备份已在内存里校验、解码完毕，还没碰磁盘。 */
interface PreparedImport {
  entries: Array<Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>>
  notes: Array<{ id: string; date: string; title: string; content: unknown }>
  images: Array<{ id: string; entryId: string; blob: Blob }>
  files: Array<{ id: string; entryId: string; name: string; blob: Blob }>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function fail(message: string): never {
  throw new Error(message)
}

function readDate(value: unknown, where: string): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    fail(`${where}的日期不是 YYYY-MM-DD（读到的值：${JSON.stringify(value)}）`)
  }
  return value
}

function readId(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') fail(`${where}缺少 id`)
  return value
}

function decodeDataUrl(value: unknown, where: string): Blob {
  if (typeof value !== 'string' || !value.startsWith('data:') || !value.includes(',')) {
    fail(`${where}的内容不是完整的 dataURL（备份文件可能被手动改过或截断了）`)
  }
  try {
    return dataUrlToBlob(value)
  } catch {
    fail(`${where}的内容解不出来（base64 已损坏）`)
  }
}

/**
 * 只做校验与解码，不访问网络、不改本地数据。
 *
 * 存在的理由：以前 importBundle 是「先把本地全清空，再逐条写」，
 * 于是只要备份文件本身有问题（手改坏了、复制截断了、版本对不上），
 * 用户就会得到「原有数据没了 + 新的也没进来」——这份损失无法撤销。
 * 现在坏文件在动磁盘之前就会被拦下来，原数据保持原样。
 */
export function prepareImport(bundle: ExportBundle): PreparedImport {
  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.entries)) {
    fail('这不是本应用导出的备份文件（缺少 entries 列表）')
  }
  if (bundle.version !== undefined && bundle.version !== 1) {
    fail(`备份文件的版本是 ${String(bundle.version)}，这个版本的应用读不了`)
  }

  const entries: PreparedImport['entries'] = []
  bundle.entries.forEach((e, i) => {
    const where = `第 ${i + 1} 篇日记`
    if (!e || typeof e !== 'object') fail(`备份文件${where}格式不对`)
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
    entries.push({
      date: readDate(rest.date, where),
      title: typeof rest.title === 'string' ? rest.title : '',
      content: rest.content ?? EMPTY_DOC,
      mood: rest.mood ?? null,
      tags: Array.isArray(rest.tags) ? rest.tags : [],
    })
  })

  const notes: PreparedImport['notes'] = []
  if (bundle.notes !== undefined) {
    if (!Array.isArray(bundle.notes)) fail('备份文件里的 notes 不是列表')
    bundle.notes.forEach((n, i) => {
      const where = `第 ${i + 1} 篇笔记`
      if (!n || typeof n !== 'object') fail(`备份文件${where}格式不对`)
      notes.push({
        id: readId(n.id, where),
        date: readDate(n.date, where),
        title: typeof n.title === 'string' ? n.title : '',
        content: n.content ?? EMPTY_DOC,
      })
    })
  }

  const images: PreparedImport['images'] = []
  if (bundle.images !== undefined) {
    if (!Array.isArray(bundle.images)) fail('备份文件里的 images 不是列表')
    bundle.images.forEach((img, i) => {
      const where = `第 ${i + 1} 张图片`
      if (!img || typeof img !== 'object') fail(`备份文件${where}格式不对`)
      images.push({
        id: readId(img.id, where),
        entryId: readDate(img.entryId, where + '所属日期'),
        blob: decodeDataUrl(img.dataUrl, where),
      })
    })
  }

  const files: PreparedImport['files'] = []
  if (bundle.files !== undefined) {
    if (!Array.isArray(bundle.files)) fail('备份文件里的 files 不是列表')
    bundle.files.forEach((f, i) => {
      const where = `第 ${i + 1} 个附件`
      if (!f || typeof f !== 'object') fail(`备份文件${where}格式不对`)
      files.push({
        id: readId(f.id, where),
        entryId: readDate(f.entryId, where + '所属日期'),
        name: typeof f.name === 'string' && f.name ? f.name : 'attachment',
        blob: decodeDataUrl(f.dataUrl, where),
      })
    })
  }

  return { entries, notes, images, files }
}

/**
 * 导入导出包：清空后还原全部日记、笔记、图片与附件（即"还原备份"）。
 *
 * 分两步：先 prepareImport 全量校验（不动磁盘），再清空、逐条写入。
 */
export async function importBundle(bundle: ExportBundle): Promise<void> {
  const prepared = prepareImport(bundle)

  await clearAll()
  await clearAllNotes()
  await clearAllFiles()

  try {
    for (const e of prepared.entries) await putEntry(e)
    for (const n of prepared.notes) await putNote(n)
    // 传入原 id，保证日记内容里引用的 imageId 在还原后依然有效
    for (const img of prepared.images) await putImage(img.entryId, img.blob, img.id)
    for (const f of prepared.files) await putFile(f.entryId, f.blob, f.id, f.name)
  } catch (err) {
    // 到这一步本地已经清空过了，必须如实告诉用户，别让它读起来像"什么都没发生"
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `导入到一半失败了，原有数据已经被清空。请再选一次同一份备份文件重试。（${detail}）`,
    )
  }
}
