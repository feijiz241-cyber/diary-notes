import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Compass className="size-10 text-muted-foreground" />
      <p className="text-lg font-bold">这里没有内容</p>
      <p className="text-sm text-muted-foreground">你访问的页面不存在，或链接已失效。</p>
      <Button asChild>
        <Link to="/">回到今天</Link>
      </Button>
    </div>
  )
}
