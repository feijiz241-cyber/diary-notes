// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'
import { createServer } from './index.mjs'

const PORT = 5271
const BASE = `http://127.0.0.1:${PORT}`

let server
let store
let dir

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-http-test-'))
  store = new Store(dir)
  await store.init()
  server = createServer(store, PORT)
  if (!server.listening) await once(server, 'listening')
})

afterAll(() => {
  server.close()
})

describe('HTTP API (index.mjs)', () => {
  it('默认只监听回环地址，不暴露到局域网', async () => {
    const s = createServer(store, 0)
    if (!s.listening) await once(s, 'listening')
    const addr = s.address()
    expect(addr.address).toBe('127.0.0.1')
    await new Promise((r) => s.close(r))
  })

  it('PUT /api/entries then GET /api/entries/:date', async () => {
    const putRes = await fetch(`${BASE}/api/entries`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-07-12', title: 'hello', content: {}, mood: null, tags: [] }),
    })
    expect(putRes.status).toBe(200)
    const created = await putRes.json()
    expect(created.id).toBeTruthy()

    const getRes = await fetch(`${BASE}/api/entries/2026-07-12`)
    expect(getRes.status).toBe(200)
    const got = await getRes.json()
    expect(got.title).toBe('hello')
  })

  it('GET /api/entries?year filters by year', async () => {
    await store.upsertByDate({ date: '2025-12-01', title: 'old', content: {}, mood: null, tags: [] })
    const res = await fetch(`${BASE}/api/entries?year=2026`)
    const list = await res.json()
    expect(res.status).toBe(200)
    expect(list.find((e) => e.date === '2025-12-01')).toBeUndefined()
    expect(list.find((e) => e.date === '2026-07-12')).toBeTruthy()
  })

  it('POST /api/images then GET /api/images/:id returns binary', async () => {
    const original = 'pixel-data'
    const b64 = Buffer.from(original).toString('base64')
    const post = await fetch(`${BASE}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: 'imgA', entryId: '2026-07-12', ext: 'png', base64: b64 }),
    })
    expect(post.status).toBe(200)

    const get = await fetch(`${BASE}/api/images/imgA`)
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('image/png')
    const buf = Buffer.from(await get.arrayBuffer())
    expect(buf.toString()).toBe(original)
  })

  it('DELETE /api/entries/:id 只删日记条目，同日图片与附件仍保留（R3）', async () => {
    const e = await store.upsertByDate({ date: '2026-07-13', title: 'bye', content: {}, mood: null, tags: [] })
    await store.putImage('imgB', { entryId: '2026-07-13', ext: 'png', base64: Buffer.from('x').toString('base64') })
    await store.putFile('fileB', {
      entryId: '2026-07-13',
      ext: 'txt',
      name: '同日附件.txt',
      base64: Buffer.from('keep').toString('base64'),
    })

    const del = await fetch(`${BASE}/api/entries/${e.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)

    // 日记条目没了（日期不存在 = 空日记 ⇒ 200 + null，不再是 404）
    const get = await fetch(`${BASE}/api/entries/2026-07-13`)
    expect(get.status).toBe(200)
    expect(await get.json()).toBe(null)

    // 但同日素材还在：素材池与笔记共享，连带删除会把笔记引用的文件删掉
    const imgGet = await fetch(`${BASE}/api/images/imgB`)
    expect(imgGet.status).toBe(200)
    expect(Buffer.from(await imgGet.arrayBuffer()).toString()).toBe('x')

    const fileGet = await fetch(`${BASE}/api/files/fileB`)
    expect(fileGet.status).toBe(200)
    expect(Buffer.from(await fileGet.arrayBuffer()).toString()).toBe('keep')

    const imgList = await (await fetch(`${BASE}/api/images?entryId=2026-07-13`)).json()
    expect(imgList.map((i) => i.id)).toContain('imgB')
    const fileList = await (await fetch(`${BASE}/api/files?entryId=2026-07-13`)).json()
    expect(fileList.map((f) => f.id)).toContain('fileB')
  })

  it('notes: PUT creates multiple, GET ?date filters, DELETE removes', async () => {
    const put = async (body) =>
      (
        await fetch(`${BASE}/api/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json()
    const a = await put({ date: '2026-09-06', title: 'n1', content: {} })
    const b = await put({ date: '2026-09-06', title: 'n2', content: {} })
    expect(a.id).toBeTruthy()
    expect(b.id).not.toBe(a.id)

    const list = await (await fetch(`${BASE}/api/notes?date=2026-09-06`)).json()
    expect(list).toHaveLength(2)

    const updated = await put({ id: a.id, date: '2026-09-06', title: 'n1-updated', content: {} })
    expect(updated.title).toBe('n1-updated')

    const del = await fetch(`${BASE}/api/notes/${b.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    expect(await (await fetch(`${BASE}/api/notes?date=2026-09-06`)).json()).toHaveLength(1)
  })

  it('files: POST uploads, GET lists/downloads, DELETE removes', async () => {
    const content = 'file-bytes-中文'
    const b64 = Buffer.from(content).toString('base64')
    const post = await fetch(`${BASE}/api/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: 'fileA',
        entryId: '2026-09-17',
        ext: 'txt',
        name: '说明.txt',
        type: 'text/plain',
        size: Buffer.byteLength(content),
        base64: b64,
      }),
    })
    expect(post.status).toBe(200)

    const list = await (await fetch(`${BASE}/api/files?entryId=2026-09-17`)).json()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('说明.txt')

    const get = await fetch(`${BASE}/api/files/fileA`)
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('text/plain')
    expect(get.headers.get('content-disposition')).toContain('attachment')
    expect(Buffer.from(await get.arrayBuffer()).toString('utf8')).toBe(content)

    const del = await fetch(`${BASE}/api/files/fileA`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    expect(await (await fetch(`${BASE}/api/files?entryId=2026-09-17`)).json()).toHaveLength(0)
  })

  it('files / images: 不带 entryId 时返回全部（供清理未引用素材）', async () => {
    const post = await fetch(`${BASE}/api/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: 'fileAll',
        entryId: '2026-09-20',
        ext: 'txt',
        name: 'all.txt',
        type: 'text/plain',
        base64: Buffer.from('all').toString('base64'),
      }),
    })
    expect(post.status).toBe(200)

    const allFiles = await (await fetch(`${BASE}/api/files`)).json()
    expect(allFiles.some((f) => f.id === 'fileAll')).toBe(true)

    const allImages = await (await fetch(`${BASE}/api/images`)).json()
    expect(Array.isArray(allImages)).toBe(true)
    expect(allImages.every((i) => typeof i.id === 'string')).toBe(true)
  })

  it('export includes notes, files manifest and images', async () => {
    const exp = await (await fetch(`${BASE}/api/export`)).json()
    expect(Array.isArray(exp.notes)).toBe(true)
    expect(exp.notes.length).toBeGreaterThan(0)
    expect(exp.files).toBeDefined()
    // 图片元数据也要在导出里，否则换机/还原后图片清单丢失
    expect(Array.isArray(exp.images)).toBe(true)
    expect(exp.images.some((i) => i.id === 'imgA')).toBe(true)
    expect(typeof exp.images[0].entryId).toBe('string')
  })

  it('export and import roundtrip', async () => {
    const exp = await fetch(`${BASE}/api/export`)
    const data = await exp.json()
    expect(exp.status).toBe(200)
    expect(Array.isArray(data.entries)).toBe(true)

    const imported = await fetch(`${BASE}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ date: '2026-08-01', title: 'imp', content: {}, mood: null, tags: [] }] }),
    })
    expect(imported.status).toBe(200)
    const list = await (await fetch(`${BASE}/api/entries?year=2026`)).json()
    expect(list.find((e) => e.date === '2026-08-01')).toBeTruthy()
  })

  it('清空粒度：DELETE /api/entries 只清日记，DELETE /api/data 全清', async () => {
    const j = { 'Content-Type': 'application/json' }
    await fetch(`${BASE}/api/entries`, {
      method: 'PUT',
      headers: j,
      body: JSON.stringify({ date: '2026-12-01', title: 'd', content: {}, mood: null, tags: [] }),
    })
    await fetch(`${BASE}/api/notes`, {
      method: 'PUT',
      headers: j,
      body: JSON.stringify({ date: '2026-12-01', title: 'n', content: {} }),
    })

    await fetch(`${BASE}/api/entries`, { method: 'DELETE' })
    expect(await (await fetch(`${BASE}/api/entries`)).json()).toHaveLength(0)
    expect((await (await fetch(`${BASE}/api/notes`)).json()).length).toBeGreaterThan(0)

    await fetch(`${BASE}/api/data`, { method: 'DELETE' })
    expect(await (await fetch(`${BASE}/api/entries`)).json()).toHaveLength(0)
    expect(await (await fetch(`${BASE}/api/notes`)).json()).toHaveLength(0)
  })
})

describe('请求体上限与 JSON 校验 (R6)', () => {
  let s2
  let b2
  let dir2

  beforeAll(async () => {
    dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-http-body-'))
    const st = new Store(dir2)
    await st.init()
    // 传一个小上限（1KB）来测 413，避免真的发 32MB：语义相同，速度快几个数量级
    s2 = createServer(st, 0, '127.0.0.1', 1024)
    if (!s2.listening) await once(s2, 'listening')
    b2 = `http://127.0.0.1:${s2.address().port}`
  })

  afterAll(async () => {
    await new Promise((r) => s2.close(r))
  })

  it('超过上限返回 413 且不落盘', async () => {
    const big = 'x'.repeat(4096) // 远超 1024 上限
    const res = await fetch(`${b2}/api/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-10-01', title: big, content: {} }),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'payload too large' })
    // 请求体没读完的连接必须显式关闭：残留字节会被当成下一个请求，导致 HTTP 协议错位
    expect(res.headers.get('connection')).toBe('close')

    // 没写进去：条目列表仍然是空的
    expect(await (await fetch(`${b2}/api/notes`)).json()).toHaveLength(0)
  })

  it('413 之后连接不可复用，但服务仍然健康（后续请求照常成功）', async () => {
    // 用 keep-alive agent 发一个超限请求，再复用连接池发正常请求：不能卡死/串包
    const http = await import('node:http')
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    const post = (body, path = '/api/notes') =>
      new Promise((resolve, reject) => {
        const u = new URL(path, b2)
        const r = http.request(
          { hostname: u.hostname, port: u.port, path: u.pathname, method: 'PUT', agent, headers: { 'Content-Type': 'application/json' } },
          (res) => {
            res.resume()
            res.on('end', () => resolve(res.statusCode))
          },
        )
        r.on('error', reject)
        r.end(body)
      })

    expect(await post(JSON.stringify({ date: '2026-10-09', title: 'z'.repeat(4096), content: {} }))).toBe(413)
    // 超限请求后，同一 agent 上的下一个请求必须还能拿到正常响应
    const okBody = JSON.stringify({ date: '2026-10-10', title: 'fine', content: {} })
    expect(await post(okBody)).toBe(200)
    agent.destroy()
  })

  it('恰好等于上限的请求正常通过（边界不误杀）', async () => {
    // 精确构造一条长度 == 1024 的合法 JSON：超限判断用 size > max，等于必须放行
    const shell = JSON.stringify({ date: '2026-10-02', title: '', content: {} })
    const body = shell.replace('""', `"${'y'.repeat(1024 - shell.length)}"`)
    expect(Buffer.byteLength(body)).toBe(1024)

    const res = await fetch(`${b2}/api/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    expect(res.status).toBe(200)
    const list = await (await fetch(`${b2}/api/notes`)).json()
    expect(list.some((n) => n.date === '2026-10-02')).toBe(true)
  })

  it('非法 JSON 返回 400 invalid json，而不是静默当成 {} 存空数据', async () => {
    const res = await fetch(`${b2}/api/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"date": "2026-10-03", broken',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid json' })
  })

  it('空请求体仍按 {} 兼容（不带 body 的 DELETE 不受影响）', async () => {
    const res = await fetch(`${b2}/api/files`, { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('生产默认上限是 32MB（可导出、可读，不是魔法数字埋在代码里）', async () => {
    const { MAX_BODY_BYTES } = await import('./index.mjs')
    expect(MAX_BODY_BYTES).toBe(32 * 1024 * 1024)
  })
})

describe('GET /api/entries/dates（森林页只要日期）', () => {
  it('只回日期数组，不含正文；结果升序', async () => {
    await fetch(`${BASE}/api/entries`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-05-09',
        title: '森林页不该为了算间隔而下载这篇的正文',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '很长的正文' }] }] },
        mood: null,
        tags: [],
      }),
    })

    const res = await fetch(`${BASE}/api/entries/dates`)
    expect(res.status).toBe(200)
    const dates = await res.json()

    expect(Array.isArray(dates)).toBe(true)
    expect(dates).toContain('2026-05-09')
    expect(dates.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true)
    expect([...dates].sort()).toEqual(dates)
  })

  it('不是被当成一篇日期叫 dates 的日记', async () => {
    const res = await fetch(`${BASE}/api/entries/dates`)
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })
})

describe('GET /api/entries/:date 对「还没写的一天」不再回 404', () => {
  it('日期存在但没写 ⇒ 200 + null（首屏探路不该在控制台报红）', async () => {
    const res = await fetch(`${BASE}/api/entries/2031-02-03`)
    expect(res.status).toBe(200)
    expect(await res.json()).toBe(null)
  })

  it('不是一个日期的路径仍然 404（拼错的 URL 不被当成空日记）', async () => {
    const res = await fetch(`${BASE}/api/entries/not-a-date`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not found' })
  })
})
