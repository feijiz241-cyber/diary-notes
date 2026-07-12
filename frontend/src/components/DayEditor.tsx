import { useEffect, useRef, useState } from 'react'
import { getByDate, putEntry, type Entry } from '@/lib/db'
import { Editor } from './Editor'
import { MoodPicker } from './MoodPicker'
import { TagInput } from './TagInput'
import { Input } from './ui/input'
import { formatHuman } from '@/lib/utils'
import { isEmptyDoc } from '@/lib/editor-serialize'

interface DayEditorProps {
  dateKey: string
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export function DayEditor({ dateKey }: DayEditorProps) {
  const [entry, setEntry] = useState<Partial<Entry> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    setLoaded(false)
    getByDate(dateKey).then((e) => {
      if (!active) return
      setEntry(e ?? null)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [dateKey])

  const patch = (p: Partial<Entry>) => setEntry((prev) => ({ ...(prev ?? {}), ...p }))

  useEffect(() => {
    if (!loaded) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const data = entry ?? {}
      const content = (data.content as object) ?? EMPTY_DOC
      const hasContent =
        !isEmptyDoc(content) ||
        (data.title ?? '').trim() !== '' ||
        !!data.mood ||
        (data.tags ?? []).length > 0
      if (!hasContent) return
      putEntry({
        date: dateKey,
        title: data.title ?? '',
        content,
        mood: data.mood ?? null,
        tags: data.tags ?? [],
      }).then(() => setSavedAt(Date.now()))
    }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [entry, loaded, dateKey])

  if (!loaded) return <p className="text-muted-foreground">加载中…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl">{formatHuman(dateKey)}</h1>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-muted-foreground">已自动保存</span>}
          <MoodPicker value={entry?.mood ?? null} onChange={(m) => patch({ mood: m })} />
        </div>
      </div>

      <Input
        value={entry?.title ?? ''}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder="标题（可选）"
        className="border-0 px-0 text-xl font-medium shadow-none focus-visible:ring-0"
      />

      <Editor
        value={entry?.content ?? null}
        onChange={(c) => patch({ content: c })}
        dateKey={dateKey}
      />

      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">标签</label>
        <TagInput value={entry?.tags ?? []} onChange={(tags) => patch({ tags })} />
      </div>
    </div>
  )
}
