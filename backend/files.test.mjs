// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'

async function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-files-test-'))
  const s = new Store(dir)
  await s.init()
  return { s, dir }
}

const b64 = (s) => Buffer.from(s).toString('base64')

describe('Store files (attachments)', () => {
  it('putFile writes file to disk and records metadata in manifest', async () => {
    const { s, dir } = await makeStore()
    await s.putFile('f1', {
      entryId: '2026-09-17',
      ext: 'txt',
      name: '说明.txt',
      type: 'text/plain',
      size: 5,
      base64: b64('hello'),
    })

    const got = await s.getFile('f1')
    expect(got).toBeTruthy()
    expect(got.name).toBe('说明.txt')
    expect(got.type).toBe('text/plain')
    expect(got.buffer.toString('utf8')).toBe('hello')

    const onDisk = fs.readFileSync(path.join(dir, 'files', 'f1.txt'))
    expect(onDisk.toString('utf8')).toBe('hello')

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'files', 'manifest.json'), 'utf8'))
    expect(manifest.f1.entryId).toBe('2026-09-17')
    expect(manifest.f1.name).toBe('说明.txt')
  })

  it('listFiles only returns files for that entryId', async () => {
    const { s } = await makeStore()
    await s.putFile('a', { entryId: '2026-09-17', ext: 'txt', name: 'a.txt', base64: b64('a') })
    await s.putFile('b', { entryId: '2026-09-17', ext: 'pdf', name: 'b.pdf', base64: b64('b') })
    await s.putFile('c', { entryId: '2026-09-18', ext: 'txt', name: 'c.txt', base64: b64('c') })

    const list = await s.listFiles('2026-09-17')
    expect(list).toHaveLength(2)
    expect(list.map((f) => f.id).sort()).toEqual(['a', 'b'])
    expect(list.find((f) => f.id === 'a').name).toBe('a.txt')
  })

  it('deleteFile removes the file and its manifest entry', async () => {
    const { s, dir } = await makeStore()
    await s.putFile('x', { entryId: 'd', ext: 'txt', name: 'x.txt', base64: b64('x') })
    await s.deleteFile('x')
    expect(await s.getFile('x')).toBeNull()
    expect(fs.existsSync(path.join(dir, 'files', 'x.txt'))).toBe(false)
    // 删除不存在的也不报错
    await s.deleteFile('nope')
  })

  it('clearAllFiles empties manifest and disk', async () => {
    const { s, dir } = await makeStore()
    await s.putFile('a', { entryId: 'd', ext: 'txt', name: 'a.txt', base64: b64('a') })
    await s.putFile('b', { entryId: 'd', ext: 'txt', name: 'b.txt', base64: b64('b') })
    await s.clearAllFiles()
    expect(await s.listFiles('d')).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, 'files', 'a.txt'))).toBe(false)
  })

  it('deleting a diary entry keeps its attachments (R3: 附件不再跟随日记删除)', async () => {
    const { s, dir } = await makeStore()
    const e = await s.upsertByDate({ date: '2026-09-17', title: 't', content: {}, mood: null, tags: [] })
    await s.putFile('f1', { entryId: '2026-09-17', ext: 'txt', name: 'f1.txt', base64: b64('1') })
    await s.putFile('f2', { entryId: '2026-09-18', ext: 'txt', name: 'f2.txt', base64: b64('2') })

    await s.deleteById(e.id)

    // 日记没了
    expect(await s.readAll()).toHaveLength(0)
    // 但附件都还在：素材池按日期归属、与笔记共享，连带删除会误删别处还在引用的文件
    expect(await s.getFile('f1')).not.toBeNull()
    expect(await s.getFile('f2')).not.toBeNull()
    expect(fs.existsSync(path.join(dir, 'files', 'f1.txt'))).toBe(true)
    const kept = await s.listFiles('2026-09-18')
    expect(kept).toHaveLength(1)
  })

  it('clearAllData 清空日记、笔记与全部素材', async () => {
    const { s } = await makeStore()
    await s.upsertByDate({ date: '2026-09-17', title: 't', content: {}, mood: null, tags: [] })
    await s.upsertNote({ date: '2026-09-17', title: 'n', content: {} })
    await s.putFile('f1', { entryId: '2026-09-17', ext: 'txt', name: 'f1.txt', base64: b64('1') })
    await s.putImage('i1', { entryId: '2026-09-17', ext: 'png', base64: b64('i') })

    await s.clearAllData()

    expect(await s.readAll()).toHaveLength(0)
    expect(await s.readNotes()).toHaveLength(0)
    expect(await s.listAllFiles()).toHaveLength(0)
    expect(await s.listAllImages()).toHaveLength(0)
  })

  it('clearEntries 只清日记条目，不动笔记与共享素材', async () => {
    const { s } = await makeStore()
    await s.upsertByDate({ date: '2026-09-17', title: 't', content: {}, mood: null, tags: [] })
    await s.upsertNote({ date: '2026-09-17', title: 'n', content: {} })
    await s.putFile('f1', { entryId: '2026-09-17', ext: 'txt', name: 'f1.txt', base64: b64('1') })

    await s.clearEntries()

    expect(await s.readAll()).toHaveLength(0)
    expect(await s.readNotes()).toHaveLength(1)
    expect(await s.listAllFiles()).toHaveLength(1)
  })
})
