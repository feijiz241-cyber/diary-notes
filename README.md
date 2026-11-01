# 日记 · Diary

一个本地优先的日记 + 笔记网页。前端跑在浏览器，数据由同机本地 Node 后端落盘到 `backend/data/`，**不上传任何服务器、不受清缓存 / 换浏览器影响**，隐私优先。

## 功能

- ✍️ 富文本日记：加粗 / 斜体 / 标题 / 列表 / 引用 / 行内代码，一天一篇，可记心情与标签
- 📓 笔记：一天可写多篇，与日记互不影响，带年历查找
- 🖼️ 图片与 📎 附件：支持上传任意类型文件，正文内渲染可下载的附件卡片；图片也可**直接粘贴或拖拽**进正文
- 🌲 森林：把当月日记长成一棵月夜下的像素老松，每篇日记是一片发光的叶子，可预览、搜索可高亮命中
- 📅 日历：全年 12 个月视图，有日记的日期显示心情
- 🔍 全文搜索：标题 + 正文，覆盖日记与笔记
- 📦 导出 JSON / Markdown 备份，导入即还原；可从浏览器旧版一键迁移
- 🌗 浅色 / 深色主题，偏好自动记忆
- 🖥️ 桌面浏览器专用（Chrome / Edge 等），双击启动即用；**不做手机端适配**，也不保证平板可用

## 技术栈

Vite + React 19 + TypeScript · Tailwind CSS v4 + shadcn 风格组件（Radix UI）· TipTap · React Router · 本地 Node 后端（零依赖 `http` 模块）落盘文件

## 本地运行

```bash
npm install
npm run server     # 启动本地后端（默认 127.0.0.1:5189，数据落盘 backend/data/）
npm run dev        # 启动前端（5188，/api 同源代理到后端）
npm run test       # 单元测试（前端 + 后端）
npm run build      # 类型检查 + 生产构建到 frontend/dist/
npm run preview    # 预览生产包
```

> **日常使用**：双击 `start-diary.bat`。它在源码**有改动时**才 build（没改动直接复用 `dist`，约 0.06 秒），然后**只起一个后端进程**同时提供页面和 `/api`（生产模式，打开 http://127.0.0.1:5189）。没改代码时从双击到页面出现约 1 秒。
>
> **正在改代码时**：在同一个目录里跑 `start-diary.bat dev`（开发模式，起 5188 的 vite dev + 5189 的后端，改完页面自动刷新）。改完代码想回到日常模式，直接双击 `start-diary.bat` 即可。
>
> 两种模式**都在这一个文件里**，不再有第二个 `.bat`：本机给「新创建的」批处理文件打上 Internet 区域标记，双击会弹「无法验证发布者」的安全警告；只有沿用原来那个文件才不会弹。详见 `docs/reports/2026-11-01-性能与稳定性优化记录.md` 第八节。

## ⚠️ 仅支持本机运行

后端是**常驻 Node 进程 + 本机文件存储**，**无法部署到 Vercel / Netlify 等托管平台**：静态托管只会上传前端代码，`/api` 请求会被 SPA 回退成 HTML（前端拿到 HTML 解析失败），数据也没有可写的地方。仓库因此**不再提供任何部署配置**，请使用 `start-diary.bat` 在本机运行。

前后端**默认都只监听回环地址**（`127.0.0.1`），同一局域网内的其它设备访问不到。这一项在 2026-09-18 已经修过：后端原先 `server.listen(port)` 不指定 host，Node 会绑到 `0.0.0.0`，等于把**没有鉴权**的日记接口摊在整个 Wi-Fi 上（`880e91d` `c1cd83a`，并有单测盯住绑定地址）。

### 想跨机器访问（不推荐）

若确有需求（例如同一 Wi-Fi 下的另一台**电脑**；手机不在支持范围），需要**同时**放开两侧——只放开后端是不够的，前端页面本身也进不来：

```bash
HOST=0.0.0.0 npm run server     # 放开后端 API
npm run dev -- --host           # 放开前端 dev server（Vite 默认只绑回环）
```

然后在该设备上访问 `http://<本机局域网IP>:5188`。

> 这一步的风险需要你自己承担：后端**没有鉴权**，放开监听后同网段任何设备都能读写甚至清空你的日记与附件。仅在本机使用时，**保持默认配置即可**，完全不需要做这些。

## 目录结构

```
frontend/               前端（Vite + React）
  index.html
  vite.config.ts        Vite / Vitest 配置（root=frontend，含 /api 代理）
  tsconfig.json
  src/
    components/         UI 组件（Editor / DayEditor / ImageNode / FileNode /
                        MonthTree / LeafPreview / MoodPicker / TagInput / AppShell ...）
    lib/                数据层与工具（db / search / export / cleanup / mood / tags /
                        migrate / editor-serialize / tree-layout / tree-pixels / utils）
    pages/              页面（Today / DayEditor / Notes / Forest / Calendar /
                        Search / Settings / NotFound）
    test/               测试基建（内存后端 mockApi）
backend/                后端（零依赖 Node，落盘文件）
  index.mjs             HTTP 服务与全部 /api 路由（兼静态托管 dist）
  store.mjs             文件存储核心（串行写队列 + 原子写入）
  *.test.mjs            后端单元测试
  data/                 运行时数据（已 gitignore）
scripts/                启动/诊断小工具
  build-if-stale.mjs    源码没变就跳过构建
  wait-for-server.mjs   等端口就绪（带超时与最后一次错误）
  zone-probe.ps1        查文件的 Windows 区域标记（0=本地，3=Internet）
docs/                   文档（索引见 docs/README.md）
  交接文档.md           交接必读：现状 / 约束 / 红线
  reports/              按日期归档的记录（现状分析、修复与优化记录）
  plans/                设计与实现计划（7 月，部分过时）
```

## 数据与备份

- `backend/data/diary.json`：日记（一天一篇）；`notes.json`：笔记（一天多篇）
- `backend/data/images/` 与 `files/`：图片与附件，各自带 `manifest.json` 记录元数据
- **图片与附件按「日期」归属**：同一天的日记与笔记共用同一个素材池
- 设置页可导出 JSON 备份（图片 / 附件以 base64 内联），导入即完整还原（保留原 id）
- **从正文里移除附件 / 图片时，后端文件会立即删除**。因此移除后再按 `Ctrl+Z` 撤销，卡片会恢复但文件已不在，属于失效卡片
- 设置页「维护 → 清理未引用素材」用于回收历史遗留的孤儿素材（删除请求失败、旧版本遗留等）

## 许可

MIT License，见 [LICENSE](LICENSE)。
