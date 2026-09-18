import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockApi } from '@/test/mockApi'
import { listAllFiles, listAllImages, putFile, putImage } from './db'
import { diffRemovedAssets, purgeRemovedAssets, snapshotAssets } from './asset-sync'

const mock = createMockApi()
vi.stubGlobal('fetch', mock.fetch)

const doc = (...nodes: unknown[]) => ({ type: 'doc', content: nodes })
const fnode = (fileId: string) => ({
  type: 'fileAttachment',
  attrs: { fileId, entryId: '2026-09-18', name: 'a.txt', size: 1, mime: 'text/plain' },
})
const inode = (imageId: string) => ({ type: 'image', attrs: { imageId, entryId: '2026-09-18' } })

beforeEach(() => mock.reset())

describe('asset-sync（移除素材时同步删除后端文件）', () => {
  it('snapshotAssets 收集文档引用的素材 id', () => {
    const s = snapshotAssets(
      doc(fnode('f1'), inode('i1'), { type: 'paragraph', content: [{ type: 'text', text: 'x' }] }),
    )
    expect([...s.files]).toEqual(['f1'])
    expect([...s.images]).toEqual(['i1'])
  })

  it('diffRemovedAssets 只找出被移出文档的素材', () => {
    const prev = snapshotAssets(doc(fnode('f1'), fnode('f2'), inode('i1')))
    const next = snapshotAssets(doc(fnode('f1')))

    const d = diffRemovedAssets(prev, next)
    expect(d.files).toEqual(['f2'])
    expect(d.images).toEqual(['i1'])
  })

  it('purgeRemovedAssets 真删后端文件，仍在引用的保留', async () => {
    const keep = await putFile('2026-09-18', new File(['a'], 'keep.txt', { type: 'text/plain' }))
    const drop = await putFile('2026-09-18', new File(['b'], 'drop.txt', { type: 'text/plain' }))
    const dropImage = await putImage('2026-09-18', new Blob(['i'], { type: 'image/png' }))

    const prev = snapshotAssets(doc(fnode(keep), fnode(drop), inode(dropImage)))
    const next = snapshotAssets(doc(fnode(keep)))

    await purgeRemovedAssets(prev, next)

    expect((await listAllFiles()).map((f) => f.id)).toEqual([keep])
    expect(await listAllImages()).toHaveLength(0)
  })

  it('没有移除任何素材时不产生删除请求', async () => {
    const keep = await putFile('2026-09-18', new File(['a'], 'keep.txt', { type: 'text/plain' }))
    const s = snapshotAssets(doc(fnode(keep)))
    await purgeRemovedAssets(s, snapshotAssets(doc(fnode(keep))))
    expect((await listAllFiles()).map((f) => f.id)).toEqual([keep])
  })
})
