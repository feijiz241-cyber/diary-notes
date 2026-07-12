import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import { searchEntries, type SearchResult } from '@/lib/search'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { formatHuman } from '@/lib/utils'

export function SearchPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)

  const run = async (val: string) => {
    setQ(val)
    if (!val.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    const r = await searchEntries(val)
    setResults(r)
    setSearched(true)
  }

  return (
    <div className="space-y-4">
      <h1 className="mc-sign mb-1 inline-block px-3 py-1.5 text-2xl font-extrabold">搜索</h1>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => run(e.target.value)}
          placeholder="搜索标题或正文…"
          className="pl-9"
        />
      </div>

      {searched && results.length === 0 && (
        <p className="text-muted-foreground">没有找到匹配的日记。</p>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <Card
            key={r.id}
            className="cursor-pointer transition-[filter] hover:brightness-105"
            onClick={() => navigate('/day/' + r.date)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.title || '(无标题)'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatHuman(r.date)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.snippet}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
