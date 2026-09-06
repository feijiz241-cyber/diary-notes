import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getNotesByDate, getAllNotes, putNote, deleteNote } from './db'
import { createMockApi } from '@/test/mockApi'

const mock = createMockApi()
vi.stubGlobal('fetch', mock.fetch)

const EMPTY_DOC = { type: 'doc', content: [] }

describe('db notes (via mock /api)', () => {
  beforeEach(() => mock.reset())

  it('putNote creates two notes on the same date with unique ids', async () => {
    const a = await putNote({ date: '2026-09-06', title: '一', content: EMPTY_DOC })
    const b = await putNote({ date: '2026-09-06', title: '二', content: EMPTY_DOC })
    expect(a.id).toBeTruthy()
    expect(b.id).not.toBe(a.id)
    const list = await getNotesByDate('2026-09-06')
    expect(list).toHaveLength(2)
  })

  it('putNote with id updates in place', async () => {
    const a = await putNote({ date: '2026-09-06', title: '初稿', content: EMPTY_DOC })
    const b = await putNote({ id: a.id, date: '2026-09-06', title: '定稿', content: EMPTY_DOC })
    expect(b.id).toBe(a.id)
    expect(b.title).toBe('定稿')
    expect(await getNotesByDate('2026-09-06')).toHaveLength(1)
  })

  it('getNotesByDate filters by date; getAllNotes returns all', async () => {
    await putNote({ date: '2026-09-06', title: 'a', content: EMPTY_DOC })
    await putNote({ date: '2026-09-07', title: 'b', content: EMPTY_DOC })
    expect((await getNotesByDate('2026-09-06'))[0].title).toBe('a')
    expect(await getAllNotes()).toHaveLength(2)
  })

  it('deleteNote removes the note', async () => {
    const a = await putNote({ date: '2026-09-06', title: 'x', content: EMPTY_DOC })
    await deleteNote(a.id)
    expect(await getNotesByDate('2026-09-06')).toHaveLength(0)
  })
})
