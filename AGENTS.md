# lime — Agent Guide

## Stack

- Chrome MV3 extension via **Plasmo v0.90.5** (TypeScript, React 18, MUI v7)
- State: React hooks + IndexedDB (`fake-indexeddb` in tests)
- No state manager, no router, no CSS modules (MUI Emotion)
- Path alias `~` → repo root (tsconfig)

## Commands

| Command                  | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `pnpm run dev`           | Start Plasmo dev server with HMR                       |
| `pnpm run build`         | Production build                                       |
| `pnpm run package`       | Package for Chrome Web Store                           |
| `pnpm test`              | Jest (ts-jest, jsdom)                                  |
| `pnpm run test:coverage` | Jest with coverage                                     |
| `pnpm run format`        | Prettier (no-semi, double-quotes, trailing-comma none) |
| `pnpm run format:check`  | Prettier check (CI-friendly)                           |
| `pnpm run test:watch`    | Jest watch mode                                        |

## Versioning

SemVer `X.Y.Z`. `package.json` `version` is the single source — Plasmo writes it into `manifest.version`; never edit the manifest version anywhere else.

- **MAJOR (X)** — user data or the core info architecture breaks: a `DB_VERSION` / SyncPayload schema change (migration required), replacing the navigation/organization model, or removing a capability existing data depends on. Current major is **2.0.0** (workspace rework).
- **MINOR (Y)** — new backward-compatible capability (a feature milestone).
- **PATCH (Z)** — bug fixes / polish / docs only.

Chrome Web Store restriction: the manifest version must be dot-separated integers — **no `-beta` / `-rc` suffixes in the store version**. Pre-release info lives only in git tags / CHANGELOG.

Release flow (always, in order): bump `package.json` → move the CHANGELOG "Unreleased" section into a versioned heading → git tag `vX.Y.Z` → push → **`pnpm run build` BEFORE `pnpm run package`** (the package script reuses the existing `build/` output — without a fresh build the zip ships the previous version's manifest) → create the GitHub release and attach `build/chrome-mv3-prod.zip`. Keep an "Unreleased" heading at the top of CHANGELOG during development.

## Entrypoints

| File                              | Bundle                 | URL                     |
| --------------------------------- | ---------------------- | ----------------------- |
| `src/options.tsx`                 | Options page (main UI) | `options.html`          |
| `src/background.ts`               | Service Worker         | background              |
| `src/contents/capture.ts`         | Content script         | all `https?://*/*`      |
| `src/contents/floating-panel.tsx` | Content script UI      | all `https?://*/*`      |
| `src/tabs/new-project.tsx`        | Popup page             | `tabs/new-project.html` |

Plasmo v0.90+: custom popup pages go in `src/tabs/`, not `src/`.

## Project Structure

```
src/
  components/       # MUI components
  hooks/            # useProjects, useReview, useSrs, useBackupSync, useNewCard, useCardDragReorder
  database/         # IndexedDB via withStore() + tx() wrappers
  types/            # Item, Project, ReviewEntry, SearchQuery, ExtensionMessage
  contents/         # content script entry (not src/content-scripts/)
  background/       # SW-only: context menus (menus.ts)
  import/           # ZIP/JSON import
  utils/            # sync, zip, crypto
  theme/            # MUI createAppTheme(light|dark, preset)
  test/             # setup.ts (polyfills + chrome.* mocks)
```

## Database (IndexedDB)

- `withStore(name, mode, fn)` — opens/closes DB, auto-broadcasts changes
- `tx(storeMap, fn)` — multi-store atomic transaction (items, projects, reviews)
- Active stores: `items`, `projects`, `reviews` (v8; `categories`/`sources` removed in v6, `review_session` removed)
- Any `readwrite` transaction auto-broadcasts via `chrome.storage.local.set({_dbi|_dbp: Date.now()})`
- All contexts listen to `chrome.storage.onChanged` for these keys — no manual notify
- Item dedup: same `hash` + `source.url` within same `projectId` skips insert (addItem returns false)
- `searchItems(q)` — filters by keyword, type, site, projectId, date range
- `bulkReplace(remoteItems, remoteProjects, remoteReviews, localItems, localProjects, localReviews)` — diff-based sync in single atomic tx: upsert remote, delete local-not-in-remote

## Messaging

Typed discriminated union `ExtensionMessage` (`src/types/messages.ts`):

```ts
sendMessage({ kind: "capture", payload: {...} })  // → background SW
sendMessage({ kind: "webdav", ... })               // proxied through SW (avoids Chrome auth dialog)
sendMessage({ kind: "list-projects" })             // → SW reads projects store
sendMessage({ kind: "add-project", name })         // → SW creates project
sendMessage({ kind: "capture-visible-tab" })       // → SW returns tab screenshot dataURL
sendMessage({ kind: "set-recent-project", ... })   // update lastOpened
```

Kinds: `capture`, `toast` (SW→tab), `webdav`, `save-feedback` (SW→tab), `set-recent-project`, `list-projects`, `add-project`, `capture-visible-tab`. Always use `sendMessage()` — never raw `chrome.runtime.sendMessage`.

## Workspace & Navigation (v1.11)

Layout is three columns: **NavRail | Sidebar | Main**.

- **NavRail** (`src/components/NavRail.tsx`) — leftmost ~52px rail, always visible. Vertical stack of the three view buttons (项目/复习/备份; review carries a due-count badge); the settings gear is pinned at the bottom. Clicking a view also opens the sidebar. The old in-sidebar nav icons and the sidebar's own close button are gone — the AppHeader toggle is the single open/close control.
- **Sidebar** (`SidebarFilters.tsx`) — resizable drawer (width persisted in `_uiNav`). Top row = current view title. The projects-tab body is injected as `children` (the `ProjectTree`), followed by 新建项目 and 稍后阅读 rows. Review/backup tabs unchanged.
- **Main** — content only.

**ProjectTree** (`src/components/ProjectTree.tsx`):

- Projects are recent-first (active pinned); the top ~7 show by default with a "全部项目 (N)" toggle; each project renders as a subtle card well.
- Sections (level 1/2) are tree nodes with per-section card counts and an 未分类 node.
- Row actions: project `＋` (add L1) + `⋯` menu (重命名/编辑备注/删除); L1 `＋` (add L2) + `⋯` menu (重命名/删除); L2 has `⋯` only. Adding/renaming use inline inputs.
- Section drag reorders among **same-parent siblings only** (before/after lines); reparent is intentionally disabled.
- Section CRUD goes through `useProjects` handlers. Tree state (expanded set, per-project active section, sidebar width) persists in `chrome.storage.local` under `_uiNav`.

**ProjectHub** (`src/components/ProjectHub.tsx`):

- With no project open, the main area shows a responsive grid of project tiles (initial avatar, serif title, note, card count, relative last-opened) plus a dashed 新建项目 tile, sorted by lastOpened.
- In hub mode the top search filters **projects** by name/note. Projects are strictly isolated (the process/address-space model) — there is no cross-project card search, and the card search is gated off while no project is open.

**Main area**:

- Single-section view: clickable breadcrumb `项目 / L1 / L2` (clicking a parent segment navigates up; project root = all cards). L1 selection aggregates its L2 descendant cards. Cards cannot change project or section after creation — they stay where they were created.
- New cards default into the active section (`useNewCard`); a dashed 新建卡片 tile sits at the masonry's next slot (about 2× card height).
- Search/date override to flat results; the reading list is a separate cross-project queue.

**ItemDialog**:

- Header: `◀▶` view-aware prev/next (`scopeItems` in the section view, `allItems` for search hits, `filteredDateItems` in the review-date view) + type icon + serif title + edit/copy/close.
- `←`/`→` arrow keys navigate cards; input/textarea/select targets are skipped so edit-mode cursor movement is safe, and navigation is gated on hasPrev/hasNext.

**Card drag** (`src/hooks/useCardDragReorder.ts`): pointer-event custom drag — **not** HTML5 DnD. The `⋮⋮` grip is the only drag source; a 6px movement threshold arms the drag; a ghost clone follows the cursor; drop targets are hit-tested via `elementFromPoint` on `[data-card-id]`. Same-section only; a "放到末尾" dashed zone appends to the section's end; CardGrid FLIP-animates the reorder. `computeDropIndex` (in `utils`) is the pure insertion-index function with unit tests.

**Removed features (v1.11)**: move-to-section and move-to-project were removed. Copy-to-project remains (`CopyCardsDialog`, renamed from `MoveCopyCards`). The `updateItemSection` DB function was deleted.

## CRITICAL Constraints

1. **Background SW has NO DOM APIs** — no `window`, `document`, `alert`, `prompt`, `confirm`. They throw `ReferenceError`.
2. **Right-click saves** (contextMenus.onClicked) cannot compute CSS selectors — `Item.source.selector` is absent. Highlight-based features cannot work for right-click saves.
3. **Project names must be unique** — enforced by `projects` store unique index.
4. **No `window.confirm`** — use MUI `DeleteConfirmDialog` instead.
5. **WebDAV Basic auth** must proxy through background SW (`kind: "webdav"`) to avoid Chrome's native auth dialog.
6. **MV3 extension_pages CSP defaults to `'self'`** — external resources (images, fonts, styles) need explicit `*-src` declarations in `package.json` `manifest.csp` (already configured: `img-src` https/data/blob, fonts+styles via cdn.jsdelivr). New external assets won't load until CSP is extended.

## Key Conventions

- New UI regions → new file in `src/components/`, not inline in `options.tsx`
- State mgmt stays in `options.tsx` (composition root); child components get data + callbacks via props
- New MUI Dialogs → extend `DialogShell` template (consistent borderRadius, title fontSize, cancel/confirm layout)
- Empty states → `EmptyState` component (not inline Box/Typography)
- Card content rendering → `CardRenderer` with `mode` prop (`preview`|`front`|`back`|`full`)
- Backup export → `useBackupSync.handleExportBackup` (ZIP via `utils/zip.ts`, `export.json` inside), triggered from SidebarFilters
- Item creation → `createItem()` factory in `background.ts` (not inline `id: crypto.randomUUID()` in 3 places)
- Mixed cards (text+images) → `Item.images: string[]` on any type; `computeItemHash` takes images as optional 3rd param (different images = different card); UI entry is `NewCardDialog` (URL paste) + `ItemDialog`→`DialogEditMode`; shared `ImageUrlInput` component
- `refreshAllData()` wraps `loadProjects()` + `onSearch()` — call for import/sync-download operations
- `~` path alias maps to root (used in imports as `~/src/...`)
- Card drag-reorder → `useCardDragReorder` (pointer events, same-section only); never use HTML5 `draggable` for cards
- Projects are strictly isolated: no cross-project card search (hub search filters projects by name/note); new cards default into the active section via `useNewCard`

## UI 一致性（防风格割裂）

**复用优先**（新 UI 必须复用，禁止手写 inline）：
- 空态 → `EmptyState`；弹窗 → `DialogShell`；操作栏 → `BatchToolbar`（可配置 actions + countLabel）
- 侧栏列表行 → 轻量行模式（active = `action.selected` + `primary.main` 文字，hover = `action.hover`）——**禁止用 MUI `Button outlined/contained` 做筛选行**
- 瓦片/虚线瓦片 → 复用 `ProjectHub`/`PdfHub` 的 Paper 卡片 + `1.5px dashed borderStrong` 虚线
- 卡片 hover → `cardShadowHover` + `translateY(-1px)` + `borderStrong`；hover 操作渐显 `opacity 0.15s`，破坏性操作常显
- 类型/状态指示 → 色点 + 标签（复用 `RATING_META`/`MARK_DOT`），不另造样式

**Token 档位**：
- 圆角：卡片/按钮/瓦片/chip 一律 `1`（不自定义 0.5/0.75）
- 过渡：hover `0.2s ease`；入场/页面切换 `0.25s ease-out`；micro 动效 `0.15s`
- 硬编码 hex 仅限例外：PDF 纸张 `#fff`/`#f0efec`、浮动面板主题、批注色（`pdfTheme`）——其余一律用 `t.custom.*`/palette

**UI Review 准则**（每次 UI review 按六条基准线执行，P1 割裂 → P2 不一致 → P3 可选）：

1. **Token 档位**：`borderRadius` 一律 `1`；过渡只用三档（hover `0.2s ease` / 入场 `0.25s ease-out` / micro `0.15s`）；阴影只用 `cardShadow`/`cardShadowHover`——`0.5/1.5/2/4` 圆角、`0.3s/0.35s/cubic-bezier` 过渡、原始 `boxShadow: N` elevation 都是违规
2. **颜色语义**：只用 `t.custom.*`/palette；primary 只在 active/hover/link（不用作静态数字/默认强调色）；hover 操作渐显 + 破坏性常显
3. **间距节奏**：同层级表面 `px/py` 一致；分割线缩进/Y 轴统一；卡片 hover = `cardShadowHover` + `translateY(-1px)` + `borderStrong`
4. **文字排版**：serif（阅读体）/ sans（UI chrome）栈；同角色字号一致（次要文字统一 `0.75rem`，标题 600/700 不混）
5. **状态反馈**：激活行 = `action.selected` 底 + `primary.main` 文字；hover = `action.hover`；选中 = primary 边框 + tint
6. **复用遵守**：空态 → `EmptyState`；弹窗 → `DialogShell`；操作栏 → `BatchToolbar`；虚线瓦片 → `DashedTile`；Well/OriginalBlock 抽共享组件；菜单纸面统一 `slotProps { py: 0.5, borderRadius: 1 }`；筛选行禁止 `Button outlined/contained`；UI 控件用 MUI 图标（禁 `✎`/`◀▶` 字形）

**例外清单**（刻意保留，不视为违规）：PDF 纸张/浮动面板/批注色；窄侧栏空态（260px 内用内联 caption 而非 EmptyState）；复习统计卡（`ReviewEmptyStats` 自定义卡面）；TodoCard 任务添加行的 `1px dashed`。

## Code Review Checklist

每次 code review 按以下维度执行（P1 阻断 → P2 → P3），**追踪完整数据流而非孤立看文件**。

### P1 · 正确性与数据安全
- [ ] 逻辑错误 / 边界：off-by-one、空值、并发/竞态、状态陈旧
- [ ] 数据丢失风险：迁移/导入/同步路径是否会丢数据；事务是否原子
- [ ] 异常处理：失败是否捕获 + console 有具体原因（不裸报错）
- [ ] 安全：用户 markdown 无 dangerouslySetInnerHTML（除 KaTeX 转义输出）；凭据只在 chrome.storage.sync；CSP 覆盖外部资源

### P2 · 分层职责 + 数据流 + 边界
- [ ] 职责归属：逻辑是否在正确层（DB 负责 order 等持久化规则；utils 纯函数；组件渲染；业务在 hooks）
- [ ] 广播链路：热写路径是否触发 `refreshAllData`（应定向广播 `_dbi`/`_dbp`/`_dbr`/`_dbpdf` + 轻量重载）
- [ ] 状态一致性：无陈旧/重复状态；关闭/清理是否清干净（如 pdfOutline）
- [ ] 卸载/取消竞态：document 监听器泄漏、setState-on-unmounted、异步取消（AbortController、pdf.js 取消异常）

### P3 · 重复 / 可维护 / UX
- [ ] 重复维护：同逻辑多处（抽 utils/组件）；死代码、console.debug、未用导出
- [ ] 组件内聚：组件职责单一，过大组件考虑拆分（如 FloatingPanel）
- [ ] UI 一致性：复用清单（EmptyState/DialogShell/BatchToolbar/Well/轻量行/瓦片）+ token 档位；无硬编码样式

### 跨 bundle / 数据兼容（本项目的特殊维度）
- [ ] 数据兼容：DB_VERSION 迁移、SyncPayload 版本门控、导入导出往返（spread 校验，新字段存活）
- [ ] 跨 bundle：background 无 DOM；content script 注入时机（MV3 更新不重注入）；options 组合根
- [ ] 批注↔卡片 1:1：改一边必须联动另一边（创建原子、删除级联、类型改只影响 overlay）

### 导入 / 导出 / 同步 正确性（数据往返三链路）
任何数据模型 / 字段语义改动，必须三链路全查：
- [ ] 导出 `toJsonZip`：新字段 / 改字段是否序列化存活（type-agnostic，无白名单遗漏）
- [ ] 导入 `jsonImport`：`validateItem`/`validateReview`/`validatePdfAnnotation` 的 spread + key 校验是否放行新字段；id 语义变更（如 contentHash）是否需重映射（导出 id → 实际 id）
- [ ] 同步：SyncPayload 序列化 + 哈希覆盖新字段；`bulkReplace`/`applyPdfSync` 的 upsert/删除是否跟随；跨设备 id 稳定性
- [ ] 往返测试：导出 → 清空 → 导入，新字段存活；字段值语义变化（如 annotation.type）不破坏往返
- [ ] 三链路共享不变式：注解 ↔ 卡片 1:1、pdfId 一致性、删除级联在导入/同步后仍成立

### 方法论
- 功能失效时从用户动作 → 持久化 → 反馈全链路追踪（框架边界常是根因）
- 验证真实构建行为（dev 构建 vs 打包可能分叉）
- 按 P1/P2/P3 排序，一次修复一个批次；共享组件改动检查所有调用点（可选 prop 默认不变）

## Review (SRS)

- SM-2-style algorithm: starting ease 2.5, min 1.3, max interval 365 days
- **Three levels** (v2.3): `1=不认识` (fail, relearn immediately), `2=模糊` (slow ×1.3), `3=认识` (×1.6); legacy `4` reads as 认识. First-review baselines: 模糊 1d / 认识 2d
- **Strict first-rating-of-the-day**: only the day's FIRST rating writes the schedule; same-day re-ratings are practice — a re-pass moves the failure's dueDate to tomorrow, a re-fail keeps the session loop. Detection via `reviewHistory` dayKey + session `firstSrsRef`
- Review data stored in separate `reviews` store (ReviewEntry with itemId unique index)
- Card must have `Item.title` before it can be added to review
- `rateSrs(srs, 1|2|3|4)` — pure function applying the algorithm to SrsData; `defaultSrs()` exports a fresh entry
- `updateReviewSrs(itemId, srs)` — persists rating; auto-promotes to `mastered` at interval ≥ 365 (never demotes — known gap)
- Get due cards via `getDueReviews()` (dueDate index query, active status only)
- **Session queue is local & O(1)**: each rating updates the in-memory queue (pass → drop, fail → requeue to end); progress is absolute (剩余/已评/通过/重试); `getDueReviews` runs only at session start / queue-empty / re-entry. No prev/next
- Reviews writes broadcast `_dbr` (not `_dbi`) — options/background do targeted review reloads, never `refreshAllData`
- `getRecentItems` groups by `reviewHistory` per day (a multi-day card appears each day), not by `lastReviewDate`
- Entering review tab auto-loads due cards; leaving discards session state

## Sync

- WebDAV provider: `https://dav.jianguoyun.com/dav/Apps/lime/lime-sync.json`
- Credentials in `chrome.storage.sync` (`syncUsername`, `syncPassword`)
- Conflict: SHA-256 hash comparison → user chooses upload/download (no auto-tiebreaker)
- SyncPayload v3 includes items, projects, and reviews (with stable id-sort for hash)
- `buildPayload(items, projects, reviews)` sorts all arrays by id before hashing
- Context menu project/recent lists rebuild automatically when background SW sees `chrome.storage.onChanged` on `_dbp` (no message kind for this)

## Testing

- `fake-indexeddb` auto-polyfilled in test setup
- Chrome API mocked (`chrome.runtime`, `chrome.storage.local`)
- Tests in `src/database/index.test.ts`, `src/utils/index.test.ts`, and `src/import/jsonImport.test.ts`
- Run: `pnpm test` (or focused: `pnpm exec jest --no-coverage src/path/to/test`)
