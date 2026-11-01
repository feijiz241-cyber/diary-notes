/**
 * 从粘贴 / 拖拽事件的数据里挑出图片文件。
 *
 * 为什么需要它：TipTap（ProseMirror）默认的粘贴只处理 text/html，
 * 剪贴板里的图片**文件**（截图、复制的图片文件）不会变成文档节点，
 * 必须由 editorProps.handlePaste / handleDrop 自己接管，见 components/Editor.tsx。
 */
export function pickImageFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return []

  // 截图、从资源管理器复制的图片，通常直接出现在 files 里
  const out: File[] = []
  for (const f of Array.from(data.files ?? [])) {
    if (isImageFile(f)) out.push(f)
  }

  // 少数浏览器 files 为空，只把图片放在 items 里
  if (out.length === 0) {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }

  return out
}

function isImageFile(f: File): boolean {
  return typeof f.type === 'string' && f.type.startsWith('image/')
}
