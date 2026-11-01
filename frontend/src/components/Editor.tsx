import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Heading2, List, ListOrdered, Quote, Code } from 'lucide-react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { ImageNode } from './ImageNode'
import { ImageUpload } from './ImageUpload'
import { FileNode } from './FileNode'
import { FileUpload } from './FileUpload'
import { purgeRemovedAssets, snapshotAssets, type AssetSnapshot } from '@/lib/asset-sync'
import { pickImageFiles } from '@/lib/clipboard-images'
import { MAX_FILE_BYTES, putImage } from '@/lib/db'
import { cn } from '@/lib/utils'

interface EditorProps {
  value: unknown
  onChange: (json: unknown) => void
  dateKey: string
  /** 只读预览模式（隐藏工具栏与上传，禁止编辑） */
  editable?: boolean
  /** 空内容占位文案 */
  placeholder?: string
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-none border-2 border-transparent p-2 transition-colors hover:bg-accent',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function Editor({ value, onChange, dateKey, editable = true, placeholder = '今天发生了什么……' }: EditorProps) {
  // 当前文档引用的素材快照，用于在素材被移出正文时同步删除后端文件
  const assetsRef = useRef<AssetSnapshot | null>(null)

  // useEditor 的配置只在创建时生效，粘贴/拖拽回调里改用 ref 读最新的 dateKey 与实例
  const editorRef = useRef<TiptapEditor | null>(null)
  const dateKeyRef = useRef(dateKey)
  dateKeyRef.current = dateKey

  /**
   * 把图片文件入库并插到光标处——与工具栏「插入图片」走同一条路径（putImage → imageId/entryId 节点），
   * 这样 ImageNode 的 NodeView 才能从后端取到字节。
   */
  const insertImages = useCallback(async (files: File[], pos?: number) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > MAX_FILE_BYTES) {
        alert(`「${file.name || '图片'}」超过 20MB 上限，已跳过`)
        continue
      }
      try {
        const imageId = await putImage(dateKeyRef.current, file)
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return
        ed.chain()
          // 第一张落在粘贴处/鼠标松开处，后续图片跟随选区依次插入
          .focus(i === 0 ? (pos ?? null) : null)
          .setImage({ src: `file:${imageId}`, alt: file.name } as never)
          .updateAttributes('image', { imageId, entryId: dateKeyRef.current } as never)
          .run()
      } catch (err) {
        alert(`图片插入失败：${(err as Error).message}`)
      }
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageNode,
      FileNode,
      Placeholder.configure({ placeholder }),
    ],
    content: (value as object) ?? '',
    editable,
    onUpdate: editable
      ? ({ editor }) => {
          const next = snapshotAssets(editor.getJSON())
          const prev = assetsRef.current
          assetsRef.current = next
          // 先回收被移除的素材，再上报新内容
          if (prev) void purgeRemovedAssets(prev, next)
          onChange(editor.getJSON())
        }
      : undefined,
    editorProps: {
      attributes: { class: 'min-h-[240px] px-3 py-3' },
      // 默认粘贴只认 text/html，剪贴板里的图片文件会被丢掉；这里接管成入库 + 插入节点
      handlePaste: (_view, event) => {
        if (!editable) return false
        const files = pickImageFiles(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(files)
        return true
      },
      // 拖拽图片进正文，插到鼠标松开的位置
      handleDrop: (view, event) => {
        if (!editable) return false
        const files = pickImageFiles(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImages(files, at)
        return true
      },
    },
  })

  editorRef.current = editor

  // 外部 value 变化（切换日期）时同步编辑器内容，并重置素材基线
  useEffect(() => {
    if (!editor) return
    if (value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value as object, false)
    }
    assetsRef.current = snapshotAssets(editor.getJSON())
  }, [editor, value])

  if (!editor) return null

  if (!editable) {
    return (
      <div className="rounded-none border-2 border-[var(--mc-outline)] bg-[#f9f5eb] text-[#2a1c0d]">
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-none border-2 bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b-2 p-2">
        <ToolbarButton
          label="加粗"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="斜体"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="标题"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="无序列表"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="有序列表"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="引用"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="行内代码"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-4" />
        </ToolbarButton>
        <ImageUpload editor={editor} dateKey={dateKey} />
        <FileUpload editor={editor} dateKey={dateKey} />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export type { TiptapEditor }
