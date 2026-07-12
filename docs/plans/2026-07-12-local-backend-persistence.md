# 实现计划：本地后端文件持久化（2026-07-12）

> 设计文档：`docs/plans/2026-07-12-local-backend-persistence-design.md`（已批准）
> 流程：TDD —— 每个 task 先写失败测试，再实现，通过即 commit。

## T1 后端存储核心（store.mjs）+ 测试

**目标**：纯逻辑的日记读写层，落盘到 `data/`，带写锁防并发损坏。

- 新增 `server/store.mjs`（导出 `Store` 类，构造参数 `dataDir`）
  - `readAll(): Promise<Entry[]>`
  - `upsertByDate(entry): Promise<Entry>`（按 date 覆盖）
  - `getByDate(date): Promise<Entry|undefined>`
  - `deleteById(id): Promise<void>`
  - 图片：`putImage(imageId, {entryId,ext,base64})` / `getImage(id)` / `deleteImage(id)`
  - 内部 `diary.json` 串行写队列（promise chain 防并发）
- 测试 `server/store.test.mjs`（vitest, node 环境，临时 `os.tmpdir()` 目录）：
  - upsert 同日覆盖、readAll/getByDate/deleteById
  - 图片写读删、base64 往返
  - 并发 upsert 不丢数据（10 次并发后读数正确）

## T2 后端 HTTP 服务（index.mjs）+ 测试

**目标**：零依赖原生 http server，暴露 REST API，静态托管可选。

- 新增 `server/index.mjs`：`createServer(store)` 解析 method+url，路由到 store
  - 路由表见设计文档 API 表
  - `GET /api/images/:id` 按 ext 设 Content-Type 返回二进制
  - 监听 `PORT || 5189`
- 测试 `server/index.test.mjs`：用 `node:http` 起真实 server + `fetch` 验证各路由
  - entries CRUD、images 上传下载、export/import

## T3 vite 代理 + bat 双进程

**目标**：前端无感调 `/api`，bat 同时拉起前后端。

- `vite.config.ts`：`server.proxy['/api'] = 'http://localhost:5189'`
- `start-diary.bat`：先 `start node server/index.mjs`，再 `start npm run dev -- --port 5188`
- 验证：手动 `node server/index.mjs` + `npm run dev` 后前端请求 `/api` 通

## T4 db.ts fetch 化 + 测试改写

**目标**：前端所有数据函数走 `/api`，移除 Dexie/IndexedDB。

- 改 `src/lib/db.ts`：保留 `Entry`/`ImageRecord` 接口与函数签名，实现改为 `fetch('/api/...')`
  - `putEntry`→PUT /api/entries；`getByDate`→GET /api/entries/:date；`getMonth`/`getYear`/`getAll`→GET /api/entries?...
  - `putImage`→POST /api/images（base64）；`getImagesByEntry`→GET /api/images?entryId= 解析 base64→Blob；`deleteImagesByEntry`→DELETE
  - `deleteEntry`→DELETE /api/entries/:id；`clearAll`→DELETE 全量（或保留）
- 改 `src/lib/db.test.ts`：`vi.mock` 全局 `fetch`（或 `vi.stubGlobal('fetch', ...)`），覆盖等价断言

## T5 图片落盘联调

**目标**：编辑器图片上传/预览走后端文件。

- `Editor.tsx` 图片节点：上传调 `putImage(base64)`；预览 `getImagesByEntry` 返回 Blob URL
- 验证：上传图片 → 刷新 → 清浏览器缓存 → 重开图片仍在

## T6 导出/导入走后端 + 收尾

**目标**：设置页导出导入对接后端文件。

- `SettingsPage.tsx`：导出 `GET /api/export`（blob 下载）；导入 `POST /api/import`
- 运行 `npm run build` + `npx vitest run` 全绿
- 手动验证：写日记 → 刷新 → 清缓存 → 重开可见；换浏览器打开 `localhost:5188` 可见

## 验证门禁

- 每个 T 完成：`npx vitest run` 相关测试绿
- 全部完成：`npm run build` 通过
- 最终手动走查「清缓存不丢 / 换浏览器可见」
