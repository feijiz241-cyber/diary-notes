import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 兜底：任何一屏渲染抛错时，给出可读提示 + 重新加载，而不是整页白屏。
 *
 * 数据都在本地磁盘上，渲染失败不会丢数据 —— 文案要把这一点说清楚，
 * 否则用户第一反应是"我的日记没了"。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[diary] 页面渲染出错：', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg space-y-3 border-2 border-[var(--mc-outline)] bg-card p-5 shadow-[4px_4px_0_0_var(--mc-outline)]">
          <h1 className="text-lg font-extrabold">这一屏出错了</h1>
          <p className="text-sm text-muted-foreground">
            日记和笔记都还好好地存在本地磁盘上，只是这个页面渲染失败了。点下面的按钮重新加载就好。
          </p>
          <pre className="max-h-40 overflow-auto border-2 border-[var(--mc-outline)]/40 bg-muted/40 p-2 text-xs whitespace-pre-wrap">
            {String(error.message || error)}
          </pre>
          <Button variant="outline" onClick={() => window.location.reload()}>
            重新加载页面
          </Button>
        </div>
      </div>
    )
  }
}
