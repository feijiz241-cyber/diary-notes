import { deleteFile, deleteImage, getAll, getAllNotes, listAllFiles, listAllImages } from './db'
import { collectAssetIds } from './editor-serialize'

export interface CleanupResult {
  removedFiles: number
  removedImages: number
  keptFiles: number
  keptImages: number
}

/**
 * 清理「孤儿素材」：删除没有被任何日记 / 笔记内容引用的图片与附件。
 *
 * 附件节点被移除时不会立刻删文件（否则撤销后就成死链），所以长期使用后会留下
 * 无引用文件。此函数扫描全部内容，只删确实无人引用的。
 */
export async function cleanupOrphanAssets(): Promise<CleanupResult> {
  const [entries, notes, files, images] = await Promise.all([
    getAll(),
    getAllNotes(),
    listAllFiles(),
    listAllImages(),
  ])

  const usedFiles = new Set<string>()
  const usedImages = new Set<string>()
  for (const doc of [...entries, ...notes].map((x) => x.content)) {
    const { imageIds, fileIds } = collectAssetIds(doc)
    imageIds.forEach((id) => usedImages.add(id))
    fileIds.forEach((id) => usedFiles.add(id))
  }

  let removedFiles = 0
  for (const f of files) {
    if (!usedFiles.has(f.id)) {
      await deleteFile(f.id)
      removedFiles++
    }
  }

  let removedImages = 0
  for (const img of images) {
    if (!usedImages.has(img.id)) {
      await deleteImage(img.id)
      removedImages++
    }
  }

  return {
    removedFiles,
    removedImages,
    keptFiles: files.length - removedFiles,
    keptImages: images.length - removedImages,
  }
}
