import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, CalendarDays, Search, Settings, Sun, Moon, Home, TreePine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'
import { Button } from './ui/button'

const navItems = [
  { to: '/', label: '今日', icon: Home, end: true },
  { to: '/forest', label: '森林', icon: TreePine, end: false },
  { to: '/calendar', label: '日历', icon: CalendarDays, end: false },
  { to: '/search', label: '搜索', icon: Search, end: false },
  { to: '/settings', label: '设置', icon: Settings, end: false },
]

function NavItems({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  return (
    <>
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-none border-2 px-3 py-2 text-sm font-bold transition-colors pixel-press',
              orientation === 'horizontal' && 'flex-col gap-1 px-2 py-1 text-xs',
              isActive
                ? 'bg-primary text-primary-foreground border-foreground shadow-[3px_3px_0_0_hsl(var(--foreground))]'
                : 'bg-card text-card-foreground border-border shadow-[3px_3px_0_0_hsl(var(--border))] hover:bg-accent hover:text-accent-foreground',
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </>
  )
}

export function AppShell() {
  const { theme, toggle } = useTheme()

  return (
    <div className="flex min-h-screen bg-background">
      {/* 侧边栏：桌面端 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-2 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 pt-2">
          <BookOpen className="size-5 text-primary" />
          <span className="text-lg font-bold">日记</span>
        </div>
        <nav className="flex flex-col gap-2">
          <NavItems orientation="vertical" />
        </nav>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b-2 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <BookOpen className="size-5 text-primary" />
            <span className="text-lg font-bold">日记</span>
          </div>
          <div className="hidden text-lg font-bold md:block">像素森林</div>
          <Button variant="outline" size="icon" onClick={toggle} aria-label="切换主题">
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </main>

        {/* 底部导航：移动端 */}
        <nav className="flex justify-around border-t-2 bg-background py-2 md:hidden">
          <NavItems orientation="horizontal" />
        </nav>
      </div>
    </div>
  )
}
