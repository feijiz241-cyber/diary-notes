import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockApi } from '@/test/mockApi'
import { listAllFiles, listAllImages, putEntry, putFile, putImage, putNote } from './db'
import { cleanupOrphanAssets } from './cleanup'

const mock = createMockApi()
vi.stubGlobal('fetch', mock.fetch)

const fileNode = (fileId: string) => ({
  type: 'fileAttachment',
  attrs: { fileId, entryId: '2026-09-18', name: 'a.txt', size: 1, mime: 'text/plain' },
})
const imageNode = (imageId: string) => ({
  type: 'image',
  attrs: { imageId, entryId: '2026-09-18' },
})
const doc = (...nodes: unknown[]) => ({ type: 'doc', content: nodes })

beforeEach(() => mock.reset())

describe('cleanupOrphanAssets', () => {
  it('删除未被任何内容引用的图片与附件，保留被引用的', async () => {
    const keepFile = await putFile('2026-09-18', new File(['a'], 'keep.txt', { type: 'text/plain' }))
    await putFile('2026-09-18', new File(['b'], 'orphan.txt', { type: 'text/plain' }))
    const keepImage = await putImage('2026-09-18', new Blob(['i'], { type: 'image/png' }))
    await putImage('2026-09-18', new Blob(['j'], { type: 'image/png' }))

    await putEntry({
      date: '2026-09-18',
      title: 't',
      content: doc(fileNode(keepFile), imageNode(keepImage)),
      mood: null,
      tags: [],
    })

    const result = await cleanupOrphanAssets()
    expect(result.removedFiles).toBe(1)
    expect(result.removedImages).toBe(1)
    expect(result.keptFiles).toBe(1)
    expect(result.keptImages).toBe(1)

    expect((await listAllFiles()).map((f) => f.id)).toEqual([keepFile])
    expect((await listAllImages()).map((i) => i.id)).toEqual([keepImage])
  })

  it('笔记里引用的附件同样被保留', async () => {
    const keep = await putFile('2026-09-18', new File(['a'], 'n.txt', { type: 'text/plain' }))
    await putNote({ date: '2026-09-18', title: 'n', content: doc(fileNode(keep)) })

    const result = await cleanupOrphanAssets()
    expect(result.removedFiles).toBe(0)
    expect((await listAllFiles()).map((f) => f.id)).toEqual([keep])
  })

  it('无任何内容时会清空全部素材', async () => {
    await putFile('2026-09-18', new File(['a'], 'x.txt', { type: 'text/plain' }))
    await putImage('2026-09-18', new Blob(['i'], { type: 'image/png' }))

    const result = await cleanupOrphanAssets()
    expect(result.removedFiles).toBe(1)
    expect(result.removedImages).toBe(1)
    expect(await listAllFiles()).toHaveLength(0)
    expect(await listAllImages()).toHaveLength(0)
  })
})
