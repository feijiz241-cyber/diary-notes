import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import { buildExportBundle, importBundle, entriesToMarkdown, prepareImport } from './export'
import { putEntry, putImage, getAll, clearAll, putFile, getFilesByEntry } from './db'

const mock = createMockApi()

beforeEach(() => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
})

describe('export / import', () => {
  it('buildExportBundle includes entries and images as data URLs', async () => {
    await putEntry({
      date: '2026-07-11',
      title: 't',
      content: { type: 'doc', content: [] },
      mood: 'joy',
      tags: ['x'],
    })
    await putImage('2026-07-11', new Blob(['img'], { type: 'image/png' }))

    const bundle = await buildExportBundle()
    expect(bundle.version).toBe(1)
    expect(bundle.entries.length).toBe(1)
    expect(bundle.images.length).toBe(1)
    expect(bundle.images[0].dataUrl.startsWith('data:')).toBe(true)
  })

  it('importBundle restores count after clear', async () => {
    await putEntry({
      date: '2026-07-11',
      title: 't',
      content: { type: 'doc', content: [] },
      mood: null,
      tags: ['a'],
    })
    await putImage('2026-07-11', new Blob(['img'], { type: 'image/png' }))

    const bundle = await buildExportBundle()
    await clearAll()
    expect((await getAll()).length).toBe(0)

    await importBundle(bundle)
    expect((await getAll()).length).toBe(1)
  })

  it('buildExportBundle includes files and importBundle restores them with original id', async () => {
    await putEntry({
      date: '2026-07-11',
      title: 't',
      content: { type: 'doc', content: [] },
      mood: null,
      tags: [],
    })
    const fid = await putFile('2026-07-11', new File(['attach'], '文档.txt', { type: 'text/plain' }))

    const bundle = await buildExportBundle()
    expect(bundle.files?.length).toBe(1)
    expect(bundle.files?.[0].name).toBe('文档.txt')
    expect(bundle.files?.[0].dataUrl.startsWith('data:')).toBe(true)

    await clearAll()
    await importBundle(bundle)

    const list = await getFilesByEntry('2026-07-11')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(fid)
    expect(list[0].name).toBe('文档.txt')
  })

  it('entriesToMarkdown includes title and body', async () => {
    await putEntry({
      date: '2026-07-11',
      title: '我的日记',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '今天开心' }] }] },
      mood: null,
      tags: [],
    })
    const md = entriesToMarkdown(await getAll())
    expect(md).toContain('我的日记')
    expect(md).toContain('今天开心')
  })
})

describe('导入前校验（坏文件不许毁数据）', () => {
  const entry = (title: string) => ({
    date: '2026-07-11',
    title,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    mood: null,
    tags: [],
  })

  it('dataURL 残缺的备份会被拦下，原有数据原样保留', async () => {
    await putEntry(entry('原有的这篇'))
    const bad = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: [entry('备份里的这篇')],
      images: [{ id: 'i1', entryId: '2026-07-11', dataUrl: 'data:image/png;base64' }],
    }

    await expect(importBundle(bad as never)).rejects.toThrow(/dataURL/)

    const list = await getAll()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('原有的这篇')
  })

  it('日期不合法的条目会被拒绝', async () => {
    await expect(
      importBundle({
        version: 1,
        exportedAt: '',
        entries: [{ ...entry('x'), date: '2026/07/11' }],
      } as never),
    ).rejects.toThrow(/YYYY-MM-DD/)
  })

  it('prepareImport 只校验、不碰数据层', async () => {
    await putEntry(entry('留着'))
    expect(() =>
      prepareImport({ version: 1, exportedAt: '', entries: [], notes: 'nope' } as never),
    ).toThrow(/notes/)
    expect(await getAll()).toHaveLength(1)
  })

  it('版本号不认识时拒绝导入', async () => {
    await expect(importBundle({ version: 2, exportedAt: '', entries: [] } as never)).rejects.toThrow(
      /版本/,
    )
  })
})
