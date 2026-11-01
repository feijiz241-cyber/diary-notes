import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload, Trash2, Sun, Moon, Check, Eraser } from 'lucide-react'
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
import {
  buildExportBundle,
  downloadFile,
  entriesToMarkdown,
  importBundle,
  type ExportBundle,
} from '@/lib/export'
import { getAll, clearAllNotes, clearEntries } from '@/lib/db'
import { describeError } from '@/lib/api-error'
import { cleanupOrphanAssets } from '@/lib/cleanup'
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
    } catch (err) {
      setStatus(`迁移失败：${describeError(err)}`)
    }
  }

  const onExportJson = async () => {
    setStatus('正在打包备份，素材多的话要等几秒…')
    try {
      const bundle = await buildExportBundle()
      downloadFile(`diary-${toDateKey()}.json`, JSON.stringify(bundle, null, 2))
      setStatus('已导出 JSON 备份。')
    } catch (err) {
      setStatus(`导出失败：${describeError(err)}`)
    }
  }

  const onExportMd = async () => {
    setStatus('正在导出 Markdown…')
    try {
      const all = await getAll()
      downloadFile(`diary-${toDateKey()}.md`, entriesToMarkdown(all), 'text/markdown')
      setStatus('已导出 Markdown。')
    } catch (err) {
      setStatus(`导出失败：${describeError(err)}`)
    }
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('正在检查备份文件…')
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('这个文件不是 JSON，可能选错了文件。原有数据没有被改动。')
      }
      // importBundle 会先把整份文件校验完再清空本地数据，坏文件不会造成任何损失
      await importBundle(parsed as ExportBundle)
      setStatus('导入成功，已还原备份。')
    } catch (err) {
      setStatus(`导入失败：${describeError(err)}`)
    } finally {
      e.target.value = ''
    }
  }

  const onCleanup = async () => {
    setStatus('正在清理未引用素材…')
    try {
      const r = await cleanupOrphanAssets()
      setStatus(
        `清理完成：删除 ${r.removedImages} 张图片、${r.removedFiles} 个附件；保留 ${r.keptImages} 张图片、${r.keptFiles} 个附件。`,
      )
    } catch (err) {
      setStatus(`清理失败：${describeError(err)}`)
    }
  }

  const onClearDiary = async () => {
    try {
      await clearEntries()
      setStatus('已清空全部日记（笔记与图片/附件未动）。')
    } catch (err) {
      setStatus(`清空失败：${describeError(err)}`)
    }
  }

  const onClearNotes = async () => {
    try {
      await clearAllNotes()
      setStatus('已清空全部笔记（日记与图片/附件未动）。')
    } catch (err) {
      setStatus(`清空失败：${describeError(err)}`)
    }
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">维护</CardTitle>
          <CardDescription>
            扫描全部日记与笔记，删除没有任何内容引用的图片与附件。从正文移除素材时已即时删除，这里用于回收历史遗留（例如删除请求失败、旧版本留下的文件）。仍被引用的不会被删除。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Eraser className="size-4" /> 清理未引用素材
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认清理？</DialogTitle>
                <DialogDescription>
                  将扫描全部日记与笔记，删除没有任何内容引用的图片与附件。此操作不可恢复。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={onCleanup}>
                    <Check className="size-4" /> 确认清理
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">危险区域</CardTitle>
          <CardDescription>
            清空操作不可恢复，请先导出备份。图片与附件不会被连带删除，可用上方「清理未引用素材」回收。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" /> 清空全部日记
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认清空全部日记？</DialogTitle>
                <DialogDescription>
                  将删除全部日记内容，不影响笔记与图片/附件。此操作不可恢复。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={onClearDiary}>
                    <Check className="size-4" /> 确认清空
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" /> 清空全部笔记
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认清空全部笔记？</DialogTitle>
                <DialogDescription>
                  将删除全部笔记内容，不影响日记与图片/附件。此操作不可恢复。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={onClearNotes}>
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
        所有数据保存在本机文件夹（backend/data/），由本地后端读写，不会上传到任何服务器。
      </p>
    </div>
  )
}
