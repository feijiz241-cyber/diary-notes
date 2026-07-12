// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'

async function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-store-test-'))
  const s = new Store(dir)
  await s.init()
  return s
}

describe('Store (file persistence)', () => {
  it('upsertByDate creates then overwrites same date (one entry per day)', async () => {
    const s = await makeStore()
    const a = await s.upsertByDate({ date: '2026-07-12', title: 't1', content: {}, mood: null, tags: [] })
    expect(a.id).toBeTruthy()
    const b = await s.upsertByDate({ date: '2026-07-12', title: 't2', content: {}, mood: 'happy', tags: ['x'] })
    expect(b.id).toBe(a.id)
    const all = await s.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('t2')
  })

  it('getByDate returns the entry or undefined', async () => {
    const s = await makeStore()
    await s.upsertByDate({ date: '2026-07-12', title: 'hi', content: {}, mood: null, tags: [] })
    const e = await s.getByDate('2026-07-12')
    expect(e?.title).toBe('hi')
    expect(await s.getByDate('2026-07-13')).toBeUndefined()
  })

  it('deleteById removes entry and its linked images', async () => {
    const s = await makeStore()
    const e = await s.upsertByDate({ date: '2026-07-12', title: 'x', content: {}, mood: null, tags: [] })
    await s.putImage('img1', { entryId: '2026-07-12', ext: 'png', base64: 'aGVsbG8=' })
    await s.deleteById(e.id)
    expect(await s.readAll()).toHaveLength(0)
    expect(await s.getImage('img1')).toBeNull()
  })

  it('image base64 roundtrip and listImages by entryId', async () => {
    const s = await makeStore()
    const original = 'hello-binary-数据'
    const b64 = Buffer.from(original).toString('base64')
    await s.putImage('img2', { entryId: '2026-07-12', ext: 'png', base64: b64 })
    const got = await s.getImage('img2')
    expect(got.buffer.toString()).toBe(original)
    expect(got.ext).toBe('png')
    expect(got.type).toBe('image/png')
    const list = await s.listImages('2026-07-12')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('img2')
  })

  it('concurrent upserts do not lose data (write lock)', async () => {
    const s = await makeStore()
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        s.upsertByDate({
          date: `2026-07-${String(i + 1).padStart(2, '0')}`,
          title: 't' + i,
          content: {},
          mood: null,
          tags: [],
        }),
      ),
    )
    const all = await s.readAll()
    expect(all).toHaveLength(10)
  })
})
