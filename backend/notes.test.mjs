// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'

async function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-notes-test-'))
  const s = new Store(dir)
  await s.init()
  return s
}

describe('Store notes (multiple per day, separate file)', () => {
  it('upsertNote creates multiple notes for the same date with unique ids', async () => {
    const s = await makeStore()
    const a = await s.upsertNote({ date: '2026-09-06', title: '笔记一', content: { type: 'doc', content: [] } })
    const b = await s.upsertNote({ date: '2026-09-06', title: '笔记二', content: { type: 'doc', content: [] } })
    expect(a.id).toBeTruthy()
    expect(b.id).toBeTruthy()
    expect(b.id).not.toBe(a.id)
    const list = await s.notesByDate('2026-09-06')
    expect(list).toHaveLength(2)
  })

  it('upsertNote with existing id updates in place (keeps count)', async () => {
    const s = await makeStore()
    const a = await s.upsertNote({ date: '2026-09-06', title: '初稿', content: { type: 'doc', content: [] } })
    const b = await s.upsertNote({ id: a.id, date: '2026-09-06', title: '改稿', content: { type: 'doc', content: [] } })
    expect(b.id).toBe(a.id)
    expect(b.title).toBe('改稿')
    expect(await s.readNotes()).toHaveLength(1)
  })

  it('notesByDate only returns that date notes; diary entries untouched', async () => {
    const s = await makeStore()
    await s.upsertNote({ date: '2026-09-06', title: 'n1', content: {} })
    await s.upsertNote({ date: '2026-09-07', title: 'n2', content: {} })
    await s.upsertByDate({ date: '2026-09-06', title: 'diary', content: {}, mood: null, tags: [] })
    expect(await s.notesByDate('2026-09-06')).toHaveLength(1)
    expect((await s.notesByDate('2026-09-06'))[0].title).toBe('n1')
    // 日记与笔记互不干扰
    expect(await s.readAll()).toHaveLength(1)
    expect((await s.getByDate('2026-09-06')).title).toBe('diary')
    expect(await s.readNotes()).toHaveLength(2)
  })

  it('deleteNote removes only the target note', async () => {
    const s = await makeStore()
    const a = await s.upsertNote({ date: '2026-09-06', title: 'keep', content: {} })
    const b = await s.upsertNote({ date: '2026-09-06', title: 'drop', content: {} })
    await s.deleteNote(b.id)
    const list = await s.notesByDate('2026-09-06')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(a.id)
    // 删除不存在的 id 不报错
    await s.deleteNote('nonexistent')
    expect(await s.readNotes()).toHaveLength(1)
  })

  it('notes persist to notes.json file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-notes-file-'))
    const s = new Store(dir)
    await s.init()
    await s.upsertNote({ date: '2026-09-06', title: '落盘', content: {} })
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'notes.json'), 'utf8'))
    expect(raw).toHaveLength(1)
    expect(raw[0].title).toBe('落盘')
  })
})
