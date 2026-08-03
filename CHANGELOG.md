# Changelog

## Unreleased

## 2.3.0 — 复习系统重构 + UI 对齐

### 复习系统（重构）
- **三档评分**（认识 / 模糊 / 不认识）替代四档：增长曲线放缓（×1.6 / ×1.3，约 13-21 次成功到顶），首评基线 认识 2 天 / 模糊 1 天；遗留四档数据兼容（4 归入认识）
- **严格首次评分**：一张卡每天仅第一次评分写入排程；同日复评只影响会话队列，重新通过则次日重学（`1分→4分` 不再被救回长间隔）
- **会话本地化**：每次评分 O(1) 本地队列更新，进度改绝对口径（剩余 / 已评 / 通过 / 重试），移除上一张/下一张；队列清空与重入复习时向 DB 校准
- **广播拆细**：reviews 写操作广播 `_dbr`（不再伪装成 `_dbi`），options/background 定向轻量刷新——复习评分不再触发全量 refreshAllData
- **近期回顾按 `reviewHistory` 逐日分组**：多日复习的卡片正确出现在每一天，与日期视图评分徽标口径统一
- 复习背面卡片与 full 卡片同风格（共享原文区块），内容垂直居中

### UI（对齐编辑风）
- 难度筛选：裸彩色圆点 → 带语义色点的文字分段药丸
- 今日评分分布：独立彩色条 → 单一堆叠条 + 色点图例
- 复习完成面板：大 emoji + 色带框 → 纸卡结果面板（徽标 + serif 标题 + hairline 三列统计，重试为 0 弱化）
- Toast：顶部实心 Alert → 底部居中纸卡（图标 + 消息，纯视觉）
- 三档低饱和色（`RATING_META`）全站统一（按钮 / 堆叠条 / 图例 / 卡片评分点 / 筛选药丸）
- 侧边栏不再盖住最左 NavRail（Drawer paper 内联化）；重复点击当前视图按钮开合侧边栏（VS Code 式）

### 修复
- 复习评分、加入/移出复习不再拖累其它视图（`_dbr` 定向刷新）
- 新建/合并卡片落位第二张（order 基于未过滤全量数据）
- 图文混排卡片预览过高 → 仅显示图片数量提示
- 复习按钮 badge 只计未完成待办（不再被复习操作误增）
- 近期回顾缺少多日复习的卡片

### 重构
- `defaultSrs` / `DAY_MS` 共享常量，ReviewEntry 构造去重
- 标题弹窗 addReview 唯一索引守卫（避免 ConstraintError）
- "今日已评"判定并入会话内存（消除异步竞态）
- 清理死代码（`handleStartReview`、`recentItems` 返回、`console.debug` 残留）

## 2.2.0 — Todo 卡片

### Todo 视图（新能力）
- NavRail 新增"待办"按钮（位于 备份 之后），构成独立视图；badge = 未完成待办 + 复习待办之和，扩展工具栏 badge 同步
- 新增 todo 卡片类型（全局、无项目归属），按创建时间倒序排列、不可拖拽；"新增待办"虚线瓦片恒为第一位
- **结构化任务编辑器**（TaskEditor）：`- [ ]` 语法被彻底封装——编辑界面只见"复选框 + 输入框"，Enter 新增任务行、退格删空行、保存自动重组 Markdown 语法；纯文本行自动转任务，空任务行自动丢弃
- Markdown 复选框渲染修复：MarkdownRenderer 新增样式化 `checkbox` 渲染器，并精确过滤 marked-react 对 checkbox token 的无害警告；项目卡片中的任务列表同步受益
- 删除待办走确认弹窗（与卡片/项目口径一致）；空保存自动丢弃

### 项目
- ProjectHub 瓦片新增删除按钮（hover 浮现），弹窗提示将级联删除项目下 N 张卡片

### 修复
- 首进/刷新后 todo 卡片与计数不显示（挂载时未加载）
- 新增待办点击取消仍残留空卡（改为幻影编辑，保存才落库）
- 导入备份时内容相同的 todo 被误去重（导入走 skipDedup）
- todo 变更后双重数据加载；background 调试日志残留

### 重构
- 代码审查收尾：TaskEditor 外部 value 同步与闭包新鲜度（rowsRef/lastEmitted）、`TASK_RE` 单一来源、精简 todo 刷新路径

## 2.1.0 — Markdown-embedded images + project tree interactions

### 图文混排（Markdown 内嵌图片）
- MarkdownRenderer 新增图片渲染器：`![url](url)` 渲染为宽度受约束（`max-width: 100%`）的圆角图，不再撑爆弹窗
- 卡片详情改为**单一连续流**：文本与图片在段落间交替，移除"文本/图片"标签盒与图片区内部滚动条
- 卡片预览封面从 content 提取图片；复习正面与预览隐藏内嵌图片，避免封面/画廊重复
- 图片输入改为**插入 content**（ImageUrlInput / DialogEditMode / NewCardDialog / 浮动面板），新卡片不再写入 `item.images`
- 旧数据迁移：text/link 卡的 `item.images` 逐张追加为 Markdown token 并清空；`item.images` 保留为只读 legacy（image 卡不受影响）

### 项目树
- **手风琴**：一次只展开一个项目树；展开=打开、折叠=关闭回 hub
- 项目行移除展开箭头，**行单击切换**开/关；章节展开按钮保留（项目内可多开）

### 清理
- 移除 capture 消息与 background 的失效 `images` 字段（迁移后无写入方）


### Layout
- Three-column workspace: **NavRail | Sidebar | Main**. The three view buttons (项目/复习/备份) moved from inside the sidebar to a leftmost ~52px vertical rail; the settings gear is pinned to the rail's bottom. The sidebar's own nav icons and close button were removed — the AppHeader toggle is the single sidebar open/close control.

### Navigation
- **ProjectTree** replaces the flat project list: projects → sections (L1/L2) → 未分类. Projects are recent-first with the active project pinned and a "全部项目 (N)" toggle. Section create/rename/delete live in row `＋`/`⋯` actions with inline inputs; section drag reorders same-parent siblings only (no reparent).
- **ProjectHub**: with no project open, the main area becomes a project center (tiles with avatar/note/card-count/last-opened + a dashed 新建项目 tile). The top search then filters **projects** — projects are strictly isolated, so there is no cross-project card search.
- Main area shows a single section at a time with a clickable breadcrumb (`项目 / L1 / L2`); L1 selection aggregates its L2 cards. ContentOutline and the inline section bars were removed.

### Cards
- **Pointer-based card drag-reorder** (`useCardDragReorder`) replaces HTML5 DnD: a `⋮⋮` grip is the only drag source, a 6px threshold arms the drag, a custom ghost follows the cursor, drop targets are hit-tested via `elementFromPoint`, and a "放到末尾" zone appends to the section end. Same-section only, with FLIP layout animation after the drop.
- New cards default into the active section; a dashed 新建卡片 tile (≈2× card height) sits at the masonry's next slot.
- **Removed**: move-to-section and move-to-project (cross-section/cross-project moves). Copy-to-project kept (`CopyCardsDialog`, renamed from `MoveCopyCards`). `updateItemSection` deleted.

### Dialog
- ItemDialog prev/next now follows the current view (`scopeItems` / search hits / review-date items) instead of the paginated 20-card page.
- `←`/`→` arrow keys navigate cards (edit-mode safe; gated on hasPrev/hasNext).

### Persistence
- Tree expand state, per-project active section, and sidebar width persist under `_uiNav` in `chrome.storage.local`.

### Fixes folded in
- Hub search term no longer leaks into a project's card view on open.
- Card drag no longer toasts a misleading "已移动到「X」" for same-section reorders; no-op reorders are skipped.
- NavRail/header settings dedup; sidebar width persisted.
