import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { normalizeTags, toggleTag } from '@/lib/tags'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ value, onChange }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const norm = normalizeTags(draft)
    if (norm.length === 0) {
      setDraft('')
      return
    }
    let next = value
    for (const t of norm) next = toggleTag(next, t)
    onChange(next)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-none border-2 px-2 py-1.5">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-none border-2 bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`移除标签 ${tag}`}
            className="rounded-none hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? '加标签，回车确认' : ''}
        className="min-w-[100px] flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  )
}
