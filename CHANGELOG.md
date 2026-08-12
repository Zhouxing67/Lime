# Changelog

## Unreleased

## 8.0.0 — PDF 阅读器全量重写（inklayer 引擎）

**PDF 引擎迁移**：PDF 阅读区从自研渲染（pdfjs v6 + 手写文本层/几何换算）整体重写为 **inklayer-react 引擎（vendored，pdfjs-dist 4.3.136）**——选区视觉 = 原生浏览器选区（字符级精确，无自定义 overlay）、批注渲染 = Konva（缩放/翻页/重载稳定对齐）、选区与批注点击共存（wrapper pointer-events:none + 命中测试）。

**批注工具**：高亮/下划线/删除线（文本选区选择栏）+ 框选/自由画笔/自由高亮/文本框（顶部工具栏）；移除签名/印章/注释/箭头/圆/云（裁剪）。

**批注数据模型变更（⚠️ 旧批注自动失效）**：批注持久化从「字符偏移/归一化矩形」改为 **Konva store 序列化**（`store.konvaString` + 归一化 `rects`/`path`/`paths`）——缩放无关、跨设备稳定。旧 offset 批注在 app 启动时自动清理（连带卡片/复习）。

**PDF 区域裁剪图**：置入项目时按批注实际笔画（从 Konva 数据提取颜色/线宽/透明度/多笔）渲染裁剪图；取消置入自动清除释放存储。

**交互**：旧款工具栏完全复刻（导航/适应/缩放/页码 + 区域工具）；批注↔卡片**双向跳转**（面板卡↔PDF mark 高亮边框 + 居中）；搜索改用 pdf.js 官方 find controller（字符级精确高亮）；目录 TOC 面板；placed 项目卡点击直达 PDF 批注。

**工程**：pdf.js worker 改 Blob URL（规避 Parcel 转译 fake-worker 崩溃）；`_empty` chunk 后置重命名（Edge 保留前缀）；保留 keep-alive 移除（单活跃实例）；代码净删 ~3000 行（旧 PdfRenderer/pdfMarksKonva/pdfRegistry/pdfViewerShared/konvaStage）。

## 7.0.0 — 同步图片文件分离 + 视图模块化架构

**同步 v6（SyncPayload 图片文件分离）**：图片 dataURL（图像卡 `card.image` / region 裁剪图 `annotation.image` / 旧模型 content 里的图片）全部剥离出 sync JSON，改存 WebDAV `/images/<contentHash>.png` 多文件层（content-hash 命名去重，无损、增量）；JSON 从 MB 级瘦到几百 KB。上传 PUT 缺失图片 + **清理无引用孤儿**（删除传播从设计内置）；下载拉取引用图片并水合回本地；版本门控 v3-v6，兼容读 v5（内联图片透传）。同步慢的问题就此根治。

**PDF 删除传播**：上传侧 `pruneRemotePdfs` 清理本地已删除的远程 PDF 文件（含历史孤儿）——本地删除真正传播到云端。

**强制上传**：备份侧栏新增「强制上传」按钮（同款样式 + 确认弹窗「本操作会强制覆盖云端数据」）——清零 lastSyncTime 强制上传，用于 v6 迁移等场景。

**视图模块化架构**：options 组合根从 3364 行瘦身到 ~2700 行——数据中枢 `useAppData`（共享数据 + maps + loaders + 广播）、路由 `useWorkspaceView` + `ViewRouter`（主区三元 → 分组 props 视图映射）、项目视图 `useProjectsView`、复习/待办/备份视图 hooks（`useReviewView`/`useTodoView`/`useBackupView`）。加视图 = ViewRouter 加分支；加数据源 = useAppData 一处。6 次 Oracle 门评审全过。

**编辑器 UX 系列**：编辑区单卡化（移除 surface2 底带，标题行内嵌「只读|编辑」icon 切换）；只读内容收敛为 create-image 专属（placed/图像编辑仅备注）；只读页图片绝对定位填充（超尺寸缩放无滚动条）；引文阅读卡 `PdfQuoteCard`（重排 PDF 断字 `flowPdfQuote` + 柔和底 + 主题色竖条 + 自适应容器宽度，preview/full/复习背面复用）；图像卡草稿可更换图片；create-image 无图保存校验；编辑区占位/边界改版；离开提醒（丢弃/存草稿/取消）。

**Code review 批次**：草稿期分区计数修正（`visibleProjectCards`）；zip 移除死 images/ 文件夹；复制逻辑去重（`copyCardToProject` + 单卡复制缺失的 snackbar）；`CardGrid` memo + 稳定 props（网格不再随无关状态重渲染）；leave-confirm 存草稿 spinner。

## 6.1.0 — 工作区卡片编辑器 + 草稿中间态

**工作区卡片编辑器**：卡片查看回归弹窗浏览（上/下一张 + 箭头键 + 复制引用），编辑与新建进入**主工作区编辑模式**——Header 56px（返回/类型切换/标题+dirty 圆点/视图切换）、条件工具条（编辑或分栏时聚焦字段即现）、纸面容器（全宽 + 卡片阴影）、吸底操作栏（丢弃二次确认/存草稿/保存，icon-only + 保存 spinner）。网格 hover 编辑 icon 直达工作区编辑。导航切换自动关闭编辑器。

**Markdown 编辑器**：MUI 工具条（加粗/斜体/标题/列表/引用/代码/链接/图片/表格/公式，左中右分组 + 竖线）+ 分栏实时预览（同一渲染器，编辑所见即卡片所得）；原生等宽 textarea（光标与字符天然对齐）；分栏可拖拽 + 源码/预览顶对齐 + 等高撑满；编辑/分栏/预览三态切换。

**草稿中间态**：编辑与新建均可存草稿（`isDraft` + `draftOf` 字段，兼容旧数据）；网格显示草稿取代原卡（混排 + 草稿标记）；编辑草稿保存时写回原卡（保留 id/order/复习）、新建草稿转正；删除原卡级联删草稿；草稿不参与复习；create-draft promote 计算 hash + 去重（防重复卡）；草稿随同步/导出/导入传播（往返测试）。

**修复/质量**：保存按钮 busy spinner；`cardKind` 纯函数收敛类型分发（3 处重复）；`ProjectCard.content` 改可选（消除"必填但恒空"语义矛盾）；promote 事务修复（sha256 await 不再导致 InvalidStateError）；原卡缺失日志；section 头（label + 发丝线）；六按钮 icon 化。

## 6.0.0 — 卡片类型规范化 + 置入卡内容化

**卡片类型模型**：卡片类型规范为 `text / image / placed`（移除 `link`——由 text 覆盖）。新增**只读原始内容**字段（`image`）：image 卡存二进制图（dataURL），placed 卡为解析视图（渲染时从批注取裁剪图/引文，不落库）。字段可用性按类型收紧（text=摘要+内容；image/placed=摘要+只读原始内容+备注）。full 模式分区展示（发丝分割 + 类型化标签：内容 / 只读原始内容 / 备注）。

**DB 创建接口**：`createTextCard` / `createImageCard` / `createPlacedCard` 三个类型化接口（业务层不再直接调用原始构建器，类型不变量在 DB 层强制）；置入/单卡创建收敛到同一入口（1:1 守卫 + 反向引用原子写）。

**置入卡内容化**：region 批注（框选/自由画笔/自由高亮）置入时生成**高清裁剪图**（3x 渲染 + 批注视觉叠加，overlay 坐标修正）→ 项目卡直接显示批注区域；文本框/选中批注置入显示引文；无备注自动生成「备注时间/页数」；**移除项目时清理裁剪图**（释放存储，重新置入惰性再生成）。

**备注重命名**：`idea` → `comment`；卡片布局统一（摘要置顶 + 发丝分割线）；旧数据迁移脚本（`docs/migrations/`，含 link 删除 + image content→image）。

**修复**：置入后项目视图立即更新（定向刷新搜索范围）；legacy 图片卡 full 模式显示真实图片（不再展示 dataURL 链接）；搜索面板失效的收起按钮移除。

## 5.1.1 — 性能与体验优化

**性能**：侧栏/面板拖动防抖（100ms，不再每帧重渲染 PDF）；大 PDF 加载提速（页比例预计算限前 50 页）；canvas 内存两级释放（隐藏 keep-alive PDF + 滚出视口页面）——扩展内存大幅下降。

**批注回跳优化**：flash 与 canvas 渲染解耦（不再触发整页重渲染）→ 单段直达批注居中、无卡顿；多行批注高亮全覆盖（原只高亮第一行）；高亮层提至最顶层 + 强填充 + 描边环（不被原批注覆盖）；框选卡居中修复。

**修复**：沉浸式退出强制重开两侧栏（原恢复预状态导致"无反应"）；TOC/页码跳转回页顶。

**文档**：技术报告 3 份（PDF 批注高亮多层绘制 / canvas 内存管理 / 重渲染风暴溯源）。

## 5.1.0 — PDF 沉浸式阅读 + 渲染优化

**沉浸式阅读**（阶段 1）：工具栏一键关闭左右侧栏、PDF 铺满；退出恢复原开合状态；离开 PDF 视图自动退出；工具栏重排（搜索/适应切换 + 跳转居中/回跳/批注/缩放/沉浸式）。

**PDF 渲染与阅读**：适应宽度/适应页面大小切换（整页可见）；页面精确 dpr 渲染 + 对比度补偿（文字更黑、去灰蒙蒙）；页面渲染质量优化；底部栏显示当前页（页 X / N）；跳转页码 Edge 风格（方形输入框默认显示当前页，非法输入拒绝）；跳转目标校验。

**主题与响应式**：新增赤红主题（深绛红）、移除青灰；默认配色紫檀；卡片网格 ≥1800px 4 列（适配 27 寸 2560×1440）。

**UI 一致性**：P2 六项（TodoCard/ProjectTree 按钮 Tooltip + 16px、PdfView 工具栏图标统一、复选框统一、进度条圆角）；主题名二字简约；设置面板（账号密码同行 + 过时信息更新）。

**文档**：技术报告 9 份（jszip deflate/迁移递归/MV3 陈旧 bundle/白盒闪/混合页缩放/输入同步冲突/tooltip 机制/数据真相源/捕获回归）；UI 设计标准 + 组件复用清单；新用户使用文档。

## 5.0.1 — 修复

- 布局高度溢出修复：PDF 卡片面板无视口高度约束 → 整页可滚动；根容器改为 `height:100vh` + `overflow:hidden`
- PDF 卡片面板交互批次：复制反馈（MUI Tooltip + 绿勾）、批注类型改色点 tooltip、placed 项目名移到卡片底部来源行、图标按钮原生 title → MUI Tooltip（hover 更快）、批注跳转滚动到视口中心、框选图可复制为图片（ClipboardItem）、顶栏 icon 尺寸对齐项目卡片
- 数据库按 store 拆分重构（零行为变化，156 测试保持全绿）
- 技术文档：布局高度溢出报告

## 5.0.0 — 存储架构重构

**底层存储拆分**（数据库 v12）：单一 `items` 表拆为 `projectCards` / `pdfCards` / `todos` 三个类型化表——语义边界彻底消除，每类卡片字段独立、查询专用化；placed 卡改为**双记录模型**（pdfCard 源 + projectCard 放置，互相引用 1:1），置入/移出/删除级联原子化；`ReviewEntry.itemId` 对齐项目卡；SyncPayload v4→v5，旧 v3/v4 云端数据自动兼容转换；迁移/导入/同步三链路往返验证。

**网页捕获重构**：
- `Alt+L` 纯打开捕获侧栏 / `Alt+S` 捕获内容（填充/追加分离），浮动面板移除，侧栏为唯一捕获表面
- **网页框选捕获**（面板图片行 icon → 遮罩拖矩形 → 截图裁剪）
- 公式感知模块化（`mathFormats` 注册表）：KaTeX / MathJax v2/v3 / 知乎 ztext / MathJax v3 裸 SVG（字形名解码重建文本）
- 捕获侧栏重设计（停靠面板 + 分区发丝分割 + 内容框 8 行）

**卡片体验**：批量移动到章节、复制弹窗新建项目 + 收纳（最近优先/折叠/截断）、复制/移动统一浮层面板、全选 Checkbox 统一、框选卡 preview 完整显示、全部卡片视图按 section 相邻排序、PDF→项目跳转定位到所在 section、项目卡来源显示具体 PDF 名、PDF Ctrl+滚轮缩放。

## 4.3.1 — 修复

### 修复
- 备份视图 PDF 范围不显示瓦片（PdfHub 的 selectable 模式仍应用主题过滤，默认 topicView="topics" 匹配空）——备份模式显示全部 PDF，主题过滤仅属 PDF 视图导航

## 4.3.0 — PDF 卡片置入项目 + 双 order 模型 + 存储层优化

### 新增能力
- **PDF 卡片置入项目**（多归属）：批注/框选卡片可「置入项目」→ 进未分类，与网页捕获卡同构（第一性是项目卡片，PDF 只是来源）；卡片预览/满模式底部显示可点击的「PDF · 第 X 页」来源（点击 → 打开 PDF + 跳转批注 flash）；PDF 面板卡片显示可点击的项目 chip（点击 → 项目视图 + 高亮）；支持置入时新建项目；批量置入/移出；置入/移出后清空复习（只有项目卡片可复习）
- **双 order 模型**：新增 `Item.pdfOrder`（页序 × 页内位置），PDF 面板按原文位置排序；项目 `order` 仍为项目视图排序——彻底解耦。未分类 order 空间仅计项目卡（todo/PDF 卡不再污染）
- **移动到章节**（恢复）：卡片操作区新增「移动到章节」→ L1/L2 章节选择对话框（含移回未分类）——网页捕获/置入/任意未分类卡可整理进章节
- **复制到项目去 PDF 来源**：复制的 placed 卡成为普通自建卡片（批注↔卡片保持严格 1:1）
- **卡片编辑语义**：placed 卡内容（PDF 原文）只读 + 备注（idea）可编辑，与 PDF 面板一致

### PDF 体验
- **缩放**：工具栏 `[- 100% +]`（点击 % 重置适应宽度）；缩放/面板拖动/窗口缩放时已加载页即时重排（修复"只影响未加载页"）
- **阅读列**：页面最大宽度 75% + 居中（两侧留白）；三处分割线（顶栏/左右侧栏）统一 Y 轴 52px + 8px 缩进
- **卡片面板升级**：一级右侧面板（可折叠/拖宽 240-520/批量条/摘录计数），与左侧栏同级对称；面板宽度钳制保证 PDF 工作区 ≥400px（修复拖拽覆盖）；悬浮操作绝对定位不占位（头部文字不再竖排）
- **白盒闪修复**：占位高度精确匹配（含 75% 阅读列比率）；懒渲染观察器 root 改为滚动容器（前瞻真正生效）；已加载页缩放/重排即时

### 修复
- 置入/移出/批量操作 try/catch + 错误 toast + 新建项目失败回滚
- 孤儿复习级联（删 PDF/卡片清空关联复习）；移出项目清复习
- 面板重载陈旧闭包（`activePdfIdRef`）；删批注/PDF 级联
- 导入丢弃悬空 projectId（PDF 范围备份的 placed 卡不再不可达）；复制不破坏 1:1
- badge/复习/待办 icon 统一轻量算法（同源同速）；60s + 焦点兜底到期刷新

### 存储层优化
- 批量 `placePdfCards`/`unplacePdfCards`/`deletePdfCards`（单事务单广播）
- 共享 reviews 加载（useReview 内存统计，消 3 次全表读）；`touchProject` 原子化；`searchItems` 索引感知；`byRecency`/`applyBadge`/`getByKeys`/`putAll` 去重

### 代码质量
- AGENTS.md 新增「UI Review 准则」+「Code Review Checklist」
- UI 一致性批次：主题 tokens（avatarPalette/focusRing）、EmptyState iconSize、Well 抽取、侧栏激活行/菜单纸面/过渡/字号统一、空态统一
- PdfCardsPanel 拆分 PlaceCardMenu；60s 定时器按需重算

## 4.2.1 — 新图标

### 优化
- **16px 安全的新图标**：低饱和 sage 绿圆角方 + 白色对角高亮条（超采样矢量光栅化生成，1024² 源自动缩放 16/32/48/64/128）——取代旧粉红默认图标与糊掉的青柠切片，小尺寸下依然清晰，延续编辑式设计语言

## 4.2.0 — PDF 主题分类 + 切换工作流 + 选区优化

### 新增能力
- **PDF 主题分类**：主区新增主题瓦片层（全部 PDF / 主题 / 未分类 / 新建主题）；PDF 可「移动到主题」（⋮ → 菜单，含未分类）；主题重命名/删除（删除 → PDF 回未分类，确认对话框）；空主题持久化；`PdfFile.topic` 接入导出/导入/同步三链路（顺带修复 zip 元数据丢失 pageCount/lastOpened）
- **PDF 切换工作流**：侧栏目录可关闭 → 显示 PDF 库（垂直标签，点击切换）；多 PDF 保持打开（上限 4，LRU 超限关最旧）+ 状态保留（滚动/当前页/搜索/回跳）；激活 PDF 库内置顶 + 高亮；per-pdf 目录各自独立
- **文字选中优化**：自定义统一选区高亮（消除中英文/数字交界色块重叠 + 逐 span 跳变）；阻止浏览器"拖选 → 新标签页搜索"手势（消除选中卡顿）；跨空白行高亮不再消失；文本项索引缓存 + 二分定位（大段选中流畅）
- **UI 一致性重构**：共享 `RECENT_TOTAL` 常量（项目树 + PDF 库统一 = 10）、`SearchField`、`DashedTile`、`relativeTime`——消除重复，纯复用零视觉变化

### 修复
- PDF 视图顶部栏误显示最近项目名（改为显示当前 PDF 名，无 `.pdf` 后缀）
- 工具栏工具右对齐；目录折叠/关闭、批注按钮图标化（去文字）

### 数据
- `PdfFile.topic?: string`（无 DB 迁移）；同步 payload 不变（topic 随 pdfs 元数据）

## 4.1.0 — PDF 文件同步（方案 B）

### 新增能力
- **PDF 文件跨设备同步**（多文件 WebDAV 层）：lime-sync.json 之外新增 `pdfs/` 目录，PDF 按**内容哈希**存储（不可变，每份只传一次）
- **设备 B 下载同步** → 缺失 PDF **自动下载并填充占位符**，无需手动打开即可关联批注/卡片/备注
- **二进制传输**（base64 分块，10MB+ PDF 安全）+ PROPFIND 枚举远端文件
- **中断恢复**：文件下载层始终运行（不依赖 JSON 哈希门控），中途断网后再次下载自动补全
- **安全优先**：下载不删本地 PDF（删除传播留后续）
- 幂等：重复同步不重复上传（内容哈希同名跳过）；只有笔记改动时只传 JSON

### 数据
- SyncPayload JSON 形状不变（v4），向后兼容（MINOR）；文件层为独立目录

## 4.0.0 — PDF 笔记同步 + 批注交互 + 备份重构

### 新增能力
- **PDF 笔记跨设备同步**（SyncPayload v3→v4）：批注 + PDF 卡片 + 备注（`idea`）随 WebDAV 同步；`PdfFile.id` 改为 **SHA-256 内容哈希**（同一文件跨设备 id 恒定）→ 新设备打开同一 PDF 自动关联批注/笔记；无文件时以「占位符」显示（未同步文件 · 点击打开本地匹配）；兼容读取旧 v3 云端数据（上传自动升级 v4）
- **PDF 卡片数据模型**：`Item.idea`（个人理解/补充说明，markdown 可编辑）+ `content` 只读（原文引用块/框选图）；右栏卡片重设计（对齐项目设计语言）+ 「展开全文」内联展开
- **批注交互**：点击 PDF 上的批注 → 默认跳转对应卡片（右栏滚动 + 主色光环高亮）+ 弹层可**切换标记类型**（高亮/下划线/波浪线/删除线，实时重渲染）或**直接删除**（联动删卡）——批注↔卡片双向跳转
- **备份视图重构**：侧栏「项目 / PDF」scope 切换；主区只读多选瓦片（复用 hub）+ 批量工具栏（全选/导出）；导出按 scope（项目含笔记 / PDF 含文件+批注+卡）；PDF 导出移入备份视图
- **UI 一致性修复**：侧栏筛选统一轻量行、虚线瓦片统一、空态统一 EmptyState、chip 圆角/过渡统一；AGENTS.md 固化「UI 一致性」基准 + Code Review Checklist

### 修复
- PDF id 迁移**无限递归**（迁移误调 `tx()` 重开 DB → 应用挂死）；导入旧备份 pdfId 不匹配丢批注/卡片（导出 id → contentHash 重映射）；自建卡片导入被拒（source 放宽）
- 关闭 PDF 后侧栏残留（不完整）目录；批注不可点击（文本层拦截 → z-index 抬升）；导航顺序（项目 / PDF / 复习 / 待办 / 备份）+ 关闭按钮去重
- 性能：`_dbi`/`_dbp` 广播 → `refreshAllData` 合并防抖（突发写操作一次刷新）

### 数据
- SyncPayload **v3 → v4**（新增 `pdfAnnotations` + `pdfs` 元数据，无文件 bytes）
- `PdfFile.id` 一次性迁移为内容哈希（旧 uuid id 自动重写引用）；DB 结构不变

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
