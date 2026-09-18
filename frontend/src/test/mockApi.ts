export interface MockApi {
  fetch: typeof fetch
  reset: () => void
}

/**
 * 内存版后端：模拟 /api 路由，供前端数据层测试用（无需真实 server）。
 */
export function createMockApi(): MockApi {
  const state = {
    entries: [] as Array<Record<string, unknown>>,
    notes: [] as Array<Record<string, unknown>>,
    images: {} as Record<string, { entryId: string; ext: string; type: string; base64: string }>,
    files: {} as Record<
      string,
      { entryId: string; ext: string; name: string; type: string; size: number; base64: string }
    >,
  }

  const binToBuffer = (b64: string): ArrayBuffer => {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init.method || 'GET').toUpperCase()
    const u = new URL(url, 'http://localhost')
    const path = u.pathname
    const q = u.searchParams
    const body = init.body ? JSON.parse(init.body as string) : undefined

    const ok = (data: unknown, status = 200): Response =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
        text: async () => JSON.stringify(data),
        arrayBuffer: async () => binToBuffer((data as { __bin?: string }).__bin || ''),
      }) as unknown as Response

    // ---------- entries ----------
    if (path === '/api/entries' && method === 'GET') {
      let all = state.entries
      const year = q.get('year')
      const month = q.get('month')
      if (year) all = all.filter((e) => (e.date as string).startsWith(`${year}-`))
      if (month) all = all.filter((e) => (e.date as string).startsWith(month))
      return ok(all)
    }
    if (path === '/api/entries' && method === 'PUT') {
      const e = body as Record<string, unknown>
      const now = Date.now()
      const idx = state.entries.findIndex((x) => x.date === e.date)
      if (idx >= 0) {
        state.entries[idx] = { ...state.entries[idx], ...e, updatedAt: now }
        return ok(state.entries[idx])
      }
      const created = {
        id: (e.id as string) || 'gen-' + Math.random().toString(36).slice(2),
        createdAt: now,
        updatedAt: now,
        ...e,
      }
      state.entries.push(created)
      return ok(created)
    }
    if (path === '/api/entries' && method === 'DELETE') {
      // 只清日记条目，素材不动（与后端 clearEntries 一致）
      state.entries = []
      return ok({ ok: true })
    }
    if (path === '/api/data' && method === 'DELETE') {
      state.entries = []
      state.notes = []
      state.images = {}
      state.files = {}
      return ok({ ok: true })
    }
    const idMatch = path.match(/^\/api\/entries\/id\/([^/]+)$/)
    if (idMatch && method === 'GET') {
      const id = decodeURIComponent(idMatch[1])
      const e = state.entries.find((x) => x.id === id)
      return e ? ok(e) : ok({ error: 'nf' }, 404)
    }
    const dateMatch = path.match(/^\/api\/entries\/([^/]+)$/)
    if (dateMatch && method === 'GET') {
      const date = decodeURIComponent(dateMatch[1])
      const e = state.entries.find((x) => x.date === date)
      return e ? ok(e) : ok({ error: 'nf' }, 404)
    }
    if (dateMatch && method === 'DELETE') {
      const id = decodeURIComponent(dateMatch[1])
      const target = state.entries.find((x) => x.id === id)
      if (target) {
        for (const [imgId, v] of Object.entries(state.images)) {
          if (v.entryId === (target.date as string)) delete state.images[imgId]
        }
        for (const [fid, v] of Object.entries(state.files)) {
          if (v.entryId === (target.date as string)) delete state.files[fid]
        }
      }
      state.entries = state.entries.filter((x) => x.id !== id)
      return ok({ ok: true })
    }

    // ---------- notes ----------
    if (path === '/api/notes' && method === 'GET') {
      const date = q.get('date')
      const list = date ? state.notes.filter((n) => n.date === date) : state.notes
      return ok(list)
    }
    if (path === '/api/notes' && method === 'PUT') {
      const n = body as Record<string, unknown>
      const now = Date.now()
      if (n.id) {
        const idx = state.notes.findIndex((x) => x.id === n.id)
        if (idx >= 0) {
          state.notes[idx] = { ...state.notes[idx], ...n, updatedAt: now }
          return ok(state.notes[idx])
        }
      }
      const created = {
        title: '',
        content: { type: 'doc', content: [] },
        ...n,
        id: (n.id as string) || 'note-' + Math.random().toString(36).slice(2),
        createdAt: now,
        updatedAt: now,
      }
      state.notes.push(created)
      return ok(created)
    }
    if (path === '/api/notes' && method === 'DELETE') {
      state.notes = []
      return ok({ ok: true })
    }
    const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch && method === 'DELETE') {
      const id = decodeURIComponent(noteMatch[1])
      state.notes = state.notes.filter((x) => x.id !== id)
      return ok({ ok: true })
    }

    // ---------- images ----------
    if (path === '/api/images' && method === 'GET') {
      const entryId = q.get('entryId')
      const list = Object.entries(state.images)
        .filter(([, v]) => (entryId ? v.entryId === entryId : true))
        .map(([id, v]) => ({ id, ...v }))
      return ok(list)
    }
    if (path === '/api/images' && method === 'POST') {
      state.images[body.imageId] = {
        entryId: body.entryId,
        ext: body.ext,
        type: body.type || `image/${body.ext}`,
        base64: body.base64,
      }
      return ok({ ok: true })
    }
    const imgMatch = path.match(/^\/api\/images\/([^/]+)$/)
    if (imgMatch && method === 'GET') {
      const id = decodeURIComponent(imgMatch[1])
      const img = state.images[id]
      if (!img) return ok({ error: 'nf' }, 404)
      return {
        ok: true,
        status: 200,
        json: async () => img,
        text: async () => JSON.stringify(img),
        arrayBuffer: async () => binToBuffer(img.base64),
      } as unknown as Response
    }
    if (imgMatch && method === 'DELETE') {
      delete state.images[imgMatch[1]]
      return ok({ ok: true })
    }

    // ---------- files ----------
    if (path === '/api/files' && method === 'GET') {
      const entryId = q.get('entryId')
      const list = Object.entries(state.files)
        .filter(([, v]) => (entryId ? v.entryId === entryId : true))
        .map(([id, v]) => ({ id, entryId: v.entryId, ext: v.ext, name: v.name, type: v.type, size: v.size }))
      return ok(list)
    }
    if (path === '/api/files' && method === 'POST') {
      state.files[body.fileId] = {
        entryId: body.entryId,
        ext: body.ext,
        name: body.name,
        type: body.type || 'application/octet-stream',
        size: typeof body.size === 'number' ? body.size : 0,
        base64: body.base64,
      }
      return ok({ ok: true })
    }
    if (path === '/api/files' && method === 'DELETE') {
      state.files = {}
      return ok({ ok: true })
    }
    const fileMatch = path.match(/^\/api\/files\/([^/]+)$/)
    if (fileMatch && method === 'GET') {
      const id = decodeURIComponent(fileMatch[1])
      const f = state.files[id]
      if (!f) return ok({ error: 'nf' }, 404)
      return {
        ok: true,
        status: 200,
        json: async () => f,
        text: async () => JSON.stringify(f),
        arrayBuffer: async () => binToBuffer(f.base64),
      } as unknown as Response
    }
    if (fileMatch && method === 'DELETE') {
      delete state.files[fileMatch[1]]
      return ok({ ok: true })
    }

    return ok({ error: 'not found' }, 404)
  }

  return {
    fetch: fetchImpl as unknown as typeof fetch,
    reset: () => {
      state.entries = []
      state.notes = []
      state.images = {}
      state.files = {}
    },
  }
}
