import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload, Trash2, Sun, Moon, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { useTheme } from '@/components/ThemeProvider'
import { buildExportBundle, downloadFile, entriesToMarkdown, importBundle } from '@/lib/export'
import { getAll, clearAll } from '@/lib/db'
import { hasBrowserData, migrateBrowserToBackend } from '@/lib/migrate'
import { toDateKey } from '@/lib/utils'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [hasOld, setHasOld] = useState<boolean | null>(null)

  useEffect(() => {
    hasBrowserData()
      .then(setHasOld)
      .catch(() => setHasOld(false))
  }, [])

  const onMigrate = async () => {
    try {
      const n = await migrateBrowserToBackend()
      setStatus(`已从浏览器迁移 ${n} 篇日记到本机文件，之后不再因清缓存而丢失。`)
      setHasOld(false)
    } catch {
      setStatus('迁移失败，请重试。')
    }
  }

  const onExportJson = async () => {
    const bundle = await buildExportBundle()
    downloadFile(`diary-${toDateKey()}.json`, JSON.stringify(bundle, null, 2))
    setStatus('已导出 JSON 备份。')
  }

  const onExportMd = async () => {
    const all = await getAll()
    downloadFile(`diary-${toDateKey()}.md`, entriesToMarkdown(all), 'text/markdown')
    setStatus('已导出 Markdown。')
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await importBundle(JSON.parse(text))
      setStatus('导入成功，已还原备份。')
    } catch {
      setStatus('导入失败：文件格式不正确。')
    }
    e.target.value = ''
  }

  const onClear = async () => {
    await clearAll()
    setStatus('已清空全部日记。')
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="mc-sign mb-1 inline-block px-3 py-1.5 text-2xl font-extrabold">设置</h1>
      {status && <p className="border-2 border-[var(--mc-outline)] bg-[var(--mc-plank)] px-3 py-2 text-sm font-bold text-[#2a1c0d]">{status}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">外观</CardTitle>
          <CardDescription>切换浅色 / 深色主题，偏好会被记住。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>
              <Sun className="size-4" /> 浅色
            </Button>
            <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>
              <Moon className="size-4" /> 深色
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">数据</CardTitle>
          <CardDescription>导出备份到本地文件，或导入之前导出的备份进行还原。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={onExportJson}>
            <Download className="size-4" /> 导出 JSON
          </Button>
          <Button variant="outline" onClick={onExportMd}>
            <Download className="size-4" /> 导出 Markdown
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> 导入备份
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </CardContent>
      </Card>

      {hasOld === true && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base">发现浏览器旧日记</CardTitle>
            <CardDescription>
              检测到旧版（浏览器内）还存有日记，可一键迁移到本机文件，之后不再受清缓存影响。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onMigrate}>
              <Upload className="size-4" /> 迁移到本机文件
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">危险区域</CardTitle>
          <CardDescription>清空操作不可恢复，请先导出备份。</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" /> 清空全部日记
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认清空？</DialogTitle>
                <DialogDescription>
                  这将删除全部日记与图片，且无法恢复。建议先导出 JSON 备份。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={onClear}>
                    <Check className="size-4" /> 确认清空
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Separator />
      <p className="text-center text-xs text-muted-foreground">
        所有数据保存在本机文件夹（data/），由本地后端读写，不会上传到任何服务器。
      </p>
    </div>
  )
}
