import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Editor } from '@/components/Editor'
import { getMood } from '@/lib/mood'
import { formatHuman } from '@/lib/utils'
import type { Entry } from '@/lib/db'

interface LeafPreviewProps {
  entry: Entry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 距上篇的间隔天数（无上一篇则为 null） */
  prevGap?: number | null
  /** 距下篇的间隔天数（无下篇则为 null） */
  nextGap?: number | null
}

export function LeafPreview({ entry, open, onOpenChange, prevGap, nextGap }: LeafPreviewProps) {
  const mood = getMood(entry?.mood ?? null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {entry && (
          <div className="border-2 border-[var(--mc-outline)] bg-[#f9f5eb] text-[#2a1c0d]">
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold">{entry.title || '（无标题）'}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <span>{formatHuman(entry.date)}</span>
                {mood && (
                  <span className="inline-flex items-center gap-1 border-2 border-[var(--mc-outline)] bg-[var(--mc-plank)] px-2 py-0.5 text-xs font-bold text-[#2a1c0d]">
                    {mood.emoji} {mood.label}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 p-4">
              {(prevGap != null || nextGap != null) && (
                <div className="flex flex-wrap gap-2 border-2 border-[var(--mc-outline)] bg-[var(--mc-plank)] px-2 py-1 text-xs font-bold text-[#2a1c0d]">
                  {prevGap != null && <span>距上篇 {prevGap} 天</span>}
                  {nextGap != null && <span>距下篇 {nextGap} 天</span>}
                </div>
              )}

              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {entry.tags.map((t) => (
                    <span
                      key={t}
                      className="border-2 border-[var(--mc-outline)] bg-[var(--mc-plank)] px-2 py-0.5 text-xs font-bold text-[#2a1c0d]"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              <Editor value={entry.content} onChange={() => {}} dateKey={entry.date} editable={false} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
