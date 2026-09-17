// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'
import { createServer } from './index.mjs'

const PORT = 5271
const BASE = `http://localhost:${PORT}`

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

  it('DELETE /api/entries/:id removes entry and images', async () => {
    const e = await store.upsertByDate({ date: '2026-07-13', title: 'bye', content: {}, mood: null, tags: [] })
    await store.putImage('imgB', { entryId: '2026-07-13', ext: 'png', base64: Buffer.from('x').toString('base64') })
    const del = await fetch(`${BASE}/api/entries/${e.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    const get = await fetch(`${BASE}/api/entries/2026-07-13`)
    expect(get.status).toBe(404)
    const imgGet = await fetch(`${BASE}/api/images/imgB`)
    expect(imgGet.status).toBe(404)
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

  it('files: missing entryId is rejected', async () => {
    const res = await fetch(`${BASE}/api/files`)
    expect(res.status).toBe(400)
  })

  it('export includes notes and files manifest', async () => {
    const exp = await (await fetch(`${BASE}/api/export`)).json()
    expect(Array.isArray(exp.notes)).toBe(true)
    expect(exp.notes.length).toBeGreaterThan(0)
    expect(exp.files).toBeDefined()
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
})
