import { describe, it, expect } from 'vitest'
import { pickImageFiles } from './clipboard-images'

/** 构造一个只带 files / items 的 DataTransfer 替身（jsdom 没有完整 DataTransfer）。 */
function fakeData(init: { files?: File[]; items?: Array<{ kind: string; type: string; getAsFile: () => File | null }> }) {
  return { files: init.files ?? [], items: init.items ?? [] } as unknown as DataTransfer
}

const png = () => new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })

describe('pickImageFiles', () => {
  it('从 files 里挑出图片，忽略非图片', () => {
    const img = png()
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    expect(pickImageFiles(fakeData({ files: [txt, img] }))).toEqual([img])
  })

  it('files 为空时回落到 items', () => {
    const img = png()
    const files = pickImageFiles(
      fakeData({
        files: [],
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => img },
        ],
      }),
    )
    expect(files).toEqual([img])
  })

  it('没有数据 / 没有图片时返回空数组', () => {
    expect(pickImageFiles(null)).toEqual([])
    expect(pickImageFiles(undefined)).toEqual([])
    expect(pickImageFiles(fakeData({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }))).toEqual([])
  })
})
