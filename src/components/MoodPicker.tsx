import { Smile } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import { Button } from './ui/button'
import { MOODS, getMood } from '@/lib/mood'
import { cn } from '@/lib/utils'

interface MoodPickerProps {
  value: string | null
  onChange: (id: string | null) => void
}

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  const current = getMood(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          {current ? <span className="text-lg leading-none">{current.emoji}</span> : <Smile className="size-4" />}
          <span>{current?.label ?? '心情'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <div className="grid grid-cols-4 gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              title={m.label}
              className={cn(
                'flex flex-col items-center rounded-none border-2 border-[var(--mc-outline)] p-2 text-xs font-bold transition-all hover:brightness-95',
                value === m.id && 'shadow-[2px_2px_0_0_hsl(var(--foreground))]',
              )}
              style={{ backgroundColor: m.color }}
            >
              <span className="text-2xl leading-none">{m.emoji}</span>
              <span className="mt-1 text-[var(--mc-outline)]">{m.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="col-span-4 mt-1 rounded-none border-2 border-[var(--mc-outline)] bg-[var(--mc-stone)] p-1 text-xs font-bold text-[var(--mc-outline)] hover:brightness-95"
          >
            清除心情
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
