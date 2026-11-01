import { useEffect, useRef, useState } from 'react'
import { getByDate, putEntry, type Entry } from '@/lib/db'
import { describeError } from '@/lib/api-error'
import { Editor } from './Editor'
import { LoadError } from './LoadError'
import { MoodPicker } from './MoodPicker'
import { TagInput } from './TagInput'
import { Input } from './ui/input'
import { formatHuman } from '@/lib/utils'
import { isEmptyDoc } from '@/lib/editor-serialize'

interface DayEditorProps {
  dateKey: string
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

/** 草稿：日期与内容成对保存，避免切日期时张冠李戴。 */
interface Draft {
  date: string
  data: Partial<Entry>
}

function hasContent(data: Partial<Entry>): boolean {
  const content = (data.content as object) ?? EMPTY_DOC
  return (
    !isEmptyDoc(content) ||
    (data.title ?? '').trim() !== '' ||
    !!data.mood ||
    (data.tags ?? []).length > 0
  )
}

export function DayEditor({ dateKey }: DayEditorProps) {
  const [entry, setEntry] = useState<Partial<Entry> | null>(null)
  // 已加载完成的日期；用 dateKey 比对，避免「新日期 + 旧内容」的中间态被写回
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 重试计数：变一下就重新拉一遍，无需把加载逻辑塞进一个可调用函数
  const [reloadKey, setReloadKey] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const pending = useRef<Draft | null>(null)

  const loaded = loadedFor === dateKey

  const patch = (p: Partial<Entry>) => {
    dirty.current = true
    setEntry((prev) => ({ ...(prev ?? {}), ...p }))
  }

  /** 把 pending 草稿写入后端（空内容不落盘，与原行为一致）。 */
  const flush = () => {
    const draft = pending.current
    pending.current = null
    dirty.current = false
    if (!draft || !hasContent(draft.data)) return
    const content = (draft.data.content as object) ?? EMPTY_DOC
    void putEntry({
      date: draft.date,
      title: draft.data.title ?? '',
      content,
      mood: draft.data.mood ?? null,
      tags: draft.data.tags ?? [],
    })
      .then(() => {
        setSavedAt(Date.now())
        setSaveError(null)
      })
      .catch((err) => {
        // 保存失败必须让用户看见：否则会以为写进去了，其实没有
        setSaveError(describeError(err))
        // 并且绝不能把草稿丢掉：放回 pending、保持 dirty，5 秒后再试一次
        pending.current = { date: draft.date, data: draft.data }
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, 5000)
      })
  }

  useEffect(() => {
    let active = true
    setLoadError(null)
    getByDate(dateKey)
      .then((e) => {
        if (!active) return
        setEntry(e ?? null)
        setLoadedFor(dateKey)
      })
      .catch((err) => {
        if (!active) return
        setLoadError(describeError(err))
      })
    return () => {
      active = false
    }
  }, [dateKey, reloadKey])

  // 防抖自动保存
  useEffect(() => {
    if (!loaded) return
    pending.current = { date: dateKey, data: entry ?? {} }
    if (!dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, loaded, dateKey])

  // 切换日期或离开页面时，把未保存的草稿立即落盘，避免丢失
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])

  if (loadError) {
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadedFor(null)
          setReloadKey((k) => k + 1)
        }}
      />
    )
  }

  if (!loaded) return <p className="text-muted-foreground">加载中…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl">{formatHuman(dateKey)}</h1>
        <div className="flex items-center gap-3">
          {saveError ? (
            <span className="text-xs font-bold text-destructive" title={saveError}>
              保存失败，稍后会自动重试
            </span>
          ) : (
            savedAt && <span className="text-xs text-muted-foreground">已自动保存</span>
          )}
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
