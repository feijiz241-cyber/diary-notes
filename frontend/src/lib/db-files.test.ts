import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MAX_FILE_BYTES, clearAllFiles, deleteFile, getFilesByEntry, putFile } from './db'
import { createMockApi } from '@/test/mockApi'

const mock = createMockApi()
vi.stubGlobal('fetch', mock.fetch)

/** jsdom 的 Blob 没有 .text()，用 FileReader 读。 */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(blob)
  })
}

describe('db files (via mock /api)', () => {
  beforeEach(() => mock.reset())

  it('putFile uploads and getFilesByEntry returns content + metadata', async () => {
    const file = new File(['hello world'], '说明.txt', { type: 'text/plain' })
    const id = await putFile('2026-09-17', file)
    expect(id).toBeTruthy()

    const list = await getFilesByEntry('2026-09-17')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('说明.txt')
    expect(list[0].type).toBe('text/plain')
    expect(list[0].size).toBe(file.size)
    expect(await blobText(list[0].blob)).toBe('hello world')
  })

  it('putFile with explicit id preserves it (used by import)', async () => {
    const file = new File(['x'], 'x.bin', { type: 'application/octet-stream' })
    const id = await putFile('2026-09-17', file, 'fixed-id', 'x.bin')
    expect(id).toBe('fixed-id')
    const list = await getFilesByEntry('2026-09-17')
    expect(list[0].id).toBe('fixed-id')
  })

  it('getFilesByEntry filters by entryId', async () => {
    await putFile('2026-09-17', new File(['a'], 'a.txt', { type: 'text/plain' }))
    await putFile('2026-09-18', new File(['b'], 'b.txt', { type: 'text/plain' }))
    expect(await getFilesByEntry('2026-09-17')).toHaveLength(1)
    expect((await getFilesByEntry('2026-09-17'))[0].name).toBe('a.txt')
  })

  it('putFile rejects files over the size cap', async () => {
    const big = new File(['x'], 'big.bin', { type: 'application/octet-stream' })
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 })
    await expect(putFile('2026-09-17', big)).rejects.toThrow(/20MB/)
  })

  it('deleteFile removes the attachment', async () => {
    const id = await putFile('2026-09-17', new File(['a'], 'a.txt', { type: 'text/plain' }))
    await deleteFile(id)
    expect(await getFilesByEntry('2026-09-17')).toHaveLength(0)
  })

  it('clearAllFiles empties all attachments', async () => {
    await putFile('2026-09-17', new File(['a'], 'a.txt', { type: 'text/plain' }))
    await putFile('2026-09-18', new File(['b'], 'b.txt', { type: 'text/plain' }))
    await clearAllFiles()
    expect(await getFilesByEntry('2026-09-17')).toHaveLength(0)
    expect(await getFilesByEntry('2026-09-18')).toHaveLength(0)
  })
})
