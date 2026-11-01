import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search as SearchIcon } from 'lucide-react'
import { getEntryDates, getMonth, getByDate, type Entry } from '@/lib/db'
import { describeError } from '@/lib/api-error'
import { useDebouncedValue } from '@/lib/use-debounced'
import { searchEntries } from '@/lib/search'
import { neighborGap } from '@/lib/neighbor-gap'
import { MonthTree } from '@/components/MonthTree'
import { LeafPreview } from '@/components/LeafPreview'
import { LoadError } from '@/components/LoadError'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ForestPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [entries, setEntries] = useState<Entry[]>([])
  const [allDates, setAllDates] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const [highlighted, setHighlighted] = useState<Set<string> | null>(null)
  const [selected, setSelected] = useState<Entry | null>(null)
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 加载当前月日记
  useEffect(() => {
    let active = true
    setLoadError(null)
    getMonth(year, month)
      .then((list) => {
        if (active) setEntries(list)
      })
      .catch((err) => {
        if (active) setLoadError(describeError(err))
      })
    return () => {
      active = false
    }
  }, [year, month, reloadKey])

  // 加载全部日期（只用来算「距上/下篇」，跨月跨年都要能对上）
  // 用 /api/entries/dates 而不是 getAll：以前为了算间隔会把每篇正文都下载一遍
  useEffect(() => {
    let active = true
    getEntryDates()
      .then((dates) => {
        if (active) setAllDates(dates)
      })
      .catch((err) => {
        // 间隔信息是锦上添花：拉不到时树照常可看，但要留下痕迹，不能静默
        console.error('[diary] 拉取日记日期清单失败，上/下篇间隔暂不可用', err)
        if (active) setLoadError(describeError(err))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  // 搜索：命中日期集合（防抖 250ms；active 标记丢弃过期的响应）
  useEffect(() => {
    let active = true
    const q = debouncedQuery.trim()
    if (!q) {
      setHighlighted(null)
      return
    }
    searchEntries(q)
      .then((res) => {
        if (!active) return
        setHighlighted(new Set(res.map((r) => r.date)))
      })
      .catch((err) => {
        console.error('[diary] 搜索失败', err)
        if (active) setHighlighted(null)
      })
    return () => {
      active = false
    }
  }, [debouncedQuery])

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

  const openLeaf = async (date: string) => {
    try {
      const e = await getByDate(date)
      if (e) {
        setSelected(e)
        setOpen(true)
      }
    } catch (err) {
      setLoadError(describeError(err))
    }
  }

  // 选中篇与上/下篇的真实间隔天数（必须基于「全部日记」，否则每月第一篇会显示成没有上篇）
  const gapInfo = useMemo(
    () => neighborGap(allDates, selected?.date ?? ''),
    [allDates, selected],
  )

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

      {loadError && (
        <LoadError
          compact
          message={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

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
        prevDate={gapInfo.prevDate}
        nextDate={gapInfo.nextDate}
      />
    </div>
  )
}
