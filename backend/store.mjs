import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * 深拷贝一个 JSON 值。
 * 用途：读缓存命中时绝不把缓存本体交给调用方 —— upsertByDate 里就有
 * `all[idx] = updated` 这类原地修改，一旦共享引用，缓存会被调用方悄悄改脏。
 */
function deepClone(value) {
  if (value === null || typeof value !== 'object') return value
  return structuredClone(value)
}

/**
 * 文件存储核心：把日记、笔记、图片与附件落盘到 dataDir。
 * 所有写操作经串行队列（_writeChain），避免并发写 diary.json 损坏。
 *
 * 读路径带内存缓存（四份 JSON 各一份）：命中直接返回深拷贝，不读盘。
 * 缓存只由本实例的写入与 invalidateCache() 更新，因此**不建议多个进程同时写同一个数据目录**；
 * 若确实有外部进程改过文件，调用 invalidateCache() 即可重新读盘。
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
    this._tmpSeq = 0
    /** 读缓存：文件绝对路径 -> 已解析内容（权威副本）。未命中/失效即不存在该键。 */
    this._cache = new Map()
  }

  /**
   * 建目录并补齐默认文件。
   * 只对**缺失**的文件写空值（写成功时 _writeJSON 会顺手把缓存填好）；
   * 已存在的文件一律不碰、也不预读，让第一次真正读的时候再按需加载。
   */
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

  /**
   * 读 JSON，带内存缓存。
   * 返回**深拷贝**：调用方拿到的是一份可自由修改的副本，改不到缓存本体。
   *
   * 读盘要区分两种失败，不能一律回退 fallback：
   *  - 文件确实不存在（ENOENT）/ 内容确实损坏（JSON 解析失败）→ 回退 fallback，不缓存（文件修好能自愈）
   *  - 文件存在但**这一刻读不动**（Windows 上 rename 替换的窗口期会抛 EBUSY/EPERM/EACCES）→ 重试；
   *    重试仍失败就抛出去，绝不回退成空数组。否则并发读写时会读到「瞬间变空」，
   *    上层会当成「数据全没了」（这条以前真的偶发过，测试 `原子写入：并发读永远不会读到"瞬间变空"` 抓的就是它）。
   */
  async _readJSON(file, fallback) {
    if (this._cache.has(file)) {
      return deepClone(this._cache.get(file))
    }
    const raw = await this._readFileWithRetry(file)
    if (raw === null) {
      // 文件不存在：按 fallback 处理，且**不把 fallback 写进缓存**
      // （否则文件后来被修好也永远读不到；下次仍会重试读盘，能自愈）。
      // 同样返回拷贝，避免把调用方传进来的共享 fallback 对象直接交出去。
      return deepClone(fallback)
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // 内容损坏：同样回退且不缓存
      return deepClone(fallback)
    }
    this._cache.set(file, parsed)
    return deepClone(parsed)
  }

  /**
   * 读文件内容；文件不存在返回 null；可重试的占用错误退避重试，最终仍失败则抛出。
   */
  async _readFileWithRetry(file, attempts = 12) {
    for (let i = 1; ; i++) {
      try {
        return await fs.readFile(file, 'utf8')
      } catch (err) {
        const code = err && err.code
        if (code === 'ENOENT') return null
        const retriable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
        if (!retriable || i >= attempts) throw err
        // 与 _renameOver 同理：等差退避 + 抖动，避免和写者形成同频
        const delay = Math.min(5 * i, 60) + Math.floor(Math.random() * 10)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  /**
   * 让读缓存失效。不传参＝全部失效，传文件路径（或 'entries'/'notes'/'images'/'files'）＝按份失效。
   * 外部进程改过数据目录、或手工修过 JSON 之后调用它，下一次读就会重新读盘。
   */
  invalidateCache(which) {
    if (which === undefined) {
      this._cache.clear()
      return
    }
    const target = this._resolveCacheKey(which)
    if (target) this._cache.delete(target)
  }

  /** 把 'entries' 之类的短名解析成文件绝对路径；也接受路径本身。 */
  _resolveCacheKey(which) {
    const aliases = {
      entries: this.entriesFile,
      notes: this.notesFile,
      images: this.manifestFile,
      files: this.filesManifestFile,
    }
    if (Object.prototype.hasOwnProperty.call(aliases, which)) return aliases[which]
    if (typeof which === 'string' && which.length > 0) return which
    return null
  }

  /**
   * 原子写入：先写同目录临时文件，再 rename 替换。
   * 避免「截断—写入」期间被并发读读到半截 JSON（那种情况下会回退成空数组）。
   * 写成功同步更新读缓存（而不是简单失效），否则每次写后的第一次读又要读一次盘；
   * 写失败必须让该文件缓存失效，避免内存里的旧值与磁盘越走越远。
   */
  async _writeJSON(file, data) {
    const tmp = `${file}.${process.pid}.${++this._tmpSeq}.tmp`
    try {
      await fs.writeFile(tmp, JSON.stringify(data, null, 2))
      await this._renameOver(tmp, file)
      // 缓存存一份独立快照：data 是调用方持有的对象，之后可能被它继续改
      this._cache.set(file, structuredClone(data))
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {})
      this._cache.delete(file)
      throw err
    }
  }

  /**
   * Windows 下若目标文件正被读句柄占用，rename 会抛 EPERM/EBUSY/EACCES。
   * 短暂退避重试即可；重试期间读者只会看到完整的旧版或新版，不会看到半截内容。
   *
   * 重试预算为什么要给到 ~1.6 秒（原先是 8 次 × 10~80ms ≈ 360ms）：
   * 压力测试里一个循环读 150 次、同时连写 40 次，实测约每 3 次有 1 次
   * 8 次重试全撞在「读者刚好开着句柄」的窗口里，直接抛 EPERM 让整次保存失败。
   * Windows 的占用窗口是「读者打开→读完→关闭」的整段时间，读者越密集窗口越连续，
   * 360ms 不够穿过去。20 次、单次上限 120ms（外加抖动避免和读者同频）实测稳定。
   *
   * 这不是掩盖问题：rename 失败会让这次保存真的丢掉，宁可多等也不能丢数据。
   */
  async _renameOver(tmp, file, attempts = 20) {
    for (let i = 1; ; i++) {
      try {
        await fs.rename(tmp, file)
        return
      } catch (err) {
        const code = err && err.code
        const retriable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
        if (!retriable || i >= attempts) throw err
        // 抖动：纯等差退避会和读者循环形成同频共振，永远撞在同一个窗口上
        const delay = Math.min(10 * i, 120) + Math.floor(Math.random() * 15)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
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

  /**
   * 删除单篇日记。
   * 只删条目本身，**不再**连带删除该日期（entryId）下的图片与附件：
   * 素材按日期归属且与笔记共享同一池子，连带删会把同日笔记仍在引用的文件删掉。
   * 需要回收「没人引用」的素材时，走前端的「清理未引用素材」；全量重置走 clearAllData。
   */
  async deleteById(id) {
    return this._enqueue(async () => {
      const all = await this.readAll()
      if (!all.some((e) => e.id === id)) return
      const next = all.filter((e) => e.id !== id)
      await this._writeJSON(this.entriesFile, next)
    })
  }

  /**
   * 删除某 entry（按 date）关联的全部附件（在已入队的写任务内调用）。
   * 注意：deleteById 已不再调用它；保留给「按日期回收素材」这类显式场景使用。
   */
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

  /** 全量图片元数据（供「清理未引用素材」使用）。 */
  async listAllImages() {
    const manifest = await this._readJSON(this.manifestFile, {})
    return Object.entries(manifest).map(([id, v]) => ({ id, ...v }))
  }

  /** 清空全部图片（在已入队的写任务内调用）。 */
  async _clearAllImages() {
    const manifest = await this._readJSON(this.manifestFile, {})
    for (const [imgId, meta] of Object.entries(manifest)) {
      await fs.rm(path.join(this.imagesDir, `${imgId}.${meta.ext}`), { force: true })
    }
    await this._writeJSON(this.manifestFile, {})
  }

  /**
   * 只清空日记条目，不动图片/附件。
   * 素材按日期归属且与笔记共享，连带删除会波及同日笔记仍在引用的文件。
   */
  async clearEntries() {
    return this._enqueue(async () => {
      await this._writeJSON(this.entriesFile, [])
    })
  }

  /** 全量重置：日记 + 笔记 + 图片 + 附件（用于「还原备份」）。 */
  async clearAllData() {
    return this._enqueue(async () => {
      await this._writeJSON(this.entriesFile, [])
      await this._writeJSON(this.notesFile, [])
      await this._clearAllImages()
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

  /** 全量附件元数据（供「清理未引用素材」使用）。 */
  async listAllFiles() {
    const manifest = await this.readFilesManifest()
    return Object.entries(manifest).map(([id, v]) => ({ id, ...v }))
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
