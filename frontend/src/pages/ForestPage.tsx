import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search as SearchIcon } from 'lucide-react'
import { getMonth, getByDate, type Entry } from '@/lib/db'
import { searchEntries } from '@/lib/search'
import { MonthTree } from '@/components/MonthTree'
import { LeafPreview } from '@/components/LeafPreview'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ForestPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [entries, setEntries] = useState<Entry[]>([])
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState<Set<string> | null>(null)
  const [selected, setSelected] = useState<Entry | null>(null)
  const [open, setOpen] = useState(false)

  // 加载当前月日记
  useEffect(() => {
    let active = true
    getMonth(year, month).then((list) => {
      if (active) setEntries(list)
    })
    return () => {
      active = false
    }
  }, [year, month])

  // 搜索：命中日期集合
  useEffect(() => {
    let active = true
    const q = query.trim()
    if (!q) {
      setHighlighted(null)
      return
    }
    searchEntries(q).then((res) => {
      if (!active) return
      setHighlighted(new Set(res.map((r) => r.date)))
    })
    return () => {
      active = false
    }
  }, [query])

  const shiftMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setYear(y)
    setMonth(m)
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [entries],
  )

  const openLeaf = async (date: string) => {
    const e = await getByDate(date)
    if (e) {
      setSelected(e)
      setOpen(true)
    }
  }

  // 计算选中篇与上/下篇的间隔天数
  const gapInfo = useMemo(() => {
    if (!selected) return { prevGap: null, nextGap: null }
    const idx = sorted.findIndex((e) => e.date === selected.date)
    if (idx < 0) return { prevGap: null, nextGap: null }
    const dayOf = (d: string) => parseInt(d.slice(8, 10), 10)
    const cur = dayOf(selected.date)
    const prev = idx > 0 ? dayOf(sorted[idx - 1].date) : null
    const next = idx < sorted.length - 1 ? dayOf(sorted[idx + 1].date) : null
    return {
      prevGap: prev != null ? cur - prev - 1 : null,
      nextGap: next != null ? next - cur - 1 : null,
    }
  }, [selected, sorted])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="上个月">
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="mc-sign min-w-28 px-3 py-1.5 text-center text-xl font-extrabold">
            {year} 年 {month} 月
          </h1>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="下个月">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="relative max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或正文，树上高亮命中"
            className="pl-8"
          />
        </div>
      </div>

      <MonthTree
        entries={entries}
        year={year}
        month={month}
        selectedDate={selected?.date}
        highlightedDates={highlighted}
        onSelect={openLeaf}
      />

      <LeafPreview
        entry={selected}
        open={open}
        onOpenChange={setOpen}
        prevGap={gapInfo.prevGap}
        nextGap={gapInfo.nextGap}
      />
    </div>
  )
}
