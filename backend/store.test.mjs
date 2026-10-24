// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from './store.mjs'

async function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-store-test-'))
  const s = new Store(dir)
  await s.init()
  return s
}

describe('Store (file persistence)', () => {
  it('upsertByDate creates then overwrites same date (one entry per day)', async () => {
    const s = await makeStore()
    const a = await s.upsertByDate({ date: '2026-07-12', title: 't1', content: {}, mood: null, tags: [] })
    expect(a.id).toBeTruthy()
    const b = await s.upsertByDate({ date: '2026-07-12', title: 't2', content: {}, mood: 'happy', tags: ['x'] })
    expect(b.id).toBe(a.id)
    const all = await s.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('t2')
  })

  it('getByDate returns the entry or undefined', async () => {
    const s = await makeStore()
    await s.upsertByDate({ date: '2026-07-12', title: 'hi', content: {}, mood: null, tags: [] })
    const e = await s.getByDate('2026-07-12')
    expect(e?.title).toBe('hi')
    expect(await s.getByDate('2026-07-13')).toBeUndefined()
  })

  it('deleteById 只删条目，不连带删除同日图片（R3）', async () => {
    const s = await makeStore()
    const e = await s.upsertByDate({ date: '2026-07-12', title: 'x', content: {}, mood: null, tags: [] })
    await s.putImage('img1', { entryId: '2026-07-12', ext: 'png', base64: 'aGVsbG8=' })
    await s.deleteById(e.id)
    expect(await s.readAll()).toHaveLength(0)
    // 素材按日期归属、与笔记共享同一池子：删日记不能顺手删掉别人还在引用的图
    const img = await s.getImage('img1')
    expect(img).not.toBeNull()
    expect(img.buffer.toString()).toBe('hello')
    expect((await s.listImages('2026-07-12')).map((i) => i.id)).toContain('img1')
  })

  it('deleteById 对不存在的 id 是幂等的', async () => {
    const s = await makeStore()
    await s.upsertByDate({ date: '2026-07-12', title: 'x', content: {}, mood: null, tags: [] })
    await expect(s.deleteById('no-such-id')).resolves.toBeUndefined()
    expect(await s.readAll()).toHaveLength(1)
  })

  it('image base64 roundtrip and listImages by entryId', async () => {
    const s = await makeStore()
    const original = 'hello-binary-数据'
    const b64 = Buffer.from(original).toString('base64')
    await s.putImage('img2', { entryId: '2026-07-12', ext: 'png', base64: b64 })
    const got = await s.getImage('img2')
    expect(got.buffer.toString()).toBe(original)
    expect(got.ext).toBe('png')
    expect(got.type).toBe('image/png')
    const list = await s.listImages('2026-07-12')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('img2')
  })

  it('原子写入：写入完成后不残留 .tmp 文件', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-store-atomic-'))
    const s = new Store(dir)
    await s.init()
    await s.upsertByDate({ date: '2026-07-12', title: 'x', content: {}, mood: null, tags: [] })
    await s.putImage('i1', { entryId: '2026-07-12', ext: 'png', base64: 'aGk=' })
    await s.putFile('f1', { entryId: '2026-07-12', ext: 'txt', name: 'a.txt', base64: 'aGk=' })
    const leftovers = []
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name)
        if (fs.statSync(p).isDirectory()) walk(p)
        else if (name.endsWith('.tmp')) leftovers.push(p)
      }
    }
    walk(dir)
    expect(leftovers).toEqual([])
  })

  it('原子写入：并发读永远不会读到“瞬间变空”', async () => {
    const s = await makeStore()
    const padding = 'x'.repeat(2000)
    for (let i = 1; i <= 50; i++) {
      await s.upsertByDate({
        date: `2026-08-${String(i).padStart(2, '0')}`,
        title: 'base' + i,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: padding }] }] },
        mood: null,
        tags: [],
      })
    }

    let minSeen = Number.POSITIVE_INFINITY
    const reader = (async () => {
      for (let k = 0; k < 150; k++) {
        // 关键：每轮都先失效 entries 缓存。
        // 否则加了读缓存之后这轮读全走内存，这条用例就不再检验磁盘原子写了（变成空转）。
        s.invalidateCache('entries')
        const all = await s.readAll()
        minSeen = Math.min(minSeen, all.length)
        await new Promise((r) => setImmediate(r))
      }
    })()
    const writer = (async () => {
      for (let k = 1; k <= 40; k++) {
        await s.upsertByDate({
          date: `2026-09-${String((k % 28) + 1).padStart(2, '0')}`,
          title: 'w' + k,
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: padding }] }] },
          mood: null,
          tags: [],
        })
      }
    })()
    await Promise.all([reader, writer])

    // 基线 50 条只增不减；一旦读到半截文件会回退成 []，minSeen 就会掉到 0
    expect(minSeen).toBe(50)
  })

  it('concurrent upserts do not lose data (write lock)', async () => {
    const s = await makeStore()
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        s.upsertByDate({
          date: `2026-07-${String(i + 1).padStart(2, '0')}`,
          title: 't' + i,
          content: {},
          mood: null,
          tags: [],
        }),
      ),
    )
    const all = await s.readAll()
    expect(all).toHaveLength(10)
  })
})

describe('Store 读缓存一致性', () => {
  async function makeStoreWithDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-store-cache-'))
    const s = new Store(dir)
    await s.init()
    return { s, dir }
  }

  /** 直接读盘，绕过缓存，用来验证磁盘真值。 */
  const readDisk = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return fallback
    }
  }

  it('命中缓存：返回给调用方的是副本，调用方改它不会污染下一次读', async () => {
    const { s, dir } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-01', title: '原文', content: {}, mood: null, tags: ['a'] })

    const first = await s.readAll()
    // 模拟调用方原地乱改（upsertByDate 内部就是这样 `all[idx] = ...` 的）
    first[0].title = '被调用方改掉了'
    first[0].tags.push('污染')
    first.push({ date: '2026-05-02', title: '凭空多出来的一条' })
    first.length = 1

    const second = await s.readAll()
    expect(second).toHaveLength(1)
    expect(second[0].title).toBe('原文')
    expect(second[0].tags).toEqual(['a'])
    // 磁盘上也没被影响
    expect(readDisk(path.join(dir, 'diary.json'), [])[0].title).toBe('原文')
  })

  it('嵌套深层对象也不会因共享引用被改脏（深拷贝而非浅拷贝）', async () => {
    const { s } = await makeStoreWithDir()
    await s.upsertByDate({
      date: '2026-05-01',
      title: 't',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原文' }] }] },
      mood: null,
      tags: [],
    })

    const a = await s.readAll()
    a[0].content.content[0].content[0].text = '深层被改了'
    const b = await s.readAll()
    expect(b[0].content.content[0].content[0].text).toBe('原文')
  })

  it('写后立刻读：upsertByDate → getByDate / readAll 都拿到新值（缓存写后即更新）', async () => {
    const { s } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-03', title: '第一版', content: {}, mood: null, tags: [] })
    expect((await s.getByDate('2026-05-03')).title).toBe('第一版')

    await s.upsertByDate({ date: '2026-05-03', title: '第二版', content: {}, mood: 'happy', tags: [] })
    const got = await s.getByDate('2026-05-03')
    expect(got.title).toBe('第二版')
    expect(got.mood).toBe('happy')

    const all = await s.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('第二版')
  })

  it('putImage 后 listImages 立刻可见，deleteImage 后立刻消失', async () => {
    const { s } = await makeStoreWithDir()
    // 先读一次把缓存喂热，确保走的是缓存路径而不是每次都读盘
    expect(await s.listImages('2026-05-04')).toHaveLength(0)

    await s.putImage('i1', { entryId: '2026-05-04', ext: 'png', base64: 'aGk=' })
    expect((await s.listImages('2026-05-04')).map((i) => i.id)).toEqual(['i1'])
    expect((await s.listAllImages()).map((i) => i.id)).toEqual(['i1'])

    await s.deleteImage('i1')
    expect(await s.listImages('2026-05-04')).toHaveLength(0)
    expect(await s.listAllImages()).toHaveLength(0)
  })

  it('putFile 后 listFiles 立刻可见，deleteFile 后立刻消失', async () => {
    const { s } = await makeStoreWithDir()
    expect(await s.listFiles('2026-05-05')).toHaveLength(0)

    await s.putFile('f1', { entryId: '2026-05-05', ext: 'txt', name: 'a.txt', base64: 'aGk=' })
    expect((await s.listFiles('2026-05-05')).map((f) => f.id)).toEqual(['f1'])
    expect((await s.listAllFiles()).map((f) => f.id)).toEqual(['f1'])

    await s.deleteFile('f1')
    expect(await s.listFiles('2026-05-05')).toHaveLength(0)
    expect(await s.listAllFiles()).toHaveLength(0)
  })

  it('clearEntries / clearNotes / clearAllFiles / clearAllData 后缓存同步正确', async () => {
    const { s } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-06', title: 'd', content: {}, mood: null, tags: [] })
    await s.upsertNote({ date: '2026-05-06', title: 'n', content: {} })
    await s.putFile('f1', { entryId: '2026-05-06', ext: 'txt', name: 'a.txt', base64: 'aGk=' })
    await s.putImage('i1', { entryId: '2026-05-06', ext: 'png', base64: 'aGk=' })

    // 全部喂热一遍缓存
    expect(await s.readAll()).toHaveLength(1)
    expect(await s.readNotes()).toHaveLength(1)
    expect(await s.listAllFiles()).toHaveLength(1)
    expect(await s.listAllImages()).toHaveLength(1)

    await s.clearEntries()
    expect(await s.readAll()).toHaveLength(0)
    expect(await s.readNotes()).toHaveLength(1) // 笔记与素材不受影响

    await s.clearNotes()
    expect(await s.readNotes()).toHaveLength(0)

    await s.clearAllFiles()
    expect(await s.listAllFiles()).toHaveLength(0)
    expect(await s.listAllImages()).toHaveLength(1)

    await s.clearAllData()
    expect(await s.readAll()).toHaveLength(0)
    expect(await s.readNotes()).toHaveLength(0)
    expect(await s.listAllFiles()).toHaveLength(0)
    expect(await s.listAllImages()).toHaveLength(0)
  })

  it('invalidateCache() 后能读到磁盘上的外部改动（模拟别的进程改文件）', async () => {
    const { s, dir } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-07', title: '进程内写的', content: {}, mood: null, tags: [] })
    // 喂热缓存
    expect((await s.readAll())[0].title).toBe('进程内写的')

    // 模拟另一个进程直接改盘
    const external = [{ id: 'ext-1', date: '2026-05-08', title: '外部进程写的', content: {}, mood: null, tags: [] }]
    fs.writeFileSync(path.join(dir, 'diary.json'), JSON.stringify(external, null, 2))

    // 未失效前读到的仍是缓存（这是缓存的预期行为，不是 bug）
    expect((await s.readAll())[0].title).toBe('进程内写的')

    s.invalidateCache()
    const after = await s.readAll()
    expect(after).toHaveLength(1)
    expect(after[0].title).toBe('外部进程写的')
  })

  it('invalidateCache 支持按份失效，不会误伤其他缓存', async () => {
    const { s, dir } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-09', title: '原', content: {}, mood: null, tags: [] })
    await s.upsertNote({ date: '2026-05-09', title: '笔记原', content: {} })
    await s.readAll()
    await s.readNotes()

    fs.writeFileSync(
      path.join(dir, 'diary.json'),
      JSON.stringify([{ id: 'x', date: '2026-05-10', title: '外部改的', content: {}, mood: null, tags: [] }], null, 2),
    )

    s.invalidateCache('entries')
    expect((await s.readAll())[0].title).toBe('外部改的')
    // 笔记缓存没被动过，即使盘上被改也还返回缓存里的旧值 —— 证明失效是分文件的
    fs.writeFileSync(path.join(dir, 'notes.json'), JSON.stringify([], null, 2))
    expect(await s.readNotes()).toHaveLength(1)
    s.invalidateCache('notes')
    expect(await s.readNotes()).toHaveLength(0)
  })

  it('写失败时该文件缓存被失效，不会留下与磁盘不一致的脏缓存', async () => {
    const { s, dir } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-05-11', title: '磁盘上的值', content: {}, mood: null, tags: [] })
    expect(await s.readAll()).toHaveLength(1) // 喂热

    // 让 rename 阶段炸掉，模拟写盘失败
    const originalRename = s._renameOver
    s._renameOver = async () => {
      throw new Error('boom')
    }
    await expect(
      s.upsertByDate({ date: '2026-05-11', title: '写不进去的值', content: {}, mood: null, tags: [] }),
    ).rejects.toThrow('boom')
    s._renameOver = originalRename

    // 缓存已失效 → 重新读盘，拿到的是磁盘真值而不是内存里那个「写成功」的假象
    const all = await s.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('磁盘上的值')
    expect(readDisk(path.join(dir, 'diary.json'), [])[0].title).toBe('磁盘上的值')
  })

  it('init() 对已存在的文件不预读盘，缓存保持空（不做四次无用功）', async () => {
    const { dir } = await makeStoreWithDir()
    const fresh = new Store(dir)
    await fresh.init()
    expect(fresh._cache.size).toBe(0)
    // 但读起来仍然正确
    expect(await fresh.readAll()).toEqual([])
    expect(await fresh.readNotes()).toEqual([])
    expect(await fresh.listAllImages()).toEqual([])
    expect(await fresh.listAllFiles()).toEqual([])
  })

  it('文件存在但读不动时抛出，不能静默回退成空数组', async () => {
    const { s, dir } = await makeStoreWithDir()
    await s.upsertByDate({ date: '2026-07-12', title: '真的有一条', content: {}, mood: null, tags: [] })
    s.invalidateCache('entries')

    // 模拟 Windows 上 rename 替换窗口期的占用错误：文件还在，但这一下读不动。
    // 注意 store.mjs 用的是 `import { promises as fs } from 'node:fs'`，
    // 所以要打桩 `fs.promises.readFile`，不是默认导出的 `fs.readFile`。
    const realRead = fs.promises.readFile
    let calls = 0
    fs.promises.readFile = async () => {
      calls++
      const err = new Error('EBUSY: resource busy or locked')
      err.code = 'EBUSY'
      throw err
    }
    try {
      // 必须抛错，而不是返回 []（返回 [] 上层会当成「日记全没了」）
      await expect(s.readAll()).rejects.toThrow(/EBUSY/)
      expect(calls).toBe(12) // 12 次退避重试后才放弃
    } finally {
      fs.promises.readFile = realRead
    }

    // 恢复后能正常读到真值，且缓存里没有残留的空数组
    expect(await s.readAll()).toHaveLength(1)
    expect(fs.existsSync(path.join(dir, 'diary.json'))).toBe(true)
  })

  it('文件不存在时仍按空数组处理（ENOENT 与占用错误必须区分）', async () => {
    const { s, dir } = await makeStoreWithDir()
    fs.rmSync(path.join(dir, 'diary.json'))
    s.invalidateCache('entries')
    expect(await s.readAll()).toEqual([])
  })
})
