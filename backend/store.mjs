import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * 文件存储核心：把日记、笔记、图片与附件落盘到 dataDir。
 * 所有写操作经串行队列（_writeChain），避免并发写 diary.json 损坏。
 */
export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir
    this.entriesFile = path.join(dataDir, 'diary.json')
    this.notesFile = path.join(dataDir, 'notes.json')
    this.imagesDir = path.join(dataDir, 'images')
    this.manifestFile = path.join(this.imagesDir, 'manifest.json')
    this.filesDir = path.join(dataDir, 'files')
    this.filesManifestFile = path.join(this.filesDir, 'manifest.json')
    this._writeChain = Promise.resolve()
  }

  async init() {
    await fs.mkdir(this.imagesDir, { recursive: true })
    await fs.mkdir(this.filesDir, { recursive: true })
    try {
      await fs.access(this.entriesFile)
    } catch {
      await this._writeJSON(this.entriesFile, [])
    }
    try {
      await fs.access(this.notesFile)
    } catch {
      await this._writeJSON(this.notesFile, [])
    }
    try {
      await fs.access(this.manifestFile)
    } catch {
      await this._writeJSON(this.manifestFile, {})
    }
    try {
      await fs.access(this.filesManifestFile)
    } catch {
      await this._writeJSON(this.filesManifestFile, {})
    }
  }

  /** 把写任务串行排入队列，返回其 promise。 */
  _enqueue(task) {
    const run = this._writeChain.then(task, task)
    this._writeChain = run.catch(() => {})
    return run
  }

  async _readJSON(file, fallback) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return fallback
    }
  }

  async _writeJSON(file, data) {
    await fs.writeFile(file, JSON.stringify(data, null, 2))
  }

  async readAll() {
    return this._readJSON(this.entriesFile, [])
  }

  async getByDate(date) {
    const all = await this.readAll()
    return all.find((e) => e.date === date)
  }

  /** 按 date 一天一篇；存在则覆盖更新。 */
  async upsertByDate(entry) {
    return this._enqueue(async () => {
      const all = await this.readAll()
      const idx = all.findIndex((e) => e.date === entry.date)
      const now = Date.now()
      if (idx >= 0) {
        const updated = { ...all[idx], ...entry, updatedAt: now }
        all[idx] = updated
        await this._writeJSON(this.entriesFile, all)
        return updated
      }
      const created = { id: entry.id || crypto.randomUUID(), createdAt: now, updatedAt: now, ...entry }
      all.push(created)
      await this._writeJSON(this.entriesFile, all)
      return created
    })
  }

  async deleteById(id) {
    return this._enqueue(async () => {
      const all = await this.readAll()
      const target = all.find((e) => e.id === id)
      if (!target) return
      const next = all.filter((e) => e.id !== id)
      await this._writeJSON(this.entriesFile, next)
      // 删除该 entry 关联的图片与附件
      const manifest = await this._readJSON(this.manifestFile, {})
      const entryId = target.date
      let changed = false
      for (const [imgId, meta] of Object.entries(manifest)) {
        if (meta.entryId === entryId) {
          await fs.rm(path.join(this.imagesDir, `${imgId}.${meta.ext}`), { force: true })
          delete manifest[imgId]
          changed = true
        }
      }
      if (changed) await this._writeJSON(this.manifestFile, manifest)
      await this._rmFilesByEntry(entryId)
    })
  }

  /** 删除某 entry（按 date）关联的全部附件（在已入队的写任务内调用）。 */
  async _rmFilesByEntry(entryId) {
    const manifest = await this._readJSON(this.filesManifestFile, {})
    let changed = false
    for (const [fid, meta] of Object.entries(manifest)) {
      if (meta.entryId === entryId) {
        await fs.rm(path.join(this.filesDir, `${fid}.${meta.ext}`), { force: true })
        delete manifest[fid]
        changed = true
      }
    }
    if (changed) await this._writeJSON(this.filesManifestFile, manifest)
  }

  /** 写图片：base64 解码落盘，manifest 记录元数据。 */
  async putImage(imageId, { entryId, ext, base64 }) {
    return this._enqueue(async () => {
      await fs.writeFile(path.join(this.imagesDir, `${imageId}.${ext}`), Buffer.from(base64, 'base64'))
      const manifest = await this._readJSON(this.manifestFile, {})
      manifest[imageId] = { entryId, ext, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }
      await this._writeJSON(this.manifestFile, manifest)
    })
  }

  async getImage(imageId) {
    const manifest = await this._readJSON(this.manifestFile, {})
    const meta = manifest[imageId]
    if (!meta) return null
    const buffer = await fs.readFile(path.join(this.imagesDir, `${imageId}.${meta.ext}`))
    return { buffer, ext: meta.ext, type: meta.type, entryId: meta.entryId }
  }

  async deleteImage(imageId) {
    return this._enqueue(async () => {
      const manifest = await this._readJSON(this.manifestFile, {})
      const meta = manifest[imageId]
      if (!meta) return
      await fs.rm(path.join(this.imagesDir, `${imageId}.${meta.ext}`), { force: true })
      delete manifest[imageId]
      await this._writeJSON(this.manifestFile, manifest)
    })
  }

  async listImages(entryId) {
    const manifest = await this._readJSON(this.manifestFile, {})
    return Object.entries(manifest)
      .filter(([, v]) => v.entryId === entryId)
      .map(([id, v]) => ({ id, ...v }))
  }

  async clearAll() {
    return this._enqueue(async () => {
      await this._writeJSON(this.entriesFile, [])
      const manifest = await this._readJSON(this.manifestFile, {})
      for (const [imgId, meta] of Object.entries(manifest)) {
        await fs.rm(path.join(this.imagesDir, `${imgId}.${meta.ext}`), { force: true })
      }
      await this._writeJSON(this.manifestFile, {})
      await this._clearAllFiles()
    })
  }

  /** ---------- 笔记（一天可多篇，独立于日记存储） ---------- */

  async readNotes() {
    return this._readJSON(this.notesFile, [])
  }

  async notesByDate(date) {
    const all = await this.readNotes()
    return all.filter((n) => n.date === date)
  }

  /** 有 id 且存在则更新，否则新建一篇笔记。 */
  async upsertNote(note) {
    return this._enqueue(async () => {
      const all = await this.readNotes()
      const now = Date.now()
      if (note.id) {
        const idx = all.findIndex((n) => n.id === note.id)
        if (idx >= 0) {
          const updated = { ...all[idx], ...note, updatedAt: now }
          all[idx] = updated
          await this._writeJSON(this.notesFile, all)
          return updated
        }
      }
      const created = {
        title: '',
        content: { type: 'doc', content: [] },
        ...note,
        id: note.id || crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      all.push(created)
      await this._writeJSON(this.notesFile, all)
      return created
    })
  }

  async deleteNote(id) {
    return this._enqueue(async () => {
      const all = await this.readNotes()
      const next = all.filter((n) => n.id !== id)
      if (next.length === all.length) return
      await this._writeJSON(this.notesFile, next)
    })
  }

  /** ---------- 附件（任意类型文件，一天/一篇可多个，按 entryId 归属） ---------- */

  async readFilesManifest() {
    return this._readJSON(this.filesManifestFile, {})
  }

  async listFiles(entryId) {
    const manifest = await this.readFilesManifest()
    return Object.entries(manifest)
      .filter(([, v]) => v.entryId === entryId)
      .map(([id, v]) => ({ id, ...v }))
  }

  /** 写附件：base64 解码落盘，manifest 记录元数据（含原始文件名/类型/大小）。 */
  async putFile(fileId, { entryId, ext, name, type, size, base64 }) {
    return this._enqueue(async () => {
      await fs.writeFile(path.join(this.filesDir, `${fileId}.${ext}`), Buffer.from(base64, 'base64'))
      const manifest = await this._readJSON(this.filesManifestFile, {})
      manifest[fileId] = {
        entryId,
        ext,
        name: name || `${fileId}.${ext}`,
        type: type || 'application/octet-stream',
        size: typeof size === 'number' ? size : Buffer.from(base64, 'base64').length,
      }
      await this._writeJSON(this.filesManifestFile, manifest)
    })
  }

  async getFile(fileId) {
    const manifest = await this.readFilesManifest()
    const meta = manifest[fileId]
    if (!meta) return null
    const buffer = await fs.readFile(path.join(this.filesDir, `${fileId}.${meta.ext}`))
    return { buffer, ...meta }
  }

  async deleteFile(fileId) {
    return this._enqueue(async () => {
      const manifest = await this._readJSON(this.filesManifestFile, {})
      const meta = manifest[fileId]
      if (!meta) return
      await fs.rm(path.join(this.filesDir, `${fileId}.${meta.ext}`), { force: true })
      delete manifest[fileId]
      await this._writeJSON(this.filesManifestFile, manifest)
    })
  }

  /** 清空全部附件（在已入队的写任务内调用）。 */
  async _clearAllFiles() {
    const manifest = await this._readJSON(this.filesManifestFile, {})
    for (const [fid, meta] of Object.entries(manifest)) {
      await fs.rm(path.join(this.filesDir, `${fid}.${meta.ext}`), { force: true })
    }
    await this._writeJSON(this.filesManifestFile, {})
  }

  async clearAllFiles() {
    return this._enqueue(() => this._clearAllFiles())
  }

  async clearNotes() {
    return this._enqueue(async () => {
      await this._writeJSON(this.notesFile, [])
    })
  }
}
