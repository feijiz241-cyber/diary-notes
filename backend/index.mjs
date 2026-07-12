import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Store } from './store.mjs'

const PORT = process.env.PORT || 5189

/**
 * 零依赖 HTTP 服务：把 REST API 接到 Store。
 * 返回已 listen 的 http.Server。
 */
export function createServer(store, port = PORT) {
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
    const readBody = () =>
      new Promise((resolve) => {
        let data = ''
        req.on('data', (c) => (data += c))
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : {})
          } catch {
            resolve({})
          }
        })
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
        await store.clearAll()
        sendJSON(200, { ok: true })
        return
      }

      if (entryDateMatch && method === 'DELETE') {
        const id = decodeURIComponent(entryDateMatch[1])
        await store.deleteById(id)
        sendJSON(200, { ok: true })
        return
      }

      // ---------- images ----------
      if (pathname === '/api/images' && method === 'GET') {
        const entryId = searchParams.get('entryId')
        if (!entryId) {
          sendJSON(400, { error: 'entryId required' })
          return
        }
        sendJSON(200, await store.listImages(entryId))
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

      // ---------- export / import ----------
      if (pathname === '/api/export' && method === 'GET') {
        sendJSON(200, { entries: await store.readAll() })
        return
      }

      if (pathname === '/api/import' && method === 'POST') {
        const body = await readBody()
        const entries = body.entries || []
        for (const e of entries) await store.upsertByDate(e)
        sendJSON(200, { ok: true, count: entries.length })
        return
      }

      sendJSON(404, { error: 'not found' })
    } catch (err) {
      sendJSON(500, { error: String(err?.message || err) })
    }
  })

  server.listen(port, () => {
    console.log(`[diary-server] listening on http://localhost:${port}`)
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
