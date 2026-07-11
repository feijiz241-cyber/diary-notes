import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { getImagesByEntry } from '@/lib/db'

function ImageView({ node }: { node: any }) {
  const imageId = node.attrs.imageId as string
  const entryId = node.attrs.entryId as string
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objUrl: string | null = null
    getImagesByEntry(entryId)
      .then((recs) => {
        const rec = recs.find((r) => r.id === imageId)
        if (rec && active) {
          objUrl = URL.createObjectURL(rec.blob)
          setUrl(objUrl)
        }
      })
      .catch(() => {})
    return () => {
      active = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [imageId, entryId])

  return (
    <NodeViewWrapper className="my-3">
      {url ? (
        <img src={url} alt={node.attrs.alt ?? ''} className="max-w-full rounded-lg" />
      ) : (
        <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
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
