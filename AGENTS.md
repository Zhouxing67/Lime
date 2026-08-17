# lime — Agent Guide

> 当前版本 **0.2.0**（2026-08，版本机制重置：从 8.x 切到 `0.Y.Z` 开发期版本）。本文件随 v0 实际架构对齐；与代码冲突时以代码为准。

## Stack

- Chrome MV3 扩展，**Plasmo v0.90.5**（TypeScript 5.6、React 18、MUI v7）
- **zod 4.1.x**（锁 4.1，勿升 4.4+：parcel scope-hoisting 会把 zod@4.4 的 external.js 摇掉 → `z.enum is not a function` 白屏，见 Constraints）
- **序列化单一来源**：记录类型由 `src/types/schemas.ts` 的 Zod schema `z.infer` 推导（`types/index.ts` re-export）——加字段 = 改 schema = 类型与反序列化同时更新
- PDF 引擎：**pdfjs-dist 4.3.136**（vendored，`assets/pdfjs/`，package.json `alias` 把 `pdfjs-dist` 指向 `./assets/pdfjs/pdf.mjs`；运行时 viewer 用 npm `pdfjs-dist/legacy/web/pdf_viewer.mjs`）+ **inklayer 引擎**（vendored，`src/pdf/inklayer/`，Konva 批注层）
- 状态：React hooks + IndexedDB（测试用 fake-indexeddb）；无状态管理器/无路由/CSS Modules（MUI Emotion）
- 路径别名：`~` → 仓库根，`@/*` → `src/pdf/inklayer/*`

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Plasmo dev 服务（HMR） |
| `pnpm run build` | 生产构建（prebuild 跑 `scripts/copy-pdfjs-assets.mjs` 生成 `assets/pdfjs/`） |
| `pnpm run package` | 打包 Chrome Web Store（`python3 scripts/package.py`；**先 build**，见版本流） |
| `pnpm test` | Jest（ts-jest，jsdom） |
| `pnpm run test:watch` / `test:coverage` | Jest watch / 覆盖率 |
| `pnpm run lint` | ESLint（`--max-warnings 0`） |
| `pnpm run format` / `format:check` | Prettier（no-semi, double-quotes, trailing-comma none） |

构建后 `scripts/fix-empty-chunks.mjs` 自动把 `_empty.*.js` 改名（Chrome 拒绝 `_` 前缀文件）。

## Versioning

开发期版本 `0.Y.Z`（SemVer，**MAJOR 恒 0 —— 不发布正式版**）。`package.json` version 是唯一来源（Plasmo 写入 manifest）。当前 **0.1.0**。

- **0（恒 0）**：永不发正式版；1.x 需用户显式决定正式发布才启用
- **Y（MINOR）**：功能里程碑 / 破坏性变更（DB_VERSION / SyncPayload schema 迁移、导航模型替换、移除已有能力依赖的数据）
- **Z（PATCH）**：修复 / 打磨 / 小增强

节奏（不每轮 bump，治「版本升太快」）：
- 日常交付轮（每 commit）**不升版本**；只在**阶段性交付点**升。
- PATCH **批量累积**：多个修复轮合并一次 `0.Y.Z+1`。
- MINOR **稀疏**：仅在功能里程碑或 schema/架构变更时 `0.Y+1.0`。

发布流（**不发布正式版，仅打 tag**）：bump version → CHANGELOG「Unreleased」→ 版本化标题 → `git tag v0.Y.Z` → push → **先 `pnpm run build` 再 `pnpm run package`**（package 复用 build/ 产物，不新构建会带上旧 manifest）。开发期 CHANGELOG 顶部保留「Unreleased」。

## Entrypoints

| File | Bundle | URL |
| --- | --- | --- |
| `src/options.tsx` | Options 页（主 UI） | `options.html` |
| `src/background.ts` | Service Worker | background |
| `src/contents/capture.ts` | 内容脚本（网页捕获） | `https?://*/*` |
| `src/contents/floating-panel.tsx` | 内容脚本 UI（悬浮球） | `https?://*/*` |
| `src/contents/pdf-saver.tsx` | 内容脚本 UI（PDF 保存悬浮球） | `https?://*/*` |
| `src/contents/formula.ts` | 内容脚本（公式识别） | `<all_urls>` |
| `src/contents/mathFormats.ts` | 内容脚本（MathJax 解析） | `<all_urls>` |

`src/tabs/` 已随 pdf-poc 删除（不存在）。无 popup 页。

## Project Structure

```
src/
  components/       # MUI 组件（含 PdfEngineView = PDF 阅读区）
  hooks/            # useAppData/useWorkspaceView/useProjectsView/useReviewView/useBackupView/useTodoView/usePdfSearch/usePdfDocument/useSrs/useCardDragReorder/usePanelDragResize ...
  database/         # IndexedDB via withStore()/tx()
  types/            # types/index.ts re-export 记录类型（来自 schemas.ts 的 z.infer）；schemas.ts = 记录类型的 Zod 单一来源；SearchQuery 等非记录类型手写
  contents/         # 内容脚本（capture/floating-panel/pdf-saver/formula/mathFormats）
  background.ts     # SW 单文件（捕获落库、WebDAV 代理、PDF 保存、badge 更新）
  import/           # ZIP/JSON 导入（校验器 = schema.safeParse + 导入语义预解析）
  utils/            # sync/zip/crypto/cards/export
  theme/            # MUI createAppTheme(light|dark, preset)
  pdf/inklayer/     # vendored 标注引擎（pdfjs viewer + Konva），已裁剪掉未使用的 features/components
  test/             # setup.ts + mocks
```

## Database (IndexedDB)

- `withStore(name, mode, fn)` — 打开/关闭 DB，readwrite 事务完成自动广播
- `tx(storeMap, fn)` — 跨 store 原子事务
- **DB_VERSION = 12**。Stores：`projectCards`, `pdfCards`, `todos`, `projects`, `reviews`, `pdfs`, `pdfAnnotations`
- 卡片类型：`ProjectCard`（projectId/sectionId/order/content）、`PdfCard`（pdfId/page/annotationId/pdfOrder/content/idea）、`TodoCard`（dueDate/content，全局跨项目，identity-unique）
- **placed PDF 卡 = 两条记录**：`pdfCard` 源 + `projectCard` 置入（互指 `pdfCardId` ↔ `projectCardId`，1:1）；置入记录 **不含 content**（渲染/搜索时经 pdfCard 解析）；`stripPlacementContent()` 守卫所有写入
- 广播键：`projectCards` → `_dbi`，`todos` → `_dbt`，`pdfCards`/`pdfs`/`pdfAnnotations` → `_dbpdf`，`projects` → `_dbp`，`reviews` → `_dbr`；`pdfs` 元数据写（rename/topic）→ `_dbpdfTouch`
- ProjectCard 去重：同 `hash` + `source.url` 同 projectId 跳过（`addProjectCard` 返回 false）；placements/todos identity-unique
- `searchProjectCards(q)` — keyword/type/site/projectId/date 过滤；placed 卡命中解析关联 pdfCard 内容
- `bulkReplace(...)` — 同步用 diff 原子替换
- **迁移必须用已打开的 db 连接**（`db.transaction`），禁用 `withStore`/`tx`（会重开 DB 重触发迁移 → 无限递归）

## Messaging

类型化判别联合 `ExtensionMessage`（`src/types/messages.ts`），一律 `sendMessage()`：

Kinds：`capture`（→SW 落库）、`toast`（SW→tab）、`webdav`（SW 代理，避免 Chrome 原生 auth 弹窗）、`set-recent-project`、`list-projects`、`add-project`、`capture-visible-tab`（SW 返回 tab 截图 dataURL）、`fetch-pdf`（SW 拉远程 PDF）、`save-web-pdf`（pdf-saver → SW 存 PDF）。

## Workspace & Navigation

三栏布局：**NavRail | Sidebar | Main**。
- **NavRail**：~52px 左栏，三视图按钮（项目/间隔复习/备份与同步，复习带到期数 badge）+ 底部设置齿轮。点视图即开侧栏；AppHeader 是唯一开/关侧栏控制。
- **Sidebar**：可拖宽（宽度存 `_uiNav`）。项目 tab 注入 `ProjectTree` + 新建项目/稍后阅读行；PDF tab = PDF 库 + 打开本地 PDF/URL；复习/备份 tab 各自内容。
- **Main**：单项目视图（面包屑 项目/L1/L2，L1 聚合其 L2）；搜索覆盖全项目卡（有项目时）或项目名（hub 模式）。

**ProjectTree**：项目 recent-first（活跃置顶），默认 ~7 个 +「全部项目 (N)」展开；L1/L2 分区树节点带计数 + 未分类；行操作：项目 `＋`/`⋯`（重命名/备注/删除）、L1 `＋`/`⋯`、L2 `⋯`；L1/L2 增删改走 `useProjects`。分区拖拽仅限同父兄弟。

**ProjectHub**：无打开项目时，Main 显示项目瓦片网格（新建项目虚线瓦片），按 lastOpened 排序；hub 模式顶部搜索过滤项目名/备注。

**ItemDialog**：◀▶ 视图感知 prev/next（`scopeItems`/`allItems`/`filteredDateItems`）+ 类型图标 + serif 标题 + 编辑/复制/关闭；`←`/`→` 导航，输入/textarea/select 目标跳过。

**卡片拖拽**（`useCardDragReorder`）：pointer 事件自定义拖拽（非 HTML5），`⋮⋮` 把手为唯一拖源，6px 阈值启动，ghost 跟随，`elementFromPoint` 命中 `[data-card-id]`，同 section 内；「放到末尾」虚线区；CardGrid FLIP 动画。`computeDropIndex`（utils）为纯函数。

## PDF 阅读模块

- **视图**：`PdfEngineView`（inklayer PdfViewerProvider + EngineBridge + 我们自己的 MUI 工具栏/选区工具条/搜索侧栏）+ `usePdfDocument`（加载/outline/搜索用 doc）。PDF 存储在 `pdfs` store（bytes），placeholder（未同步 bytes）需打开本地文件匹配批注。
- **cMap 对齐（R2）**：引擎与搜索两侧 `getDocument` 必须传 `cMapUrl/cMapPacked/standardFontDataUrl`（`usePdfViewer` 的 `createLoadingTask` + `usePdfDocument`）——CID 字体（非嵌入 GBK 中文）缺 cMap 时文本层为空。改参数必须两侧同步。
- **选区/搜索高亮（R3-REV）**：自绘 line-bridging overlay。原生绘制（::selection / CSS Highlight API）按绝对定位逐词 span 逐块绘制、不桥接词间距 → justify 大间距必断。`pdfText.highlightRectsForOffsets`：char offset → 覆盖 leaf span 子 range（`rangeForLocal` 穿透 `<mark>`）→ 按 em 盒分线 → 每线合并 [minX,maxX] 一个连续块；选区（`textLayerOffsets`）与搜索（`searchFlash` offsets）同一管线、各自独立 overlay div。
- **批注几何（R4）**：`mergeRectsByLine`（`painter/editor/merge_rects.ts`）行级桥接合并；只影响新建批注。批注裁剪图三字段不变量（rects/path/paths/konvaString，见 `pdfRegionImage.ts`）。
- **pdf.js 依赖**：worker 用 Blob URL（`utils/pdfWorker.ts` ensurePdfWorker）——chrome-extension:// worker URL 会触发 fake-worker 的 require 崩溃。所有 `getDocument` 前必须 await。
- **fixture 验证**：`test/fixtures/pdf/`（CID-GBK/justify-连字/markedContent）+ `diag.mjs`；真实浏览器验证用 playwright（devDep）+ `/tmp/opencode/pdf-harness`。

## Removed / Not-Present

- 网页标注/回跳、复习热力图、PDF 删除传播（下载不删本地）、Anki/Notion 导出、wikilink、跨项目搜索 —— 设计上拒绝/推迟
- inklayer 自带 Toolbar/Sidebar/features 页面 —— 未使用已裁剪；`src/pdf/inklayer/index.ts` barrel 已删
- EmbedPDF/PDFium PoC（`pdf-poc`）—— 已废弃删除

## CRITICAL Constraints

1. **Background SW 无 DOM API**（无 window/document/alert/prompt/confirm）—— ReferenceError。
2. **右键保存无法算 CSS selector**——`Item.source.selector` 缺失，高亮类功能对右键保存无效。
3. **项目名唯一**——`projects` store 唯一索引。
4. **无 `window.confirm`**——用 MUI `DeleteConfirmDialog`。
5. **WebDAV Basic auth 必须经 SW 代理**（`kind: "webdav"`）。
6. **MV3 extension_pages CSP 默认 `'self'`**——外部资源需 `*-src`（已配 jsdelivr；新外部资源要扩展 CSP）。
7. **DB 迁移用已开连接**（见 Database 节）。

## Key Conventions

- 新 UI 区域 → `src/components/` 新文件；状态留在 `options.tsx`（组合根），子组件经 props 拿数据+回调
- Dialog → `DialogShell` 模板；空态 → `EmptyState`；操作栏 → `BatchToolbar`；虚线瓦片 → `DashedTile`
- 卡片渲染 → `CardRenderer`（mode: preview/front/back/full）
- 备份导出 → `useBackupSync.handleExportBackup`（ZIP，`export.json` 内置）
- 卡片创建 → `createProjectCard`/`createPdfCard`/`createTodoCard` 工厂（utils；DB 自分配 order）
- 混合卡片（文本+图）→ `ProjectCard.images: string[]`；`computeItemHash` 第三参
- `refreshAllData()` = `loadProjects()` + `onSearch()`；导入/同步下载后调用
- 批注↔卡片 1:1 联动（创建原子、删除级联）；`stripPlacementContent` 守卫
- `sendMessage` 替代裸 `chrome.runtime.sendMessage`
- UI 一致性 / token 档位 / 代码审查清单 → `docs/design-standard.md` + AGENTS 底部基线

## UI 一致性（防风格割裂）

> 数值基准与组件复用清单见 **`docs/design-standard.md`**。

- 圆角一律 `1`；过渡三档（hover `0.2s ease` / 入场 `0.25s ease-out` / micro `0.15s`）；阴影仅 `cardShadow`/`cardShadowHover`
- 颜色只用 `t.custom.*`/palette；primary 只在 active/hover/link；hover 操作渐显 + 破坏性常显
- 激活行 = `action.selected` 底 + `primary.main` 文字；hover = `action.hover`；选中 = primary 边框 + tint
- 复用：EmptyState/DialogShell/BatchToolbar/DashedTile/轻量筛选行；菜单纸面 `slotProps { py: 0.5, borderRadius: 1 }`
- 例外（刻意保留）：PDF 纸张/浮动面板/批注色；窄侧栏内联 caption；复习统计卡；TodoCard 任务添加行虚线

## Review (SRS)

- SM-2 变体：起始 ease 2.5，min 1.3，max 365 天
- **三级评分（v2.3）**：`1=不认识`（立即重学）、`2=模糊`（×1.3）、`3=认识`（×1.6）；旧 `4` 按认识读。首评基线：模糊 1d / 认识 2d
- **每日首次评分锁定计划**：只有当天第一次评分写计划；同日重评为练习（重过 → 失败项到期日移明天；重败 → 保持会话循环）。检测经 `reviewHistory` dayKey + 会话 `firstSrsRef`
- `reviews` store（ReviewEntry，itemId 唯一索引）；卡须有 `ProjectCard.title` 才能进复习
- `rateSrs(srs, 1|2|3|4)` 纯函数；`defaultSrs()` 新条目；`updateReviewSrs` 持久化，interval≥365 自动 promoted
- `getDueReviews()`（dueDate 索引，active 仅）；**会话队列本地 O(1)**：评级只改内存队列（过→出队、败→队尾），进度显示剩余/已评/通过/重试；`getDueReviews` 仅会话开始/队空/重入时跑
- reviews 写广播 `_dbr`（非 `_dbi`）；options/background 定向复习重载，不 `refreshAllData`

## Sync

- WebDAV provider：`https://dav.jianguoyun.com/dav/Apps/lime/lime-sync.json`；凭据在 `chrome.storage.sync`（`syncUsername`/`syncPassword`）
- 冲突：SHA-256 内容哈希对比 → 用户选上传/下载（无自动仲裁）
- **SyncPayload v6**（2026-08）：单 JSON（projectCards/pdfCards/todos/projects/reviews/pdfs 元数据/pdfAnnotations）+ **多文件图片层**（`/Apps/lime/images/<contentHash>.png`，payload `images` 映射）+ **PDF 文件层**（`/pdfs/<id>.pdf`）。上传 uploadImageFiles/uploadPdfFiles + prune 孤儿；下载 downloadImageFiles/downloadPdfFiles + hydratePayloadImages。版本门控 v3-v6（v5 内联图片透传读兼容）。哈希覆盖全部数组（稳定 id 排序）
- `hasChangesSince`（广播戳 vs lastSyncTime）跳「无变化」；force 同步清零 lastSyncTime
- `toJsonZip`/`jsonImport` 数据往返：spread + key 校验放行新字段；id 语义变更需重映射
- **反序列化分层**：形状校验 = `schemas.ts` 的 `schema.safeParse`（单一来源）；语义转换（默认值/legacy 映射/未知字段保留）= import 校验器预解析。**同步下载**经 `sanitizeSyncPayload` 逐条 `safeParse`（畸形跳过+计数，合法记录原样应用、未知字段零丢失）；**上传守卫** `wouldWipeRemote`：从未同步 + 本地记录 < 云端 → 阻断上传（防全新设备清空云端）
- **v6 是同步格式**（图片/PDF 引用，需在线下载）——`parseExport` 检测 v6 直接报「请用同步导入」，不允许 ZIP 静默导入丢图

## Testing

- `fake-indexeddb` 自动 polyfill；Chrome API mock（`src/test/setup.ts` + mocks）
- 测试文件：`src/database/index.test.ts`、`src/components/pdfText.test.ts`、`src/components/MarkdownEditor.test.ts`、`src/utils/*.test.ts`、`src/import/jsonImport.test.ts`、`src/contents/formula.test.ts`、`src/pdf/inklayer/.../merge_rects.test.ts`
- 测试 fixtures（PDF 选区/搜索诊断）：`test/fixtures/pdf/`；`pnpm exec jest --no-coverage <path>`
- 真实浏览器渲染验证（pdf.js 文本层/高亮）：playwright + `/tmp/opencode/pdf-harness`
