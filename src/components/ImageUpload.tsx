import { useRef, type ChangeEvent } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { putImage } from '@/lib/db'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  editor: Editor
  dateKey: string
  className?: string
}

export function ImageUpload({ editor, dateKey, className }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const imageId = await putImage(dateKey, file)
      editor
        .chain()
        .focus()
        .setImage({ src: `idb:${imageId}`, alt: file.name } as never)
        .updateAttributes('image', { imageId, entryId: dateKey } as never)
        .run()
    }
    e.target.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn('rounded p-2 transition-colors hover:bg-accent', className)}
        title="插入图片"
        aria-label="插入图片"
      >
        <ImageIcon className="size-4" />
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
    </>
  )
}
