import { getAll, getAllNotes } from './db'
import { docToText } from './editor-serialize'

export interface SearchResult {
  kind: 'diary' | 'note'
  id: string
  date: string
  title: string
  content: unknown
  snippet: string
}

interface Searchable {
  id: string
  date: string
  title: string
  content: unknown
}

function makeSnippet(text: string, query: string, radius = 24): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function match(kind: SearchResult['kind'], item: Searchable, q: string): SearchResult | null {
  const title = (item.title || '').toLowerCase()
  const body = docToText(item.content).toLowerCase()
  if (!title.includes(q) && !body.includes(q)) return null
  return {
    kind,
    id: item.id,
    date: item.date,
    title: item.title,
    content: item.content,
    snippet: makeSnippet(docToText(item.content), q),
  }
}

const byDateDesc = (a: SearchResult, b: SearchResult) => (a.date < b.date ? 1 : -1)

/** 只搜日记（森林页用它来高亮树上命中的日期）。 */
export async function searchEntries(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all = await getAll()
  return all
    .map((e) => match('diary', e, q))
    .filter((r): r is SearchResult => r !== null)
    .sort(byDateDesc)
}

/** 搜日记 + 笔记（搜索页用）。 */
export async function searchAll(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const [entries, notes] = await Promise.all([getAll(), getAllNotes()])
  return [...entries.map((e) => match('diary', e, q)), ...notes.map((n) => match('note', n, q))]
    .filter((r): r is SearchResult => r !== null)
    .sort(byDateDesc)
}
