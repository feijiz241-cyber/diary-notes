import { Button } from '@/components/ui/button'

interface LoadErrorProps {
  /** 已经翻译过的、给用户看的一句话 */
  message: string
  onRetry?: () => void
  /** 紧凑模式：塞进卡片/弹窗里，不占整块 */
  compact?: boolean
}

/**
 * 加载失败时替代「加载中…」的提示块。
 *
 * 存在的理由：以前 getByDate/getAllNotes 一旦 reject（典型场景是后端没起来），
 * 页面就永久停在"加载中…"，用户不知道是慢、是坏、还是自己没等够。
 */
export function LoadError({ message, onRetry, compact = false }: LoadErrorProps) {
  return (
    <div
      role="alert"
      className={
        compact
          ? 'space-y-2 border-2 border-[var(--mc-outline)] bg-card p-3 text-sm'
          : 'space-y-3 border-2 border-[var(--mc-outline)] bg-card p-4 text-sm shadow-[4px_4px_0_0_var(--mc-outline)]'
      }
    >
      <p className="font-extrabold">内容没有加载出来</p>
      <p className="text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}
