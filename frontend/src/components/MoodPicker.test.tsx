import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoodPicker } from './MoodPicker'
import { MOODS } from '@/lib/mood'

describe('MoodPicker', () => {
  it('selects a mood and reports its id', async () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /心情/ }))
    const joy = MOODS[0]
    await userEvent.click(screen.getByTitle(joy.label))

    expect(onChange).toHaveBeenCalledWith(joy.id)
  })

  it('clears the mood', async () => {
    const onChange = vi.fn()
    render(<MoodPicker value="joy" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /开心/ }))
    await userEvent.click(screen.getByRole('button', { name: /清除心情/ }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
