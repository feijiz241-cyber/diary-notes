# 本地后端文件持久化设计（2026-07-12）

## 背景与目标

日记当前全部存在**浏览器 IndexedDB**（库名 `diary-web`）。这导致：
- 清浏览器缓存 / 站点数据 → 日记丢失
- 换浏览器（Chrome↔Edge↔Firefox）→ 看不到
- 无痕窗口 → 关掉即清
- 重装浏览器 → 数据消失

**目标**：把日记与图片的存储从浏览器迁移到**本地硬盘文件**，实现永久保存、不受浏览器任何操作影响。用户仅本机使用，不部署到公网。

## 架构总览

```
浏览器 (localhost:5188)
  └─ 前端 React (db.ts 改为 fetch('/api/...'))
       │ 同源 /api 请求
       ▼
Vite dev server (5188)  ──proxy '/api'──►  本地后端 Node (5189, 零依赖)
                                          └─ 读写  D:\日记网页\data\
```

- 新增**极简 Node 后端**（原生 http，零依赖），监听 `5189`，提供 REST API
- Vite dev server（`5188`）配置 `/api` 代理到 `5189`，前端仍调同源 `/api`，用户无感
- 前端 `db.ts` 改为通过 `fetch` 调后端，移除 Dexie / IndexedDB 依赖
- `start-diary.bat` 同时拉起 vite + node 后端

## 数据存储布局

`D:\日记网页\data\`
- `diary.json`：`Entry[]`（TipTap JSON 作为对象存储；图片不内嵌，只存引用）
- `images/<imageId>.<ext>`：图片文件（原 Blob 落盘）
- `images/manifest.json`：`{ [imageId]: { entryId, ext, type } }` 索引

## 后端 API（原生 http，零依赖）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/entries?year=2026&month=07` | 列表，支持按年/月过滤（兼容 `getYear`/`getMonth`） |
| GET  | `/api/entries/:date` | 单篇（兼容 `getByDate`） |
| PUT  | `/api/entries` | upsert，按 `date` 一天一篇，存在则覆盖更新 |
| DELETE | `/api/entries/:id` | 删除及关联图片 |
| GET  | `/api/images?entryId=` | 图片清单 |
| POST | `/api/images` | `{ entryId, imageId, base64, ext }` → 解码写文件 |
| GET  | `/api/images/:id` | 返回图片二进制（按 ext 设 `Content-Type`） |
| DELETE | `/api/images/:id` | 删除图片 |
| GET  | `/api/export` | 全量 JSON 下载（兼容现有导出） |
| POST | `/api/import` | 导入全量 JSON（兼容现有导入） |

## 前端改动

- `src/lib/db.ts`：所有函数改为 `fetch('/api/...')`；图片用 base64 JSON 上传、`blob` 下载
- `src/lib/db.test.ts`：改为 mock `global.fetch`（vitest），保留等价断言覆盖 `putEntry`/`getByDate`/`getMonth`/`getYear`/`getAll`/`deleteEntry`/图片 CRUD
- `vite.config.ts`：增加 `server.proxy['/api'] = 'http://localhost:5189'`
- `start-diary.bat`：先 `start` node 后端，再 `start` vite

## 关键决策（假设，可推翻）

1. **完全移除 IndexedDB**，主存储 = 后端文件。理由：用户要「永久、不受浏览器影响」，保留 IndexedDB 反而引入同步复杂度与潜在不一致。
2. **图片以 base64 JSON 经 API 传输，后端解码落盘**。理由：原生 http 免 multipart 解析，保持零依赖。
3. **数据放项目根 `data/`**。理由：与 bat 同目录，备份整个项目即备份日记。

## 风险与对策

- **写并发**：Node 单线程 + 串行 `await` + 简单写队列（同一文件的写互斥），避免 `diary.json` 损坏
- **后端未启动**：前端请求失败 → 显示错误态（已有 error 状态规范），提示「后端未运行，请重启应用」
- **跨平台路径**：用 `node:path` 处理，避免 `C:\` 硬编码
- **图片体积**：base64 体积约为原图 1.33 倍；本地网络无带宽压力，可接受

## 测试策略

- `db.test.ts`：mock `fetch`，覆盖全部 db 函数（含图片上传/下载/删除）
- 后端轻量集成测试（可选）：起真实 server 测关键 API 读写
- 手动验证（必做）：写日记 → 刷新 → 清浏览器缓存 → 重开仍可见；换浏览器打开仍可见

## 实现计划（Phase 2 细化）

- T1 后端 server + 文件读写 + 写锁
- T2 vite 代理 + bat 双进程启动
- T3 `db.ts` fetch 化 + `db.test` 改 mock
- T4 图片落盘（上传 base64 / 下载 blob）
- T5 导出/导入走后端 API
- T6 构建 + 测试全绿，手动验证「清缓存不丢 / 换浏览器可见」
