import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { FileText, Download, X } from 'lucide-react'

/** 人类可读的文件大小。 */
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function FileView({ node, deleteNode, editor }: NodeViewProps) {
  const fileId = node.attrs.fileId as string
  const name = (node.attrs.name as string) || '附件'
  const size = Number(node.attrs.size) || 0
  const mime = node.attrs.mime as string

  return (
    <NodeViewWrapper className="my-2">
      <div
        contentEditable={false}
        className="flex items-center gap-3 border-2 border-[var(--mc-outline)] bg-[var(--mc-plank)] px-3 py-2 text-[#2a1c0d]"
      >
        <FileText className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" title={name}>
            {name}
          </div>
          <div className="truncate text-xs opacity-80">
            {formatSize(size)}
            {mime ? ` · ${mime}` : ''}
          </div>
        </div>
        <a
          href={`/api/files/${fileId}`}
          download={name}
          className="shrink-0 border-2 border-[var(--mc-outline)] p-1 transition-colors hover:bg-accent"
          title="下载"
          aria-label={`下载 ${name}`}
        >
          <Download className="size-4" />
        </a>
        {editor?.isEditable && (
          <button
            type="button"
            onClick={() => deleteNode()}
            className="shrink-0 border-2 border-[var(--mc-outline)] p-1 transition-colors hover:bg-accent"
            title="移除附件"
            aria-label="移除附件"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  )
}

/** 附件节点：原子块，渲染为可下载的附件卡片。 */
export const FileNode = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      fileId: { default: null },
      entryId: { default: null },
      name: { default: '' },
      size: { default: 0 },
      mime: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'a[data-file-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-file-id': HTMLAttributes.fileId })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileView)
  },
})
