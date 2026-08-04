# Changelog

## Unreleased

## 3.0.0 — PDF 阅读与批注

### 新增能力
- **PDF 阅读视图**：NavRail 新增 PDF 按钮 + 侧栏（未打开 → 库/打开；已打开 → 目录 TOC 可折叠/一键展开折叠）；本地 PDF 存入 IndexedDB（`pdfs` store，DB v8→v10）
- **高质量渲染**：pdf.js 6（原始 ESM worker + cmaps/standard_fonts 打包）；逐页适配宽度（混合尺寸页面不溢出）；DPR 清晰度；惰性页渲染（492 页文档无挂载风暴）；文字可选中（TextLayer）
- **批注系统**：工具栏「批注」菜单 → 高亮/下划线/波浪线/删除线（选中文字即自动捕获）+ **框选**（拖矩形 → 裁剪为图片卡，解决公式/图表）；低饱和批注色延续设计语言
- **摘录卡片**：批注即自动捕获文本卡/图片卡；卡片属于 PDF（非项目，不进全局搜索/复习）；右栏按原文位置排序 + 点击回跳（滚动 + flash）
- **回跳功能**：跟踪当前可见页 + 导航历史栈，任何跳转（目录/跳页/搜索/卡片/框选）可一键返回原页
- **PDF 内搜索**：全文搜索（跨页、匹配导航 ◀▶、高亮定位）+ 跳转指定页码
- **导出**：PDF 库逐 PDF 独立导出（PDF + 批注 + 卡片）；zip 备份含 PDF 文件 + 批注 + PDF 卡片

### 修复
- 全局弹窗在 PDF 视图下未挂载（设置/删除确认/Toast 失效）
- 搜索偏移与文本层规范化一致（连字/CJK 高亮错位）
- 框选/分栏拖拽监听器泄漏 + userSelect 卡死；未渲染页框选空白裁剪
- 回跳历史快速连续跳转压栈脏页

### 数据
- IndexedDB **v8 → v10**（`pdfs`/`pdfAnnotations` store + `pdfRefPdfId` 索引）
- PDF/批注为本地域：不进 WebDAV 同步，zip 备份/单 PDF 导出是唯一出口

## 2.5.0 — 公式捕获 + 捕获侧栏 + 移除右键菜单

### 新增能力
- **公式捕获**：悬停公式显示柔和高亮（设置可关）；Alt+L 无选区时按"光标命中公式 → 捕获整段（文本 + 段内所有 `$…$`/`$$…$$`）"；选区含公式时自动提取 LaTeX。支持 KaTeX（`.katex annotation`）、知乎 `.ztext-math[data-tex]`、MathJax/原生 MathML 尽力提取
- **Markdown 渲染公式**：`$…$`/`$$…$$` 用 KaTeX 渲染（卡片/复习/导出）；行内公式保持在同一段落内
- **捕获侧栏（右侧停靠）**：浮动面板顶栏 📑 切换到全高右侧栏（宽度可调、左缘拖宽）；切换式（面板/侧栏只存在一个）、草稿共享；记住上次关闭的表面，下次 Alt+L 打开它
- **图片捕获**：Alt+L 光标悬停 `<img>` → 图片卡（预览 + 摘要 + 保存）
- **Alt+L 追加**：面板打开且有草稿时，Alt+L 追加新捕获（文本/公式/图片）到草稿末尾——公式/图片无法复制粘贴，这是它们唯一的追加通道
- **链接快速输入**：正文表单粘贴链接 URL → 以摘要为标签插入 `[摘要](url)` markdown（替代原"链接卡"类型）
- **移除右键菜单**（保存图片/链接/文本迁入面板与 Alt+L）

### 修复
- 卡片插入位置：order 分配收敛到数据库层（`ensureItemOrder`），新建/合并/捕获统一生效；copy-to-project 丢弃源项目的 `sectionId`/`order`（修复"孤儿卡"）
- 行内公式不再单独渲染成行（marked html token 方案）
- 导入改为 spread + 关键字段校验（新字段无需并行补丁）；导出项目补 `lastOpened`
- 短公式（`$x$`）可捕获；`[data-tex]` 误标高亮收窄

### 重构
- `FloatingPanel.tsx`（1110 行）拆分：PanelForm（表单业务）/ panelTheme（纯主题）/ panelIcons（图标）
- 工厂收敛：`createItem`/`cloneItem`/`currentSourceMeta`（utils）、`createReviewEntry`（useSrs）
- 感知层去重：`mathTextFromClone` 共享选区/段落提取

## 2.4.0 — Markdown 导出 + mastered 可重学 + 备份含复习

### 新增能力
- **项目 / 章节 Markdown 导出**：项目 `⋯` 菜单"导出 Markdown"、章节 `⋯` 菜单"导出章节 Markdown"，产出单个 `.md` 文件
  - **比例重定位标题层级**：整项目 `#项目/##一级/###二级/####卡片`；单一级/单二级导出以面包屑为根
  - 卡片内容里的标题行渲染为粗体（代码块内不受影响）；卡片标题作章节下层级标题
  - 图片：URL 图内嵌 `![图片](url)`；`data:image` 内嵌图跳过并提示数量；遗留 `item.images` 自动附尾
  - 卡片间以空行分段，来源链接（`> 来源：[标题](url)`）随卡导出；无效章节 id 自动回退整项目
- **mastered 卡可重学**：评"模糊/不认识"时 mastered 卡自动降回学习中并重新进入队列；卡片操作栏新增 ↺"重新复习"（保留 SRS，interval 重置为 1 立即入队）
- **本地 ZIP 备份补全复习数据**：备份导出 reviews（按选中项目范围），导入时校验 + 孤儿（itemId 不存在）丢弃 + 已有复习条目跳过（防唯一索引冲突），兼容旧备份（无 reviews 跳过）

### 修复
- 部分项目导入时泄漏非选中项目的复习条目
- 遗留 `item.images` 在 Markdown 导出中丢失
- 导出卡片间多余的 `---` 分隔符

### 重构
- 共享常量 `defaultSrs` / `DAY_MS`；ReviewEntry 构造去重；标题弹窗 addReview 唯一索引守卫；"今日已评"判定并入会话内存；清理死代码

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
