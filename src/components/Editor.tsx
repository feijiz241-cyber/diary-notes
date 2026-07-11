import { useEffect, type ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Heading2, List, ListOrdered, Quote, Code } from 'lucide-react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { ImageNode } from './ImageNode'
import { ImageUpload } from './ImageUpload'
import { cn } from '@/lib/utils'

interface EditorProps {
  value: unknown
  onChange: (json: unknown) => void
  dateKey: string
  /** 只读预览模式（隐藏工具栏与上传，禁止编辑） */
  editable?: boolean
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
        'rounded p-2 transition-colors hover:bg-accent',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function Editor({ value, onChange, dateKey, editable = true }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageNode,
      Placeholder.configure({ placeholder: '今天发生了什么……' }),
    ],
    content: (value as object) ?? '',
    editable,
    onUpdate: editable ? ({ editor }) => onChange(editor.getJSON()) : undefined,
    editorProps: {
      attributes: { class: 'min-h-[240px] px-3 py-3' },
    },
  })

  // 外部 value 变化（切换日期）时同步编辑器内容
  useEffect(() => {
    if (editor && value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value as object, false)
    }
  }, [editor, value])

  if (!editor) return null

  if (!editable) {
    return (
      <div className="rounded-lg border bg-card">
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
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
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export type { TiptapEditor }
