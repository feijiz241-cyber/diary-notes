import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DayPicker, type DayButtonProps } from 'react-day-picker'
import 'react-day-picker/style.css'
import { getMonth } from '@/lib/db'
import { getMood } from '@/lib/mood'
import { toDateKey, cn } from '@/lib/utils'

export function CalendarPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useState<Date>(new Date())
  const [moods, setMoods] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let active = true
    const y = month.getFullYear()
    const m = month.getMonth() + 1
    getMonth(y, m).then((list) => {
      if (!active) return
      const map: Record<string, string | null> = {}
      for (const e of list) map[e.date] = e.mood
      setMoods(map)
    })
    return () => {
      active = false
    }
  }, [month])

  const DayButtonWithMood = ({ day, modifiers: _modifiers, children, ...rest }: DayButtonProps) => {
    const mood = getMood(moods[toDateKey(day.date)])
    return (
      <button {...rest} className={cn('relative', rest.className)}>
        {children}
        {mood && (
          <span className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] leading-none">
            {mood.emoji}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl">日历</h1>
      <DayPicker
        month={month}
        onMonthChange={setMonth}
        mode="single"
        onSelect={(d) => {
          if (d) navigate('/day/' + toDateKey(d))
        }}
        components={{ DayButton: DayButtonWithMood }}
      />
    </div>
  )
}
