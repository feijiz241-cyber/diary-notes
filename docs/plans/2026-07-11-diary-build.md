# 日记网页 · 实现计划（Phase 2）

- 日期：2026-07-11
- 基于：docs/plans/2026-07-11-diary-design.md
- 执行纪律：每个任务 **先写失败测试 → 看红 → 写实现 → 看绿 → 提交**（TDD）。不写范围外代码（YAGNI）。

## 任务清单

### T1 脚手架与基础配置
- 目标：Vite + React 19 + TS(strict) + Tailwind v4 + shadcn/ui + 路由骨架，能 `dev` 跑起空白页。
- 测试(红)：无（脚手架任务，跳过单测，靠 `build` 通过）。
- 实现(绿)：初始化项目、装依赖、配置 Tailwind/shadcn、建 `src/` 目录与空路由。
- 提交：`chore: scaffold vite+react+ts+tailwind`

### T2 主题与布局外壳
- 目标：浅/深色 ThemeProvider + AppShell（Sidebar + TopBar）+ 路由切换。
- 测试(红)：`ThemeProvider` 切换后 `<html>` 的 `class` 包含 `dark`；默认读 localStorage。
- 实现(绿)：ThemeProvider（class 策略 + localStorage 持久化）、Sidebar 导航、TopBar 主题按钮、路由表。
- 提交：`feat: theme provider + app shell + routing`

### T3 数据层（Dexie）
- 目标：`Entry` / `ImageRecord` 表 + CRUD 函数。
- 测试(红)：`putEntry` 后 `getByDate` 能取回；同日覆盖（update 而非新增）；`deleteEntry` 生效；图片表按 `entryId` 索引可查。
- 实现(绿)：`src/lib/db.ts` 定义 schema 与 `putEntry/getByDate/getMonth/deleteEntry/getAll`、图片 `putImage/getImagesByEntry/deleteImagesByEntry`。
- 提交：`feat: dexie data layer with crud + tests`

### T4 富文本编辑器
- 目标：TipTap 集成 + 工具栏（加粗/斜体/标题/列表/引用/代码）。
- 测试(红)：`serialize/parse` 工具把 TipTap JSON ↔ 存储格式正确互转（纯函数单测）。
- 实现(绿)：`Editor.tsx` 封装 TipTap（StarterKit + Placeholder），工具栏按钮驱动命令，受控 `onChange` 回传 JSON。
- 提交：`feat: tiptap editor + toolbar`

### T5 图片附件
- 目标：选择图片 → 存 Blob → 编辑器中渲染，列表不加载。
- 测试(红)：`ImageUpload` 选图后调用 `putImage`；`getImagesByEntry` 返回 blob；object URL 生成/回收无泄漏（用 fake timers 验证 revoke）。
- 实现(绿)：`ImageUpload.tsx` + TipTap Image 扩展（自定义 node view 读 Blob 渲染），卸载时 `revokeObjectURL`。
- 提交：`feat: image attachment via indexeddb blob`

### T6 心情与标签
- 目标：MoodPicker（emoji 集）+ TagInput（胶囊）。
- 测试(红)：`MoodPicker` 选中回传 id；`TagInput` 回车成胶囊、去重、可删；标签字符串数组 ↔ 胶囊互转纯函数单测。
- 实现(绿)：两个组件 + `src/lib/mood.ts`（emoji 映射）。
- 提交：`feat: mood picker + tag input`

### T7 今日 / 某天编辑页
- 目标：`/` 打开今天（无则新建），`/day/:date` 打开指定日期；保存/自动保存；一天一篇。
- 测试(红)：打开已有日期加载正确内容；保存后 `getByDate` 更新 `updatedAt`；新日期创建空草稿。
- 实现(绿)：`TodayPage` / `DayEditorPage` 组合 Editor + MoodPicker + TagInput + ImageUpload，防抖保存。
- 提交：`feat: today and day editor pages`

### T8 日历页
- 目标：按月浏览，有日记的日期显示心情圆点，点击跳转编辑。
- 测试(红)：`getMonth` 返回当月所有 entry；圆点渲染数量与 mood 对应。
- 实现(绿)：`CalendarPage` 用 shadcn Calendar + `getMonth` 查询，decorators 显示心情。
- 提交：`feat: calendar month view with mood dots`

### T9 搜索页
- 目标：标题 + 正文全文检索，结果列表点击跳转。
- 测试(红)：`searchEntries` 对标题/正文关键词命中；大小写不敏感；无命中返回空。
- 实现(绿)：`SearchPage` + `src/lib/search.ts`（基于 Dexie 遍历/索引）。
- 提交：`feat: full-text search`

### T10 设置页（导出/导入/清空）
- 目标：主题切换入口、导出 JSON（含图片 Blob）/ Markdown、导入还原、清空全部。
- 测试(红)：`exportJSON` 结构含 entries+images；`importJSON` 还原后 `getAll` 条数一致；`clearAll` 清空两表。
- 实现(绿)：`SettingsPage` + `src/lib/export.ts`（JSON/MD 生成与下载、导入解析、清空）。
- 提交：`feat: settings export/import/clear`

### T11 收尾与部署
- 目标：构建通过、响应式/可访问性自查、部署配置（vercel/netlify 静态）。
- 测试(红)：`npm run build` 成功；`tsc --noEmit` 无错。
- 实现(绿)：修复告警、加 `vercel.json`/`netlify.toml`、README 简述运行方式。
- 提交：`chore: build pass + deploy config + readme`

## 执行模式（待用户选择）
- **A. 子代理驱动（本会话）**：每个任务 spawn 实现子代理 + 双阶段评审（规格评审 + 代码质量评审），TDD 强制。
- **B. 手动执行**：用户按上述任务自行实现，我仅答疑。

## 验收
所有任务测试绿、构建通过、设计文档四大功能全部可用，方可进入 Phase 5 收尾。
