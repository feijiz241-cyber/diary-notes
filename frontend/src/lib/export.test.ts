import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createMockApi } from '../test/mockApi'
import { buildExportBundle, importBundle, entriesToMarkdown } from './export'
import { putEntry, putImage, getAll, clearAll } from './db'

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
