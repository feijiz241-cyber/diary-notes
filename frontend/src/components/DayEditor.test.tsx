import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockApi } from '@/test/mockApi'
import { getByDate, putEntry } from '@/lib/db'

// TipTap 在 jsdom 里较重，这里只验证「保存时机」，编辑器本身不参与
vi.mock('./Editor', () => ({ Editor: () => null }))

import { DayEditor } from './DayEditor'

const mock = createMockApi()
vi.stubGlobal('fetch', mock.fetch)

const EMPTY_DOC = { type: 'doc', content: [] }

const seed = (date: string, title: string) =>
  putEntry({ date, title, content: EMPTY_DOC, mood: null, tags: [] })

beforeEach(() => mock.reset())
afterEach(() => cleanup())

describe('DayEditor 自动保存', () => {
  it('卸载（切走页面）时立即落盘未保存的改动，不等防抖', async () => {
    await seed('2026-09-18', '原标题')
    const user = userEvent.setup()
    const { unmount } = render(<DayEditor dateKey="2026-09-18" />)

    const input = await screen.findByPlaceholderText('标题（可选）')
    await user.type(input, '！')

    unmount()

    await waitFor(async () => {
      expect((await getByDate('2026-09-18'))?.title).toBe('原标题！')
    })
  })

  it('切换日期：旧日期内容落在旧日期，不会串写到新日期', async () => {
    await seed('2026-09-17', 'A')
    await seed('2026-09-18', 'B')
    const user = userEvent.setup()
    const { rerender } = render(<DayEditor dateKey="2026-09-17" />)

    const input = await screen.findByPlaceholderText('标题（可选）')
    await user.type(input, 'X')

    rerender(<DayEditor dateKey="2026-09-18" />)
    await screen.findByDisplayValue('B')

    // 等过 600ms 防抖窗口，确认没有把 A 的内容写到 18 号
    await new Promise((r) => setTimeout(r, 800))

    expect((await getByDate('2026-09-18'))?.title).toBe('B')
    await waitFor(async () => {
      expect((await getByDate('2026-09-17'))?.title).toBe('AX')
    })
  })

  it('全空内容不落盘（不会凭空创建日记）', async () => {
    render(<DayEditor dateKey="2026-09-19" />)
    await screen.findByPlaceholderText('标题（可选）')
    cleanup()
    await new Promise((r) => setTimeout(r, 100))
    expect(await getByDate('2026-09-19')).toBeUndefined()
  })
})

describe('DayEditor 加载失败', () => {
  it('连不上后端时给出提示和重试按钮，而不是一直停在「加载中…」', async () => {
    // 用户最常见的故障：双击了 bat，但后端那个黑窗口没起来
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )

    try {
      render(<DayEditor dateKey="2026-09-18" />)

      expect(await screen.findByRole('alert')).toHaveTextContent('内容没有加载出来')
      expect(screen.getByText(/没连上本地服务/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
      expect(screen.queryByText('加载中…')).not.toBeInTheDocument()
    } finally {
      vi.stubGlobal('fetch', mock.fetch)
    }
  })
})
