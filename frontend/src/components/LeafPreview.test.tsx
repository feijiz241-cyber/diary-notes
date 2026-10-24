import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LeafPreview } from './LeafPreview'
import type { Entry } from '@/lib/db'

const entry: Entry = {
  id: '2026-09-17',
  date: '2026-09-17',
  title: '测试',
  content: { type: 'doc', content: [] },
  mood: null,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
}

describe('LeafPreview 距上/下篇显示', () => {
  it('显示真实相差天数与对方日期', () => {
    render(
      <MemoryRouter>
        <LeafPreview
          entry={entry}
          open
          onOpenChange={() => {}}
          prevGap={7}
          nextGap={1}
          prevDate="2026-09-10"
          nextDate="2026-09-18"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/距上篇 7 天/)).toBeTruthy()
    expect(screen.getByText(/距下篇 1 天/)).toBeTruthy()
    expect(screen.getByText(/9月10日/)).toBeTruthy()
    expect(screen.getByText(/9月18日/)).toBeTruthy()
  })

  it('没有上/下篇时不渲染对应片段', () => {
    render(
      <MemoryRouter>
        <LeafPreview entry={entry} open onOpenChange={() => {}} prevGap={null} nextGap={1} nextDate="2026-09-18" />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/距上篇/)).toBeNull()
    expect(screen.getByText(/距下篇 1 天/)).toBeTruthy()
  })
})
