# 日记 · Diary

一个本地优先的日记网页。前端跑在浏览器，数据由同机本地 Node 后端落盘到硬盘 `backend/data/`，**不上传任何服务器、不受清缓存/换浏览器影响**，隐私优先。

## 功能

- ✍️ 富文本编辑（加粗 / 标题 / 列表 / 引用 / 代码）+ 图片附件
- 😊 每天一篇，可标记心情 emoji 与标签
- 📅 日历视图，有日记的日期显示心情圆点，点击直达
- 🔍 标题 + 正文全文搜索
- 📦 导出 JSON / Markdown 备份，支持导入还原
- 🌗 浅色 / 深色主题，偏好自动记忆
- 📱 移动端优先，桌面 / 平板 / 手机自适应

## 技术栈

Vite + React 19 + TypeScript · Tailwind CSS v4 + shadcn 风格组件 · TipTap · React Router · 本地 Node 后端（零依赖 `http` 模块）落盘文件

## 本地运行

```bash
npm install
npm run server     # 启动本地后端（默认 5189，数据落盘 backend/data/）
npm run dev        # 启动前端（5188，/api 同源代理到后端）
npm run test       # 单元测试（前端 + 后端）
npm run build      # 类型检查 + 生产构建到 frontend/dist/
npm run preview    # 预览生产包
```

> 一键启动前后端：直接双击 `start-diary.bat`（先起后端再起前端，并自动打开 5188）。

## 部署

前端是纯静态站点，构建产物在 `frontend/dist/`，可直接拖到 Vercel / Netlify；仓库已附 `vercel.json` 与 `netlify.toml`（含 SPA 路由回退）。**注意**：后端是本地进程，部署到托管平台后日记会改为浏览器端或需另配服务端，本地使用请走 `start-diary.bat`。

## 目录结构

```
frontend/               前端（Vite + React）
  index.html
  vite.config.ts        Vite / Vitest 配置（含 /api 代理）
  tsconfig.json
  src/
    components/         UI 组件（Editor / MoodPicker / TagInput / ImageUpload / AppShell / ThemeProvider ...）
    lib/                数据层与工具（db / mood / tags / search / export / migrate / editor-serialize）
    pages/              页面（Today / DayEditor / Calendar / Search / Settings）
    test/               测试基建
backend/                后端（零依赖 Node，落盘文件）
  index.mjs             HTTP 服务（/api 路由）
  store.mjs             文件存储核心（diary.json + images/）
  *.test.mjs            后端单元测试
  data/                 运行时数据（diary.json + images/），gitignore
docs/plans/             设计文档与实现计划
```
