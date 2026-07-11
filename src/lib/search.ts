import { getAll, type Entry } from './db'
import { docToText } from './editor-serialize'

export interface SearchResult extends Entry {
  snippet: string
}

function makeSnippet(text: string, query: string, radius = 24): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/** 对标题 + 正文做不区分大小写的全文检索，按日期倒序返回。 */
export async function searchEntries(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all = await getAll()
  const results: SearchResult[] = []
  for (const e of all) {
    const title = (e.title || '').toLowerCase()
    const body = docToText(e.content).toLowerCase()
    if (title.includes(q) || body.includes(q)) {
      results.push({ ...e, snippet: makeSnippet(docToText(e.content), q) })
    }
  }
  results.sort((a, b) => (a.date < b.date ? 1 : -1))
  return results
}
