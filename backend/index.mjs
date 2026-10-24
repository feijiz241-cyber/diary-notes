import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Store } from './store.mjs'

const PORT = process.env.PORT || 5189
// 默认只监听本机回环地址：日记是私人数据，不应暴露给局域网。
// 确有跨设备访问需求时，用 HOST=0.0.0.0 显式开启（届时请自行评估风险）。
const HOST = process.env.HOST || '127.0.0.1'

/**
 * 单个请求体的上限（生产默认值，32MB）。
 * 前端附件上限是 20MB（见 frontend/src/lib/db.ts 的 MAX_FILE_BYTES），走 JSON 传 base64
 * 会放大到约 27MB，再叠加 JSON 外壳与图片上传，32MB 留了余量。
 * 超限直接返回 413，不再无上限累加成字符串（否则一个超大请求就能把内存顶上去）。
 */
export const MAX_BODY_BYTES = 32 * 1024 * 1024

/** 环境变量只能把上限调小或调大，非法值一律回落到生产默认值。 */
function resolveMaxBodyBytes() {
  const n = Number(process.env.DIARY_MAX_BODY_BYTES)
  return Number.isFinite(n) && n > 0 ? n : MAX_BODY_BYTES
}

/** 带 HTTP 语义的错误：由顶层 catch 统一转成对应状态码，而不是一律 500。 */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * 零依赖 HTTP 服务：把 REST API 接到 Store。
 * 返回已 listen 的 http.Server。
 * @param {number} maxBodyBytes 请求体上限，默认取 MAX_BODY_BYTES（测试可传小值，不必真发 33MB）
 */
export function createServer(store, port = PORT, host = HOST, maxBodyBytes = resolveMaxBodyBytes()) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const { pathname, searchParams } = url
    const method = req.method || 'GET'

    const sendJSON = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    const sendFile = (buffer, type) => {
      res.writeHead(200, { 'Content-Type': type })
      res.end(buffer)
    }
    /**
     * 读取并解析请求体。
     * - 空请求体（如不带 body 的 DELETE）按 {} 处理，向后兼容；
     * - 超过 maxBodyBytes 立即停止读取（pause）并以 413 拒绝，不再累积，避免内存尖峰；
     * - JSON 解析失败返回 400，不再静默成 {}（否则客户端拿到 200 会以为写成功了）。
     */
    const readBody = () =>
      new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        let settled = false

        const fail = (status, message) => {
          if (settled) return
          settled = true
          req.removeListener('data', onData)
          req.removeListener('end', onEnd)
          // 注意：error 监听必须一直挂着。客户端中途断开或我们主动销毁 req 时，
          // 流会 emit 'error'，若此时没有监听器会变成未捕获异常，直接把进程带崩。
          reject(new HttpError(status, message))
        }

        function onData(chunk) {
          if (settled) return
          size += chunk.length
          if (size > maxBodyBytes) {
            // 超限：丢掉已收内容、暂停继续读，让上层尽快回 413
            chunks.length = 0
            req.pause()
            fail(413, 'payload too large')
            return
          }
          chunks.push(chunk)
        }

        function onEnd() {
          if (settled) return
          settled = true
          req.removeListener('data', onData)
          if (size === 0) {
            resolve({})
            return
          }
          let parsed
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            reject(new HttpError(400, 'invalid json'))
            return
          }
          resolve(parsed)
        }

        function onError() {
          // 请求流自身出错（客户端断开等）：已 settle 就吞掉，否则按 400 处理。
          if (settled) return
          fail(400, 'invalid request')
        }

        req.on('data', onData)
        req.on('end', onEnd)
        req.on('error', onError)
      })

    try {
      // ---------- entries ----------
      if (pathname === '/api/entries' && method === 'GET') {
        const year = searchParams.get('year')
        const month = searchParams.get('month')
        let all = await store.readAll()
        if (year) all = all.filter((e) => e.date.startsWith(`${year}-`))
        if (month) all = all.filter((e) => e.date.startsWith(month))
        sendJSON(200, all)
        return
      }

      const entryIdMatch = pathname.match(/^\/api\/entries\/id\/([^/]+)$/)
      if (entryIdMatch && method === 'GET') {
        const id = decodeURIComponent(entryIdMatch[1])
        const all = await store.readAll()
        const e = all.find((x) => x.id === id)
        if (e) sendJSON(200, e)
        else sendJSON(404, { error: 'not found' })
        return
      }

      const entryDateMatch = pathname.match(/^\/api\/entries\/([^/]+)$/)
      if (entryDateMatch && method === 'GET') {
        const date = decodeURIComponent(entryDateMatch[1])
        const e = await store.getByDate(date)
        if (e) sendJSON(200, e)
        else sendJSON(404, { error: 'not found' })
        return
      }

      if (pathname === '/api/entries' && method === 'PUT') {
        const body = await readBody()
        const e = await store.upsertByDate(body)
        sendJSON(200, e)
        return
      }

      if (pathname === '/api/entries' && method === 'DELETE') {
        // 只清日记条目，素材由「清理未引用素材」单独处理
        await store.clearEntries()
        sendJSON(200, { ok: true })
        return
      }

      if (entryDateMatch && method === 'DELETE') {
        const id = decodeURIComponent(entryDateMatch[1])
        await store.deleteById(id)
        sendJSON(200, { ok: true })
        return
      }

      // ---------- notes（一天可多篇） ----------
      if (pathname === '/api/notes' && method === 'GET') {
        const date = searchParams.get('date')
        const list = date ? await store.notesByDate(date) : await store.readNotes()
        sendJSON(200, list)
        return
      }

      if (pathname === '/api/notes' && method === 'PUT') {
        const body = await readBody()
        const n = await store.upsertNote(body)
        sendJSON(200, n)
        return
      }

      if (pathname === '/api/notes' && method === 'DELETE') {
        await store.clearNotes()
        sendJSON(200, { ok: true })
        return
      }

      const noteIdMatch = pathname.match(/^\/api\/notes\/([^/]+)$/)
      if (noteIdMatch && method === 'DELETE') {
        const id = decodeURIComponent(noteIdMatch[1])
        await store.deleteNote(id)
        sendJSON(200, { ok: true })
        return
      }

      // ---------- files（附件：任意类型文件） ----------
      if (pathname === '/api/files' && method === 'GET') {
        // 不带 entryId 时返回全部（供「清理未引用素材」使用）
        const entryId = searchParams.get('entryId')
        sendJSON(200, entryId ? await store.listFiles(entryId) : await store.listAllFiles())
        return
      }

      const fileIdMatch = pathname.match(/^\/api\/files\/([^/]+)$/)
      if (fileIdMatch && method === 'GET') {
        const id = decodeURIComponent(fileIdMatch[1])
        const f = await store.getFile(id)
        if (f) {
          const name = f.name || `${id}.${f.ext || 'bin'}`
          const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
          res.writeHead(200, {
            'Content-Type': f.type || 'application/octet-stream',
            'Content-Length': f.buffer.length,
            'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          })
          res.end(f.buffer)
        } else {
          sendJSON(404, { error: 'not found' })
        }
        return
      }

      if (pathname === '/api/files' && method === 'POST') {
        const body = await readBody()
        if (!body.fileId || !body.base64) {
          sendJSON(400, { error: 'fileId and base64 required' })
          return
        }
        await store.putFile(body.fileId, {
          entryId: body.entryId,
          ext: body.ext || 'bin',
          name: body.name,
          type: body.type,
          size: body.size,
          base64: body.base64,
        })
        sendJSON(200, { ok: true })
        return
      }

      if (pathname === '/api/files' && method === 'DELETE') {
        await store.clearAllFiles()
        sendJSON(200, { ok: true })
        return
      }

      if (fileIdMatch && method === 'DELETE') {
        const id = decodeURIComponent(fileIdMatch[1])
        await store.deleteFile(id)
        sendJSON(200, { ok: true })
        return
      }

      // ---------- images ----------
      if (pathname === '/api/images' && method === 'GET') {
        // 不带 entryId 时返回全部（供「清理未引用素材」使用）
        const entryId = searchParams.get('entryId')
        sendJSON(200, entryId ? await store.listImages(entryId) : await store.listAllImages())
        return
      }

      const imageIdMatch = pathname.match(/^\/api\/images\/([^/]+)$/)
      if (imageIdMatch && method === 'GET') {
        const id = decodeURIComponent(imageIdMatch[1])
        const img = await store.getImage(id)
        if (img) sendFile(img.buffer, img.type)
        else sendJSON(404, { error: 'not found' })
        return
      }

      if (pathname === '/api/images' && method === 'POST') {
        const body = await readBody()
        await store.putImage(body.imageId, {
          entryId: body.entryId,
          ext: body.ext,
          base64: body.base64,
        })
        sendJSON(200, { ok: true })
        return
      }

      if (imageIdMatch && method === 'DELETE') {
        const id = decodeURIComponent(imageIdMatch[1])
        await store.deleteImage(id)
        sendJSON(200, { ok: true })
        return
      }

      // ---------- 全量重置（日记 + 笔记 + 素材） ----------
      if (pathname === '/api/data' && method === 'DELETE') {
        await store.clearAllData()
        sendJSON(200, { ok: true })
        return
      }

      // ---------- export / import ----------
      if (pathname === '/api/export' && method === 'GET') {
        sendJSON(200, {
          entries: await store.readAll(),
          notes: await store.readNotes(),
          files: await store.readFilesManifest(),
          // 图片元数据也要导出：备份/迁移时缺这一项，图片清单会在目标端丢失
          images: await store.listAllImages(),
        })
        return
      }

      if (pathname === '/api/import' && method === 'POST') {
        const body = await readBody()
        const entries = body.entries || []
        for (const e of entries) await store.upsertByDate(e)
        const notes = body.notes || []
        for (const n of notes) await store.upsertNote(n)
        const files = body.files || []
        for (const f of files) await store.putFile(f.id, f)
        sendJSON(200, { ok: true, count: entries.length + notes.length + files.length })
        return
      }

      sendJSON(404, { error: 'not found' })
    } catch (err) {
      // 请求体超限/非法 JSON 这类错误自带 HTTP 语义，按原状态码回；其余仍按 500。
      const status = err instanceof HttpError ? err.status : 500
      if (res.headersSent || res.writableEnded) return
      // 413 时请求体压根没读完（已 pause）。这种连接绝不能复用：残留字节会被
      // 当成下一个请求解析，直接导致 HTTP 协议错位。这里显式关连接，回完就断。
      if (!req.complete) {
        sendJSON(status, { error: String(err?.message || err) }, { Connection: 'close' })
        res.once('finish', () => req.destroy())
        return
      }
      sendJSON(status, { error: String(err?.message || err) })
    }
  })

  server.listen(port, host, () => {
    console.log(`[diary-server] listening on http://${host}:${port}`)
  })
  return server
}

// 直接运行时启动（默认数据目录 ./data）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.env.DATA_DIR || fileURLToPath(new URL('./data/', import.meta.url))
  const store = new Store(dataDir)
  await store.init()
  createServer(store, PORT)
}
