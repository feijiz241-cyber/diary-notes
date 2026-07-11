# 日记 · Diary

一个纯前端、本地存储的日记网页。数据全部保存在浏览器 IndexedDB，无后端、无账号、隐私优先。

## 功能

- ✍️ 富文本编辑（加粗 / 标题 / 列表 / 引用 / 代码）+ 图片附件
- 😊 每天一篇，可标记心情 emoji 与标签
- 📅 日历视图，有日记的日期显示心情圆点，点击直达
- 🔍 标题 + 正文全文搜索
- 📦 导出 JSON / Markdown 备份，支持导入还原
- 🌗 浅色 / 深色主题，偏好自动记忆
- 📱 移动端优先，桌面 / 平板 / 手机自适应

## 技术栈

Vite + React 19 + TypeScript · Tailwind CSS v4 + shadcn 风格组件 · Dexie(IndexedDB) · TipTap · React Router

## 本地运行

```bash
npm install
npm run dev        # 开发预览
npm run test       # 单元测试
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产包
```

## 部署

纯静态站点，构建产物在 `dist/`，可直接拖到 Vercel / Netlify；仓库已附 `vercel.json` 与 `netlify.toml`（含 SPA 路由回退）。

## 目录结构

```
src/
  components/    UI 组件（Editor / MoodPicker / TagInput / ImageUpload / AppShell / ThemeProvider ...）
  lib/           数据层与工具（db / mood / tags / search / export / editor-serialize）
  pages/         页面（Today / DayEditor / Calendar / Search / Settings）
  test/          测试基建
docs/plans/      设计文档与实现计划
```
