# lime — Agent Guide

## Stack
- Chrome MV3 extension via **Plasmo v0.90.5** (TypeScript, React 18, MUI v7)
- State: React hooks + IndexedDB (`fake-indexeddb` in tests)
- No state manager, no router, no CSS modules (MUI Emotion)
- Path alias `~` → repo root (tsconfig)

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Plasmo dev server with HMR |
| `npm run build` | Production build |
| `npm run package` | Package for Chrome Web Store |
| `npm test` | Jest (ts-jest, jsdom) |
| `npm run test:coverage` | Jest with coverage |
| `npm run format` | Prettier (no-semi, double-quotes, trailing-comma none) |

## Entrypoints

| File | Bundle | URL |
|---|---|---|
| `src/options.tsx` | Options page (main UI) | `options.html` |
| `src/background.ts` | Service Worker | background |
| `src/contents/capture.ts` | Content script | all `https?://*/*` |
| `src/contents/floating-panel.tsx` | Content script UI | all `https?://*/*` |
| `src/tabs/new-project.tsx` | Popup page | `tabs/new-project.html` |

Plasmo v0.90+: custom popup pages go in `src/tabs/`, not `src/`.

## Project Structure

```
src/
  components/       # MUI components
  hooks/            # useProjects, useReview, useSrs, useBackupSync, useNewCard
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
sendMessage({ kind: "save-feedback", ... })         // toast on content page
sendMessage({ kind: "set-recent-project", ... })    // update lastOpened
```
Always use `sendMessage()` — never raw `chrome.runtime.sendMessage`.

## CRITICAL Constraints

1. **Background SW has NO DOM APIs** — no `window`, `document`, `alert`, `prompt`, `confirm`. They throw `ReferenceError`.
2. **Right-click saves** (contextMenus.onClicked) cannot compute CSS selectors — `Item.source.selector` is absent. Highlight-based features cannot work for right-click saves.
3. **Project names must be unique** — enforced by `projects` store unique index.
4. **No `window.confirm`** — use MUI `DeleteConfirmDialog` instead.
5. **WebDAV Basic auth** must proxy through background SW (`kind: "webdav"`) to avoid Chrome's native auth dialog.

## Key Conventions

- New UI regions → new file in `src/components/`, not inline in `options.tsx`
- State mgmt stays in `options.tsx` (composition root); child components get data + callbacks via props
- New MUI Dialogs → extend `DialogShell` template (consistent borderRadius, title fontSize, cancel/confirm layout)
- Empty states → `EmptyState` component (not inline Box/Typography)
- Card content rendering → `CardRenderer` with `mode` prop (`preview`|`front`|`back`|`full`|`export`)
- Export image → `ExportButton` component (encapsulates useExportImage + menu + IconButton)
- Item creation → `createItem()` factory in `background.ts` (not inline `id: crypto.randomUUID()` in 3 places)
- `refreshAllData()` wraps `loadProjects()` + `onSearch()` — call for import/sync-download operations
- `~` path alias maps to root (used in imports as `~/src/...`)

## Review (SRS)

- SM-2 algorithm: starting ease 2.5, min 1.3, max interval 365 days
- Review data stored in separate `reviews` store (ReviewEntry with itemId unique index)
- Card must have `Item.title` before it can be added to review
- `rateSrs(srs, 1|2|3|4)` — pure function applying SM-2 to SrsData
- `updateReviewSrs(itemId, srs)` — persists rating to reviews store
- Get due cards via `getDueReviews()` (dueDate index query)
- Ratings: 1=重来, 2=困难, 3=良好, 4=简单
- Cards rated <3 are requeued (trim-queue); >=3 are removed from queue
- Entering review tab auto-loads due cards; leaving discards session state

## Sync

- WebDAV provider: `https://dav.jianguoyun.com/dav/Apps/lime/lime-sync.json`
- Credentials in `chrome.storage.sync` (`syncUsername`, `syncPassword`)
- Conflict: SHA-256 hash comparison → user chooses upload/download (no auto-tiebreaker)
- SyncPayload v3 includes items, projects, and reviews (with stable id-sort for hash)
- `buildPayload(items, projects, reviews)` sorts all arrays by id before hashing
- Context menu project list refreshes via `sendMessage({ kind: "rebuild-menus" })`

## Testing

- `fake-indexeddb` auto-polyfilled in test setup
- Chrome API mocked (`chrome.runtime`, `chrome.storage.local`)
- Tests in `src/database/index.test.ts` and `src/utils/index.test.ts`
- Run: `npm test` (or focused: `npx jest --no-coverage src/path/to/test`)
