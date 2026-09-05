import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getYear } from '@/lib/db'
import { getMood } from '@/lib/mood'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

interface MiniMonthProps {
  year: number
  month: number
  moods: Record<string, string | null>
  onDayClick: (date: string) => void
}

function MiniMonth({ year, month, moods, onDayClick }: MiniMonthProps) {
  const dim = daysInMonth(year, month)
  const firstDay = new Date(year, month - 1, 1).getDay()

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-center text-xl font-extrabold">{month}月</h2>
      <div className="grid grid-cols-7 border-2 border-[var(--mc-outline)]">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="flex aspect-square items-center justify-center border border-[var(--mc-outline)]/40 bg-muted/30 text-xs font-bold"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`blank-${i}`} className="aspect-square border border-[var(--mc-outline)]/40" />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const day = i + 1
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const mood = getMood(moods[date])
          return (
            <button
              key={day}
              onClick={() => onDayClick(date)}
              className={cn(
                'relative flex aspect-square w-full items-center justify-center',
                'rounded-none border text-sm font-semibold',
                'transition-colors hover:bg-muted',
                mood ? 'border-[var(--mc-outline)] bg-[var(--mc-plank)]' : 'border-[var(--mc-outline)]/40'
              )}
              title={mood ? `${date} · ${mood.label}` : date}
              aria-label={mood ? `${date} · ${mood.label}` : date}
            >
              {day}
              {mood && (
                <span className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] leading-none">
                  {mood.emoji}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function CalendarPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [moods, setMoods] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let active = true
    getYear(year).then((list) => {
      if (!active) return
      const map: Record<string, string | null> = {}
      for (const e of list) map[e.date] = e.mood
      setMoods(map)
    })
    return () => {
      active = false
    }
  }, [year])

  const handleDayClick = (date: string) => navigate('/day/' + date)

  return (
    <div className="mx-auto w-full">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="mc-sign inline-block px-3 py-1.5 text-2xl font-extrabold">日历</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y - 1)}
            aria-label="上一年"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="mc-sign inline-block min-w-[5.5rem] px-3 py-1.5 text-center text-lg font-extrabold">
            {year}年
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y + 1)}
            aria-label="下一年"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <MiniMonth
            key={i + 1}
            year={year}
            month={i + 1}
            moods={moods}
            onDayClick={handleDayClick}
          />
        ))}
      </div>
    </div>
  )
}
