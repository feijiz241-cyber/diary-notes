import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createMockApi } from '../test/mockApi'
import { putEntry } from '@/lib/db'
import { ForestPage } from './ForestPage'

const mock = createMockApi()

beforeEach(() => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.reset()
})

const seed = async (dates: string[]) => {
  for (const date of dates) {
    await putEntry({
      date,
      title: '标题 ' + date,
      content: { type: 'doc', content: [] },
      mood: 'joy',
      tags: [],
    })
  }
}

describe('ForestPage 距上/下篇', () => {
  it('点开 9月17日 显示「距上篇 7 天（9月10日）」「距下篇 1 天（9月18日）」', async () => {
    // 用户截图里的问题：显示成「距上篇 6 天 / 距下篇 0 天」——那是「中间空着几天」的算法
    await seed(['2026-09-10', '2026-09-17', '2026-09-18'])

    render(
      <MemoryRouter>
        <ForestPage />
      </MemoryRouter>,
    )

    // 页面默认是当前月，切到 2026 年 9 月
    await waitFor(() => expect(screen.getByLabelText('上个月')).toBeTruthy())
    const now = new Date()
    let back = (now.getFullYear() - 2026) * 12 + (now.getMonth() + 1 - 9)
    while (back > 0) {
      fireEvent.click(screen.getByLabelText('上个月'))
      back -= 1
    }
    while (back < 0) {
      fireEvent.click(screen.getByLabelText('下个月'))
      back += 1
    }

    const leaf = await screen.findByLabelText('2026-09-17 这篇日记')
    fireEvent.click(leaf)

    await waitFor(() => {
      expect(screen.getByText(/距上篇 7 天/)).toBeTruthy()
      expect(screen.getByText(/距下篇 1 天/)).toBeTruthy()
    })
    expect(screen.getByText(/9月10日/)).toBeTruthy()
    expect(screen.getByText(/9月18日/)).toBeTruthy()
  })

  it('跨月也能接上：9月5日 的上篇是 7月13日，差 54 天', async () => {
    await seed(['2026-07-13', '2026-09-05'])

    render(
      <MemoryRouter>
        <ForestPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText('上个月')).toBeTruthy())
    const now = new Date()
    let back = (now.getFullYear() - 2026) * 12 + (now.getMonth() + 1 - 9)
    while (back > 0) {
      fireEvent.click(screen.getByLabelText('上个月'))
      back -= 1
    }
    while (back < 0) {
      fireEvent.click(screen.getByLabelText('下个月'))
      back += 1
    }

    const leaf = await screen.findByLabelText('2026-09-05 这篇日记')
    fireEvent.click(leaf)

    await waitFor(() => {
      expect(screen.getByText(/距上篇 54 天/)).toBeTruthy()
    })
    expect(screen.getByText(/7月13日/)).toBeTruthy()
  })
})

describe('ForestPage 数据来源', () => {
  it('算「距上/下篇」只取日期清单，不下载全部日记正文', async () => {
    await seed(['2026-09-10', '2026-09-17'])

    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
        if ((init.method || 'GET').toUpperCase() === 'GET') urls.push(String(input))
        return mock.fetch(input, init)
      }),
    )

    render(
      <MemoryRouter>
        <ForestPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText('上个月')).toBeTruthy())
    await waitFor(() => expect(urls.some((u) => u.includes('/api/entries/dates'))).toBe(true))

    // 等所有 effect 跑完
    await new Promise((r) => setTimeout(r, 50))

    const parsed = urls.map((u) => new URL(u, 'http://localhost'))
    expect(parsed.some((u) => u.pathname === '/api/entries/dates')).toBe(true)
    // 只要日期清单，就不该出现「不带筛选、拉全部日记」这个请求
    // （当月数据走 /api/entries?year=&month=，那是允许的）
    const fetchAll = parsed.filter((u) => u.pathname === '/api/entries' && u.search === '')
    expect(fetchAll).toHaveLength(0)
  })
})
