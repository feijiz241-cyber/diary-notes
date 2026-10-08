import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, CalendarDays, Search, Settings, Sun, Moon, Home, TreePine, NotebookPen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'
import { Button } from './ui/button'

const navItems = [
  { to: '/', label: '今日', icon: Home, end: true },
  { to: '/notes', label: '笔记', icon: NotebookPen, end: false },
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
              'flex items-center gap-3 rounded-none border-2 px-3 py-2 text-sm font-bold transition-[filter] pixel-press',
              orientation === 'horizontal' && 'flex-col gap-1 px-2 py-1 text-[11px]',
              isActive
                ? 'bg-primary text-primary-foreground border-[var(--mc-outline)] shadow-[inset_0_3px_0_rgba(255,255,255,0.22),inset_0_-4px_0_rgba(0,0,0,0.28),3px_3px_0_0_var(--mc-outline)] hover:brightness-105'
                : 'bg-[var(--mc-plank)] text-[#2a1c0d] border-[var(--mc-outline)] shadow-[inset_0_3px_0_var(--mc-plank-light),inset_0_-4px_0_var(--mc-plank-dark),3px_3px_0_0_var(--mc-outline)] hover:brightness-105',
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
      {/* 侧边栏：桌面端（木板墙） */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-2 border-[var(--mc-outline)] bg-[var(--card)] p-4 md:flex">
        <div className="mc-sign mb-6 flex items-center gap-2 px-3 py-2 text-lg font-extrabold">
          <BookOpen className="size-5" />
          <span>日记</span>
        </div>
        <nav className="flex flex-col gap-2">
          <NavItems orientation="vertical" />
        </nav>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b-2 border-[var(--mc-outline)] bg-[var(--card)] px-4 py-3 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <BookOpen className="size-5" />
            <span className="text-lg font-bold">日记</span>
          </div>
          <div className="mc-sign hidden px-3 py-1.5 text-base font-extrabold md:block">像素森林</div>
          <Button variant="outline" size="icon" onClick={toggle} aria-label="切换主题">
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </main>

        {/* 底部导航：移动端 */}
        <nav className="flex justify-around border-t-2 border-[var(--mc-outline)] bg-[var(--card)] py-2 md:hidden">
          <NavItems orientation="horizontal" />
        </nav>
      </div>
    </div>
  )
}
