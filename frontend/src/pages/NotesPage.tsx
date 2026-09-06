import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, NotebookPen, Plus, Trash2 } from 'lucide-react'
import { getAllNotes, putNote, deleteNote, type Note } from '@/lib/db'
import { Editor } from '@/components/Editor'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatHuman } from '@/lib/utils'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(key: string, delta: number): string {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

function shiftMonth(key: string, delta: number): string {
  const d = new Date(key + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, dim))
  return toDateKey(d)
}

interface NoteCardProps {
  note: Note
  dateKey: string
  onDeleted: () => void
}

function NoteCard({ note, dateKey, onDeleted }: NoteCardProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<unknown>(note.content)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // 自动保存（防抖 600ms，与日记一致）
  useEffect(() => {
    if (!dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      putNote({ id: note.id, date: dateKey, title, content }).then(() => setSavedAt(Date.now()))
    }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [title, content, note.id, dateKey])

  // 删除确认 3 秒后自动复位
  useEffect(() => {
    if (!confirmDel) return
    const t = setTimeout(() => setConfirmDel(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDel])

  const handleDelete = async () => {
    if (!confirmDel) {
      setConfirmDel(true)
      return
    }
    await deleteNote(note.id)
    onDeleted()
  }

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            dirty.current = true
            setTitle(e.target.value)
          }}
          placeholder="笔记标题（可选）"
          className="border-0 px-0 font-medium shadow-none focus-visible:ring-0"
        />
        {savedAt && <span className="shrink-0 text-xs text-muted-foreground">已保存</span>}
        <Button
          variant="outline"
          size="icon"
          onClick={handleDelete}
          aria-label={confirmDel ? '确认删除' : '删除笔记'}
          title={confirmDel ? '再点一次确认删除' : '删除笔记'}
          className={confirmDel ? 'border-destructive text-destructive' : undefined}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Editor
        value={content}
        onChange={(c) => {
          dirty.current = true
          setContent(c)
        }}
        dateKey={dateKey}
        placeholder="记点什么……"
      />
    </Card>
  )
}

/** 月历：标出有笔记的日子（数量角标），点日期跳转。 */
function NoteMiniMonth({
  date,
  counts,
  onSelect,
  onShiftMonth,
}: {
  date: string
  counts: Record<string, number>
  onSelect: (date: string) => void
  onShiftMonth: (delta: number) => void
}) {
  const d = new Date(date + 'T00:00:00')
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const dim = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => onShiftMonth(-1)} aria-label="上个月">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-extrabold">
          {year}年{month}月
        </span>
        <Button variant="outline" size="icon" onClick={() => onShiftMonth(1)} aria-label="下个月">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-bold text-muted-foreground">
            {w}
          </div>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const day = i + 1
          const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const count = counts[key] ?? 0
          const selected = key === date
          return (
            <button
              key={day}
              onClick={() => onSelect(key)}
              title={count ? `${key} · ${count} 篇笔记` : key}
              aria-label={count ? `${key}，${count} 篇笔记` : key}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-none border text-xs font-semibold transition-colors',
                selected
                  ? 'border-[var(--mc-outline)] bg-primary text-primary-foreground'
                  : count
                    ? 'border-[var(--mc-outline)] bg-[var(--mc-plank)] hover:bg-muted'
                    : 'border-transparent hover:bg-muted',
              )}
            >
              {day}
              {count > 0 && !selected && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function NotesPage() {
  const [date, setDate] = useState(() => toDateKey(new Date()))
  const [allNotes, setAllNotes] = useState<Note[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCalendar, setShowCalendar] = useState(true)

  const load = () => getAllNotes().then(setAllNotes)

  useEffect(() => {
    let active = true
    getAllNotes().then((list) => {
      if (active) setAllNotes(list)
    })
    return () => {
      active = false
    }
  }, [])

  const dayNotes = useMemo(
    () => (allNotes ?? []).filter((n) => n.date === date),
    [allNotes, date],
  )

  // 当月每天笔记数量（用于月历角标）
  const monthCounts = useMemo(() => {
    const prefix = date.slice(0, 7) // 'YYYY-MM'
    const counts: Record<string, number> = {}
    for (const n of allNotes ?? []) {
      if (n.date.startsWith(prefix)) counts[n.date] = (counts[n.date] ?? 0) + 1
    }
    return counts
  }, [allNotes, date])

  const createNote = async () => {
    if (creating) return
    setCreating(true)
    try {
      await putNote({ date, title: '', content: EMPTY_DOC })
      await load()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="mc-sign inline-block px-3 py-1.5 text-2xl font-extrabold">笔记</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="前一天">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="mc-sign inline-block min-w-40 px-3 py-1.5 text-center text-lg font-extrabold">
            {formatHuman(date)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="后一天">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setDate(toDateKey(new Date()))}>
            今天
          </Button>
          <Button
            variant={showCalendar ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowCalendar((v) => !v)}
            aria-label="切换月历"
            title="月历（标出有笔记的日子）"
          >
            <CalendarDays className="size-4" />
          </Button>
          <Button onClick={createNote} disabled={creating}>
            <Plus className="size-4" />
            新建笔记
          </Button>
        </div>
      </div>

      <div className={cn('gap-4', showCalendar && 'lg:grid lg:grid-cols-[260px_1fr]')}>
        {showCalendar && (
          <div className={cn(showCalendar && 'mb-4 lg:mb-0')}>
            <NoteMiniMonth
              date={date}
              counts={monthCounts}
              onSelect={setDate}
              onShiftMonth={(delta) => setDate((d) => shiftMonth(d, delta))}
            />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          {allNotes === null ? (
            <p className="text-muted-foreground">加载中…</p>
          ) : dayNotes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <NotebookPen className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground">这一天还没有笔记</p>
              <Button variant="outline" onClick={createNote} disabled={creating}>
                <Plus className="size-4" />
                写一篇
              </Button>
            </Card>
          ) : (
            dayNotes.map((n) => (
              <NoteCard key={n.id} note={n} dateKey={date} onDeleted={load} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
