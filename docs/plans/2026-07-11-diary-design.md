# 日记网页 · 设计文档

- 日期：2026-07-11
- 阶段：Phase 1 头脑风暴（设计定稿）
- 状态：已批准，待进入 Phase 2 计划拆分

## 1. 产品定位

一个**纯前端、本地存储**的日记网页应用。数据全部保存在浏览器 IndexedDB 中，无后端、无服务器、无账号。目标：最快交付一个功能完整、视觉安静专注（纸感）的日记工具，并可静态一键部署。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 5 + React 19 + TypeScript（strict） | 纯静态 SPA，构建快、体积小 |
| 样式 | Tailwind CSS v4 + shadcn/ui（Radix）+ Lucide 图标 | 现代、可访问、深色模式内置 |
| 数据 | Dexie 4（IndexedDB 封装） | 支持索引查询与全文检索 |
| 编辑器 | TipTap（StarterKit + Image + Placeholder） | 富文本 + 图片节点嵌入 |
| 路由 | React Router | 今日 / 某天编辑 / 日历 / 搜索 / 设置 |
| 主题 | 浅色/深色切换（class 策略） | 纸感：米白底、衬线标题、柔和阴影 |
| 导出 | 纯前端生成 JSON / Markdown 下载 + 导入还原 | 无后端依赖 |

## 3. 数据模型（IndexedDB，Dexie）

```ts
interface Entry {
  id: string;            // uuid
  date: string;          // 'YYYY-MM-DD'，唯一索引，一天一篇
  title: string;
  content: unknown;      // TipTap JSON
  mood: string | null;   // 心情 emoji id
  tags: string[];        // 标签胶囊
  createdAt: number;
  updatedAt: number;
}

interface ImageRecord {
  id: string;
  entryId: string;       // 索引，便于按日记取图
  blob: Blob;            // 原始图片二进制
}
```

- 图片单独成表，列表/日历不加载大图，避免性能问题。
- 标签从 `Entry.tags` 派生，无需独立表。

## 4. 页面与组件结构

### 页面（路由）
- `/` 今日（Today）：今天或最近一篇的编辑入口
- `/day/:date` 某天编辑（DayEditor）
- `/calendar` 日历（Calendar）：按月浏览，有日记的日期显示心情圆点
- `/search` 搜索（Search）：标题 + 正文全文检索
- `/settings` 设置（Settings）：主题切换、数据导出/导入、清空

### 组件
- `Editor`：TipTap 封装，工具栏（加粗/标题/列表/引用/图片）
- `MoodPicker`：emoji 心情选择
- `TagInput`：标签胶囊输入
- `ImageUpload`：选择图片 → 存 Blob → object URL 渲染
- `Sidebar` / `TopBar`：导航与主题切换
- shadcn/ui：`button` `card` `dialog` `input` `textarea` `dropdown-menu` `calendar` `popover` `command` 等

## 5. 四大功能落点

1. **富文本/Markdown**：TipTap StarterKit（加粗、斜体、标题、有序/无序列表、引用、行内代码）+ Image 扩展。
2. **心情 + 标签 + 日历**：MoodPicker（一组 emoji）；TagInput（回车成胶囊）；Calendar 页按月份查询 Entry，命中日期显示心情圆点。
3. **图片/附件**：上传即存 Blob 进 IndexedDB，渲染用 `URL.createObjectURL`，不传服务器。
4. **搜索 + 导出**：Search 页对 `title` + `content` 文本做 Dexie 检索；导出生成 JSON（含图片 Blob）与 Markdown；导入可还原。

## 6. 明确不做（YAGNI）

- 多用户 / 云同步 / 登录注册
- 后端服务器 / 数据库服务
- 社交分享 / 评论

## 7. 部署

`npm run build` → `dist/`，拖到 Vercel / Netlify 即上线；纯静态、零服务器成本。

## 8. 后续阶段

- Phase 2：将本设计拆分为 2–5 分钟/任务 的实现计划（含 TDD 测试）。
- Phase 3：子代理按 TDD 逐个任务实现。
- Phase 4：调试（根因优先）。
- Phase 5：收尾（测试全绿 → 合并/PR/清理）。
