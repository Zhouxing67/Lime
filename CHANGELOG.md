# Changelog

## Unreleased

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
