import type { JSONContent } from '@tiptap/react'

/** TipTap 文档是否为空（无内容或仅空段落）。 */
export function isEmptyDoc(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return true
  const d = doc as JSONContent
  if (!d.content || d.content.length === 0) return true
  return d.content.every(
    (n) => n.type === 'paragraph' && (!n.content || n.content.length === 0),
  )
}

/** 把 TipTap 文档递归提取为纯文本（用于搜索与导出）。 */
export function docToText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as JSONContent
    if (n.type === 'text' && n.text) parts.push(n.text)
    // 附件节点：把文件名纳入文本，便于搜索与 Markdown 导出
    if (n.type === 'fileAttachment' && n.attrs?.name) parts.push(`[附件] ${String(n.attrs.name)}`)
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return parts.join('')
}

/** 收集文档里引用的图片 / 附件 id（供「清理未引用素材」使用）。 */
export function collectAssetIds(doc: unknown): { imageIds: string[]; fileIds: string[] } {
  const imageIds: string[] = []
  const fileIds: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as JSONContent
    const attrs = n.attrs as Record<string, unknown> | undefined
    if (n.type === 'image' && attrs?.imageId) imageIds.push(String(attrs.imageId))
    if (n.type === 'fileAttachment' && attrs?.fileId) fileIds.push(String(attrs.fileId))
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return { imageIds, fileIds }
}

/** 存储格式互转：直接以 JSON 字符串保存/读取 TipTap 文档。 */
export function serialize(content: unknown): string {
  return JSON.stringify(content ?? null)
}

export function parse(raw: string | null | undefined): JSONContent | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JSONContent
  } catch {
    return null
  }
}
