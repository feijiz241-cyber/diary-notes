import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, NotebookPen, Plus, Trash2 } from 'lucide-react'
import { getNotesByDate, putNote, deleteNote, type Note } from '@/lib/db'
import { Editor } from '@/components/Editor'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatHuman } from '@/lib/utils'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(key: string, delta: number): string {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + delta)
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

export function NotesPage() {
  const [date, setDate] = useState(() => toDateKey(new Date()))
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    setNotes(null)
    getNotesByDate(date).then((list) => {
      if (active) setNotes(list)
    })
    return () => {
      active = false
    }
  }, [date])

  const reload = () => getNotesByDate(date).then(setNotes)

  const createNote = async () => {
    if (creating) return
    setCreating(true)
    try {
      await putNote({ date, title: '', content: EMPTY_DOC })
      await reload()
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
          <Button onClick={createNote} disabled={creating}>
            <Plus className="size-4" />
            新建笔记
          </Button>
        </div>
      </div>

      {notes === null ? (
        <p className="text-muted-foreground">加载中…</p>
      ) : notes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <NotebookPen className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">这一天还没有笔记</p>
          <Button variant="outline" onClick={createNote} disabled={creating}>
            <Plus className="size-4" />
            写一篇
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} dateKey={date} onDeleted={reload} />
          ))}
        </div>
      )}
    </div>
  )
}
