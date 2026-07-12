import { describe, it, expect } from 'vitest'
import { isEmptyDoc, docToText, serialize, parse } from './editor-serialize'

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ],
    },
  ],
}

describe('editor serialize', () => {
  it('docToText joins text nodes', () => {
    expect(docToText(doc)).toBe('Hello World')
  })

  it('isEmptyDoc true for empty paragraphs', () => {
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true)
  })

  it('isEmptyDoc false for real content', () => {
    expect(isEmptyDoc(doc)).toBe(false)
  })

  it('serialize/parse round-trips', () => {
    const s = serialize(doc)
    expect(parse(s)).toEqual(doc)
  })
})
