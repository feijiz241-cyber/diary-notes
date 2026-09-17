import { useRef, useState, type ChangeEvent } from 'react'
import { Loader2, Paperclip } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { MAX_FILE_BYTES, putFile } from '@/lib/db'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  editor: Editor
  dateKey: string
  className?: string
}

/** 工具栏「上传文件」按钮：支持任意类型、多选，上传后在光标处插入附件卡片。 */
export function FileUpload({ editor, dateKey, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`「${file.name}」超过 20MB 上限，已跳过`)
          continue
        }
        try {
          const fileId = await putFile(dateKey, file)
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'fileAttachment',
              attrs: { fileId, entryId: dateKey, name: file.name, size: file.size, mime: file.type || '' },
            })
            .run()
        } catch (err) {
          alert(`「${file.name}」上传失败：${(err as Error).message}`)
        }
      }
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          'rounded-none border-2 border-transparent p-2 transition-colors hover:bg-accent disabled:opacity-60',
          className,
        )}
        title="上传文件"
        aria-label="上传文件"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
    </>
  )
}
