// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'
import { createServer } from './index.mjs'
import { MAX_BODY_BYTES } from './index.mjs'

const html = '<!doctype html><html><body><div id="root">日记入口</div></body></html>'
const js = 'console.log("bundle")'

let server
let base
let distDir
let dataDir

const listen = async (srv) => {
  if (!srv.listening) await once(srv, 'listening')
  const { port } = srv.address()
  return `http://127.0.0.1:${port}`
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-static-data-'))
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-static-dist-'))
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(distDir, 'index.html'), html)
  fs.writeFileSync(path.join(distDir, 'assets', 'app-D3ADB33F.js'), js)

  const store = new Store(dataDir)
  await store.init()
  server = createServer(store, 0, '127.0.0.1', MAX_BODY_BYTES, { distDir })
  base = await listen(server)
})

afterAll(() => {
  server.close()
})

describe('生产模式：后端托管 frontend/dist', () => {
  it('GET / 返回 index.html，且不让浏览器缓存它', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toContain('日记入口')
  })

  it('带哈希的资源可以长期缓存（immutable）', async () => {
    const res = await fetch(`${base}/assets/app-D3ADB33F.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(await res.text()).toBe(js)
  })

  it('前端路由（/forest、/day/2026-09-18）落到 index.html，刷新不 404', async () => {
    for (const p of ['/forest', '/day/2026-09-18', '/notes', '/calendar']) {
      const res = await fetch(`${base}${p}`)
      expect(res.status, p).toBe(200)
      expect(res.headers.get('content-type'), p).toContain('text/html')
      expect(await res.text(), p).toContain('日记入口')
    }
  })

  it('找不到的静态资源回 404 而不是 index.html（否则浏览器把 HTML 当 JS 解析）', async () => {
    const res = await fetch(`${base}/assets/nope-XYZ.js`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('/api 下不存在的路径仍然是 JSON 404，不会被 index.html 吞掉', async () => {
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'not found' })
  })

  it('目录穿越读不到 dist 之外的文件', async () => {
    const secret = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-secret-'))
    fs.writeFileSync(path.join(secret, 'secret.txt'), 'TOP-SECRET')
    const rel = path.relative(distDir, path.join(secret, 'secret.txt')).split(path.sep).join('/')

    for (const url of [`/${rel}`, `/..%2f${rel}`, `/%2e%2e%2f${rel}`]) {
      const res = await fetch(`${base}${url}`)
      expect(res.status, url).not.toBe(200)
      const body = await res.text()
      expect(body, url).not.toContain('TOP-SECRET')
    }
  })

  it('HEAD 只回头不回体', async () => {
    const res = await fetch(`${base}/`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(html)))
    expect(await res.text()).toBe('')
  })

  it('dist 不存在时只提供 API，不崩（开发模式走 vite dev 时就是这个状态）', async () => {
    const store = new Store(dataDir)
    await store.init()
    const bare = createServer(store, 0, '127.0.0.1', MAX_BODY_BYTES, { distDir: null })
    const bareBase = await listen(bare)
    try {
      const home = await fetch(`${bareBase}/`)
      expect(home.status).toBe(404)
      expect(home.headers.get('content-type')).toContain('application/json')

      const api = await fetch(`${bareBase}/api/entries`)
      expect(api.status).toBe(200)
      expect(Array.isArray(await api.json())).toBe(true)
    } finally {
      await new Promise((r) => bare.close(r))
    }
  })
})
