# 树形日记（Forest）· 设计文档

> 阶段：Phase 1 头脑风暴定稿（Superpowers Workflow）
> 日期：2026-07-11
> 关联：在现有纯前端日记应用（Vite + React 19 + TS + Tailwind + Dexie + TipTap）上**新增**树形浏览视图。

## 1. 需求重述（用户原话落地）

- 浏览日记的页面做成**一棵树**；**每个月 = 一棵树**。
- 写过的日记是树上的**叶子**，**位置由时间逻辑决定**（哪天写的就长在对应位置）。
- **点叶子预览**那篇日记。
- **叶子之间的空白要标明间隔的日期**（"观看时叶子之间的日期要表明出来"）。
- **搜索功能保留**。

## 2. 已拍板的关键决策

| 决策点 | 选择 |
|---|---|
| 树的形态 / 时间轴 | **竖向树干，天数 = 高度**（1 号在根部，月末在树冠） |
| 间隔呈现 | **树上留白段 + 标注**（空白枝长度 = 间隔天数，并标"空 N 天 / 日期范围"） |
| 页面范围 | **新增"森林"页，其它（今日/日历/搜索/设置）保留** |

## 3. 视觉与交互设计

### 3.1 单棵月树（MonthTree，纯 SVG）
- **树干**：一条从底部（day=1）延伸到顶部（day=daysInMonth）的竖向主干。
- **叶子位置（时间逻辑）**：
  - 纵向坐标 `y(day)` 由日期严格决定：day 1 在底部，day 31 在顶部，线性映射。
  - 横向：每片叶子从主干向**左或右**伸出一小段枝（branch），左右与伸出角度由 `date` 字符串哈希**确定性**得出（同日期永远同侧，保证可复现）。
  - 叶子形状用 SVG `path` 画成叶形，填充色 = 当天心情色；尺寸可随正文长度微调。
- **间隔标注（核心）**：相邻两篇日记 `day_i` 与 `day_{i+1}` 之间的主干段为"空白枝"。
  - 该段长度天然 = 间隔天数（因为 y 由日期映射）。
  - 在该段旁标注：`空 N 天（M月a–b日）`，N = `day_{i+1} - day_i - 1`。
  - 可选：空白枝上按"天"画细小刻度点，让"中间的日子"可见。
- **空月**：只有主干 + 居中提示"本月还没有日记"。
- **选中态**：点开的叶子高亮（描边/放大），预览面板额外显示"距上篇 N 天 / 下篇 M 天"。

### 3.2 叶子预览（LeafPreview）
- 点击叶子 → shadcn `Dialog` 弹出。
- 内容：标题、日期、心情 emoji+标签胶囊、正文（**只读 TipTap 实例**，复用现有编辑器配置与 `ImageNode` 以渲染图文）、图片附件（经 `getImagesByEntry` → object URL）。
- 正文片段预览用 `docToText()` 生成。

### 3.3 森林页（ForestPage）
- 顶部：**月份导航**（← / → 切换月份 + "2026 年 7 月"标题，可切年）+ **搜索框**。
- 中部：当前月的 `MonthTree`（SVG），移动端可上下滚动 / 缩放，fit-to-width。
- **搜索联动**：输入关键词调用 `searchEntries()`，命中日期的叶子**高亮描边**、其余**淡化**；点击仍打开预览。完整 `SearchPage` 保持原样。

### 3.4 可访问性 / 响应式
- 叶子是 `<g role="button" tabIndex={0}>`，带 `aria-label="7月3日 日记 · 心情开心"`，支持键盘聚焦与 Enter/Space 打开。
- 浅/深色：叶子配色用 CSS 变量或固定 hex，深色模式下提亮；树干/文字跟随 `background`/`foreground`。
- 移动端：SVG `viewBox` 自适应宽度，高度超屏时容器 `overflow-y-auto`。

## 4. 技术实现

### 4.1 新增 / 修改文件
| 文件 | 动作 | 说明 |
|---|---|---|
| `src/lib/mood.ts` | 改 | `Mood` 增加 `color` 字段 + 导出 `MOOD_LEAF_COLORS` 映射（叶子配色） |
| `src/lib/tree-layout.ts` | 新 | **纯函数** `computeLayout(entries, year, month)` → `{ leaves, gaps, daysInMonth, width, height }`；`computeGaps()` 间隔段计算。无 DOM 依赖，可单测 |
| `src/components/MonthTree.tsx` | 新 | 消费 `computeLayout`，渲染 SVG 树干/叶子/间隔标注，叶子点击回调，a11y |
| `src/components/LeafPreview.tsx` | 新 | shadcn Dialog 只读预览 |
| `src/pages/ForestPage.tsx` | 新 | 月份导航 + 搜索框 + MonthTree + LeafPreview 组合 |
| `src/App.tsx` | 改 | 增加 `<Route path="/forest" element={<ForestPage />} />` |
| `src/components/AppShell.tsx` | 改 | `navItems` 增加 `{ to:'/forest', label:'森林', icon: TreePine }` |

### 4.2 复用的现有能力
- 数据：`getMonth(year, month)`、`getImagesByEntry(entryId)`
- 搜索：`searchEntries(query)`（返回带 `snippet` 的结果）
- 正文：`docToText(content)`
- 心情：`getMood(id)`（扩展后含颜色）
- UI：shadcn `Dialog` / `Button` / `Input`
- 编辑器：`Editor` 只读实例 + `ImageNode`（图文渲染）

### 4.3 依赖
**不引入新依赖**。树用原生 SVG + React 绘制，符合"依赖克制 / KISS"。

## 5. 数据模型影响
无。叶子完全由现有 `Entry`（date/day/mood）派生，不改 IndexedDB schema。

## 6. 明确不做（YAGNI）
- 写实植物学树木（只做写意示意树）
- 多棵月树同屏总览（先做单月切换，后续可加）
- 树的动画生长 / 物理模拟（静态确定性布局）
- 云端同步（沿用纯本地）

## 7. TDD 核心（时间逻辑可测）
`src/lib/tree-layout.test.ts`：
- `computeLayout` 叶子 `y` 随 day 单调递增（day1 在最下，day31 在最上）
- 同 `date` 多次调用结果一致（确定性）
- `computeGaps`：day3 与 day9 之间 → 1 段，`emptyDays=5`，`label` 含日期范围
- 空月 → 0 叶子、整段为 1 个 gap
- 边界：当月只有 1 篇 → 无 gap

## 8. 部署
无变化。仍 `npm run build` → `dist/`，纯静态。
