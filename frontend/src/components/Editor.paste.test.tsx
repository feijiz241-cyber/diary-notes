import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { putImage } from '@/lib/db'
import { Editor } from './Editor'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return { ...actual, putImage: vi.fn(async () => 'img-pasted-1') }
})

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

beforeEach(() => vi.mocked(putImage).mockClear())
afterEach(() => cleanup())

/** 触发一次粘贴：jsdom 没有可用的 ClipboardEvent.clipboardData，手动挂上替身。 */
function firePaste(target: Element, files: File[]) {
  // TipTap 的 paste 插件会读 getData('text/html')，替身必须提供，否则会抛 TypeError
  const clipboardData = {
    files,
    items: [],
    types: files.length ? ['Files'] : [],
    getData: () => '',
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
    dropEffect: 'none',
    effectAllowed: 'none',
  }
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
  ev.clipboardData = clipboardData
  target.dispatchEvent(ev)
  return ev
}

describe('Editor 直接粘贴图片', () => {
  it('粘贴截图：走 putImage 入库，并把 imageId/entryId 写进文档', async () => {
    const onChange = vi.fn()
    const { container } = render(<Editor value={EMPTY_DOC} onChange={onChange} dateKey="2026-10-29" />)

    const editable = await waitFor(() => {
      const el = container.querySelector('.ProseMirror')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    firePaste(editable, [file])

    await waitFor(() => expect(putImage).toHaveBeenCalledWith('2026-10-29', file))
    await waitFor(() => {
      const json = onChange.mock.calls.at(-1)?.[0] as { content: Array<{ type: string; attrs?: Record<string, unknown> }> }
      const image = json.content.find((n) => n.type === 'image')
      expect(image?.attrs).toMatchObject({ imageId: 'img-pasted-1', entryId: '2026-10-29' })
    })
  })

  it('粘贴纯文本不拦截（不调用 putImage）', async () => {
    const onChange = vi.fn()
    const { container } = render(<Editor value={EMPTY_DOC} onChange={onChange} dateKey="2026-10-29" />)

    const editable = await waitFor(() => {
      const el = container.querySelector('.ProseMirror')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })

    firePaste(editable, [])
    expect(putImage).not.toHaveBeenCalled()
  })
})
