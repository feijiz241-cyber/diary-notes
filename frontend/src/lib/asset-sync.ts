import { deleteFile, deleteImage } from './db'
import { collectAssetIds } from './editor-serialize'

/** 某份文档当前引用的素材 id 快照。 */
export interface AssetSnapshot {
  files: Set<string>
  images: Set<string>
}

export function snapshotAssets(doc: unknown): AssetSnapshot {
  const { fileIds, imageIds } = collectAssetIds(doc)
  return { files: new Set(fileIds), images: new Set(imageIds) }
}

/** 对比两份快照，找出「被移出文档」的素材 id。 */
export function diffRemovedAssets(
  prev: AssetSnapshot,
  next: AssetSnapshot,
): { files: string[]; images: string[] } {
  return {
    files: [...prev.files].filter((id) => !next.files.has(id)),
    images: [...prev.images].filter((id) => !next.images.has(id)),
  }
}

/**
 * 把被移出文档的素材从后端删掉。
 *
 * 采用「增量对比」而非在按钮里直接删，是为了覆盖**所有**移除路径：
 * 点 × 移除、键盘 Backspace/Delete、剪切、整段替换等。
 * 失败不抛出（文件会退化成孤儿，可事后用「清理未引用素材」回收）。
 */
export async function purgeRemovedAssets(prev: AssetSnapshot, next: AssetSnapshot): Promise<void> {
  const { files, images } = diffRemovedAssets(prev, next)
  await Promise.allSettled([...files.map((id) => deleteFile(id)), ...images.map((id) => deleteImage(id))])
}
