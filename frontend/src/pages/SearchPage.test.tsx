import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SearchResult } from '@/lib/search'

// 搜索本身在 db 层会下载全库，这里只关心「敲键触发了几次搜索」
const { searchAll } = vi.hoisted(() => ({ searchAll: vi.fn() }))
vi.mock('@/lib/search', () => ({ searchAll }))

import { SearchPage } from './SearchPage'

const hit = (title: string): SearchResult => ({
  kind: 'diary',
  id: 'id-' + title,
  date: '2026-09-18',
  title,
  content: { type: 'doc', content: [] },
  snippet: '片段',
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>,
  )

const input = () => screen.getByPlaceholderText('搜索日记与笔记的标题或正文…')

describe('SearchPage 搜索防抖', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchAll.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('连着敲三个字只扫一遍全库', async () => {
    searchAll.mockResolvedValue([])
    renderPage()

    fireEvent.change(input(), { target: { value: '日' } })
    fireEvent.change(input(), { target: { value: '日记' } })
    fireEvent.change(input(), { target: { value: '日记本' } })

    // 还没停下来，一次都不该发
    expect(searchAll).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchAll).toHaveBeenCalledTimes(1)
    expect(searchAll).toHaveBeenCalledWith('日记本')
  })

  it('清空输入不触发搜索，并立刻收起结果', async () => {
    searchAll.mockResolvedValue([hit('旧结果')])
    renderPage()

    fireEvent.change(input(), { target: { value: '旧' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.getByText('旧结果')).toBeInTheDocument()

    searchAll.mockClear()
    fireEvent.change(input(), { target: { value: '' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchAll).not.toHaveBeenCalled()
    expect(screen.queryByText('旧结果')).toBeNull()
  })

  it('先发的请求后回来，不会盖掉最新一次的结果', async () => {
    let resolveOld: (v: SearchResult[]) => void = () => {}
    let resolveNew: (v: SearchResult[]) => void = () => {}
    searchAll
      .mockImplementationOnce(() => new Promise<SearchResult[]>((r) => (resolveOld = r)))
      .mockImplementationOnce(() => new Promise<SearchResult[]>((r) => (resolveNew = r)))

    renderPage()

    fireEvent.change(input(), { target: { value: '旧' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.change(input(), { target: { value: '新' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // 新请求先回，旧请求（用户已经改词了）后回 —— 旧结果必须被丢弃
    await act(async () => {
      resolveNew([hit('新结果')])
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      resolveOld([hit('旧结果')])
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('新结果')).toBeInTheDocument()
    expect(screen.queryByText('旧结果')).toBeNull()
  })

  it('搜索失败给出提示，不是静默空白', async () => {
    searchAll.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()

    fireEvent.change(input(), { target: { value: '任意' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/没连上本地服务/)
  })
})
