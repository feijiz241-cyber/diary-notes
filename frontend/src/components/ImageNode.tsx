import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { getImage } from '@/lib/db'

type ImageState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'gone' }
  | { status: 'failed' }

const BOX = 'rounded-none border-2 border-[var(--mc-outline)]'

/**
 * 图片节点视图。
 *
 * 关键：这里只按自己的 imageId 取一张图（getImage，带内存缓存），
 * 不再「先拉当天图片清单、再把当天所有图片下载一遍」——
 * 以前一屏 N 张图会打出 N×(1+N) 个请求、N² 次全尺寸下载。
 */
function ImageView({ node }: { node: any }) {
  const imageId = node.attrs.imageId as string | null
  const [state, setState] = useState<ImageState>({ status: 'loading' })

  useEffect(() => {
    if (!imageId) {
      setState({ status: 'gone' })
      return
    }
    let active = true
    let objUrl: string | null = null

    setState({ status: 'loading' })
    getImage(imageId)
      .then((got) => {
        if (!active) return
        if (!got) {
          setState({ status: 'gone' })
          return
        }
        objUrl = URL.createObjectURL(got.blob)
        setState({ status: 'ready', url: objUrl })
      })
      .catch(() => {
        if (active) setState({ status: 'failed' })
      })

    return () => {
      active = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [imageId])

  return (
    <NodeViewWrapper className="my-3">
      {state.status === 'ready' ? (
        <img
          src={state.url}
          alt={node.attrs.alt ?? ''}
          decoding="async"
          className="max-w-full rounded-none border-2"
        />
      ) : state.status === 'loading' ? (
        <div className="h-32 w-full animate-pulse rounded-none border-2 bg-muted" />
      ) : (
        <div className={`${BOX} bg-muted/40 p-2 text-xs text-muted-foreground`}>
          {state.status === 'gone'
            ? '图片没有找到（可能已被清理）'
            : '图片加载失败：确认那个黑色命令行窗口还开着'}
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const ImageNode = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: { default: null },
      entryId: { default: null },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
}).configure({ inline: false })
