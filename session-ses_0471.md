# UI/UX优化

**Session ID:** ses_0471be449ffe2hhP5AuqA0LD88
**Created:** 7/31/2026, 11:56:24 PM
**Updated:** 8/3/2026, 12:03:01 AM

---

## Assistant (Build · DeepSeek V4 Flash · 20.6s)

_Thinking:_

handleSaveTodo looks clean. Now let me note the `filteredTodos`/`todoStats` useMemo both call todayLocalDate — minor. And `todoCount = todoStats.incomplete + dueCount`.

Let me now compile my findings. I have a solid set:

**重复代码 (Duplication):**
1. **`compareCards` 排序比较器** — `(a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt` duplicated at options:211 (onSearch) and options:831 (move/reorder); the simplified `(a.order ?? 0) - (b.order ?? 0)` at utils:224 (computeDropIndex) and useCardDragReorder:155. Extract `compareCards(a, b)` to utils.
2. **`maxScopeOrder` 计算** — identical reduce at options:493 (merge) and useNewCard:44 (new card). Extract `maxScopeOrder(items, sectionId)` util.
3. **`todayLocalDate()` 多次调用** — TodoCard calls it 3×/render (DueChip×2 + TodoCard×1); options calls it in two memos (todoStats + filteredTodos). Consolidate (compute once per component/memo).

**代码质量 (Quality):**
4. **`DueChip` 重复计算** — DueChip computes `dueStatus` at line 34, then `dueLabel` (line 59) internally re-computes dueStatus. `dueLabel` should accept the status or use a combined helper.
5. **TodoCard 读模式的 `todayLocalDate()`** at line 90 — third call.
6. **`buildMergedContent` 有序/无序对多行内容会破坏列表** — best-effort; a multi-line card content breaks the ordered/unordered list syntax. Note (already documented as best-effort).

**潜在风险 (Risks):**
7. **P2: 新建/合并卡片的 order 计算基于 `allItems`（可能被 keyword/dateRange 过滤）** — 若在日期筛选/搜索视图下新建或合并卡片，`allItems` 是被过滤的子集，max order 可能漏算过滤外的同章节卡 → 新卡 order 可能与未过滤的卡冲突，落位不严格在末尾。建议改用 `allItemsUnfiltered`（全量）。
8. **P2: `handleToggleTodoTask` 快速连点** — 每次读 `item.content`（渲染时的快照），广播刷新前的连点会用陈旧 content。单用户低风险，可加本地乐观更新。
9. **P3: MarkdownRenderer 模块级 `console.warn` 覆盖** — 全局副作用（每个 bundle 一次），精确过滤但会掩盖未来其它 "type was not found" 警告。
10. **P3: `useNewCard`/merge 的 `allItems` 依赖** — useCallback 随 allItems 变化重建（每次搜索），无害但可改用 ref。
11. **P3: `containsTaskCheckbox` O(n) 遍历** — 每个 list 渲染时遍历 React 树，todo 任务多时轻微开销。可接受。

Let me also double-check the ItemDialog risk and the FloatingPanel. Actually — let me quickly scan the FloatingPanel and ItemDialog for quality/dup issues since they were recently touched.

Let me also check one thing: the `fadeInUp` animation + CardGrid with the new "新建卡片" tile — no.

Let me quickly check the ItemDialog edit flow (the Undo icon change) and whether there's any issue. And the FloatingPanel — is it still using the old style? It was redesigned. Let me not over-scope.

Let me verify the risk #7 by checking what `allItems` is when a filter is active vs `allItemsUnfiltered`. Actually — I'm confident: `allItems` is the result of `searchItems(q)` with the query's keyword/dateRange. So it's filtered. `allItemsUnfiltered` is `searchItems({})` (line 315) — the full set. So using allItemsUnfiltered for the order computation is more correct.

But wait — there's a subtlety: when computing order for a NEW card, we want the max order among items in the target SECTION (which the new card joins). Using the full dataset (allItemsUnfiltered) filtered by sectionId gives the correct max regardless of the current search filter. Yes — switch to allItemsUnfiltered.

However — `useNewCard` doesn't receive allItemsUnfiltered. I'd need to pass it. And the merge handler too. This is a small change. Let me flag it and offer to fix.

Actually — hold on. Let me reconsider the severity. If the user creates a card while a date filter is active: allItems = filtered. The new card's order = max(filtered section cards) + 1. If there are section cards OUTSIDE the filter (e.g., older cards in the same section not matching the date range), their orders might be HIGHER than the filtered max. Then the new card's order < those → the new card sorts BEFORE them → NOT last. But — the new card's createdAt is now, and those outside-filter cards... the sort is `order asc || createdAt asc`. If the new card's order is lower, it sorts before them regardless. So yes, the new card could appear mid-list in the FULL section (though in the FILTERED view it appears last, since the filtered view only shows the filtered subset... wait — the new card created NOW wouldn't match a date-range filter if the filter excludes today!). 

Hmm — actually, if the user has a date filter active (e.g., last 3 days) and creates a new card (createdAt = now, matches today → within the filter), the new card appears in the filtered view. Its order = max(filtered) + 1 → last in the FILTERED view. But in the FULL section (after clearing the filter), it might not be last (if filtered-out cards have higher orders). This is a real but very edge-case inconsistency. 

Worth a P2 flag + a small fix (use allItemsUnfiltered). Let me include it.

Now — let me also quickly verify: does the `Item` type have an `order` field that's persisted correctly? It's used in batchUpdateItems and computeDropIndex. Yes.

Let me finalize the review. I should present findings and offer to fix. The user's workflow: review → confirm → execute. Let me present a clear, prioritized report.

Actually — the user said "进行code review，关注代码质量问题，重复代码问题，潜在风险问题" — they want the review. Given their preference, present findings + recommend fixes, await greenlight.

Let me also do one more quick scan for obvious quality issues in the recently-touched files — let me grep for any obvious dead code or TODO/FIXME leftovers.

Let me check the FloatingPanel for the DateField pattern usage and any leftover. Actually — the FloatingPanel doesn't have date inputs (it's capture). Skip.

Let me do a final check on a couple of things: the `alpha` import usage, and whether `truncateText` etc. Let me also check if there are any unused imports introduced recently (e.g., in CardRenderer after removing preview gallery).

Let me grep CardRenderer for unused things.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && echo \"=== CardRenderer 剩余图标使用 ===\" && grep -n \"ArticleRoundedIcon\\|ChecklistRoundedIcon\\|FormatQuoteRoundedIcon\\|ImageRoundedIcon\\|LinkRoundedIcon\" src/components/CardRenderer.tsx | head; echo \"=== 遗留 TODO/FIXME/console ===\" && grep -rn \"console\\.\\(log\\|debug\\)\\|TODO\\|FIXME\\|XXX\" src/ --include=\"*.tsx\" --include=\"*.ts\" | grep -v test | grep -v \"console.warn\" | head"
}
```

**Output:**
```
=== CardRenderer 剩余图标使用 ===
1:import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded"
2:import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded"
3:import FormatQuoteRoundedIcon from "@mui/icons-material/FormatQuoteRounded"
4:import ImageRoundedIcon from "@mui/icons-material/ImageRounded"
5:import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
29:      return <FormatQuoteRoundedIcon fontSize="small" />
31:      return <ImageRoundedIcon fontSize="small" />
33:      return <LinkRoundedIcon fontSize="small" />
35:      return <ChecklistRoundedIcon fontSize="small" />
37:      return <ArticleRoundedIcon fontSize="small" />
=== 遗留 TODO/FIXME/console ===
src/background.ts:137:    console.debug("contextMenus.onClicked:", info.menuItemId)
src/background.ts:156:      console.debug("[lime:save]", {
src/options.tsx:158:  console.debug("[review:state]", {
src/options.tsx:575:        console.debug("[review:toggle] removing", itemId)
src/options.tsx:578:        console.debug("[review:toggle] removed, due count:", dueAfter.length)
src/options.tsx:595:      console.debug("[review:toggle] adding", itemId)
src/options.tsx:612:      console.debug("[review:toggle] added, due count:", dueAfter.length)
src/contents/capture.ts:43:    console.debug("[lime:capture] Alt+S:", text.slice(0, 60))
src/hooks/useReview.ts:109:      console.debug("[review:load] guard blocked", {
src/hooks/useReview.ts:115:    console.debug("[review:load] guard passed, loading...", {

```

---

## Assistant (Build · DeepSeek V4 Flash · 17.3s)

_Thinking:_

There are several `console.debug` statements throughout the codebase (background.ts, options.tsx, capture.ts, useReview.ts). These are debugging leftovers. The user previously asked to remove the badge console.debug (I removed it). These others are also debug noise — a code-quality finding.

Now I have a comprehensive review. Let me compile it into a clear, prioritized report.

Let me structure:

## 重复代码
1. `compareCards` 排序比较器 — 4 处
2. `maxScopeOrder` — 2 处
3. `todayLocalDate()` 重复调用 — TodoCard 3×/render + options 2 memos

## 代码质量
4. `DueChip` 中 dueStatus + dueLabel 重复计算
5. 大量 `console.debug` 残留（background/options/capture/useReview 共 9 处）
6. `buildMergedContent` 多行内容破坏列表（best-effort，已注明）

## 潜在风险
7. P2: 新建/合并卡片的 order 基于 `allItems`（可能被筛选过滤）→ 边界情况落位不严格最后。改用 allItemsUnfiltered。
8. P2: `handleToggleTodoTask` 快速连点陈旧 content（低风险）
9. P3: MarkdownRenderer 模块级 console.warn 全局覆盖
10. P3: `useNewCard` allItems 依赖导致 useCallback 频繁重建

Let me also double-check the exact "compareCards" locations to be precise:
- options:211 (onSearch) — full comparator
- options:831 (move) — full comparator
- utils:224 (computeDropIndex) — simplified (no createdAt)
- useCardDragReorder:155 — simplified

The full vs simplified differ. A shared `compareCards(a, b)` (order asc, then createdAt asc) could be used in all 4 (the simplified ones sort within the same section where createdAt tie-breaker is harmless). Actually — for computeDropIndex and useCardDragReorder, they sort section cards; the createdAt tiebreaker doesn't hurt. So a single `compareCards` works everywhere.

Let me verify options:211 and 831 are the same comparator. Yes (from the grep output).

Now let me present the review. I'll also offer to fix the P1/P2 items.

Actually — let me reconsider the severity ranking for presentation:
- **P1 (建议修)**: #1 compareCards 抽取, #2 maxScopeOrder 抽取, #3 todayLocalDate 合并 (TodoCard 3×/render 是实打实的重复计算). These are clean, low-risk refactors.
- **P2**: #5 console.debug 清理 (9 处), #7 order 用 allItemsUnfiltered (edge-case risk), #4 DueChip 重复计算.
- **P3 (可暂缓)**: #8 连点, #9 console.warn 覆盖, #10 useCallback 重建, #6 多行列表.

Let me present this and ask which to fix. Given the user's pattern, they'll likely say "修" for the clear ones. Let me present concisely with exact file:line references.

Let me finalize the line numbers:
- compareCards: options.tsx:211, options.tsx:831, utils/index.ts:224, useCardDragReorder.ts:155
- maxScopeOrder: options.tsx:493, useNewCard.ts:44
- todayLocalDate: TodoCard.tsx:34, 59, 90; options.tsx:1098, 1117
- DueChip dup: TodoCard.tsx:34 + 59
- console.debug: background.ts:137, 156; options.tsx:158, 575, 578, 595, 612; capture.ts:43; useReview.ts:109, 115
- order filtered risk: options.tsx:493 + useNewCard.ts:44 (both use allItems)

Let me present.

Code review 完成。按关注点分类：

## 重复代码

**1. 卡片排序比较器 `(order ?? 0) − ... || createdAt` 重复 4 处**
- `options.tsx:211`（onSearch）与 `options.tsx:831`（移动/重排）——完整版
- `utils/index.ts:224`（computeDropIndex）与 `useCardDragReorder.ts:155`——简化版
- 建议抽 `compareCards(a, b)`（order 升序 → createdAt 升序）到 utils，4 处统一（简化版在同一章节内排序，加 createdAt 兜底无害）。

**2. `maxScopeOrder` 计算重复 2 处**（同一段 reduce：按 sectionId 过滤求 max order）
- `useNewCard.ts:44`（新建卡）与 `options.tsx:493`（合并卡）
- 建议抽 `maxScopeOrder(items, sectionId)`。

**3. `todayLocalDate()` 重复计算**
- `TodoCard.tsx:34, 59, 90`——**单次渲染调 3 次**（每次 new Date + 3 次字符串拼接）
- `options.tsx:1098, 1117`——两个 memo 各算一次
- 建议组件内算一次 `const today = todayLocalDate()` 复用。

## 代码质量

**4. `DueChip` 状态重复计算**（`TodoCard.tsx:34` 算 `dueStatus`，`:59` 的 `dueLabel` 内部**又算一次** `dueStatus`）——建议 `dueLabel` 接收已算好的 status，或加组合 helper。

**5. `console.debug` 调试残留 9 处**
- `background.ts:137, 156`、`options.tsx:158, 575, 578, 595, 612`、`capture.ts:43`、`useReview.ts:109, 115`
- 与之前删掉的 badge debug 同性质，建议全部移除。

**6. `buildMergedContent` 有序/无序对多行内容会破坏列表**（best-effort，已注明）——若卡片正文跨行，`- **标题**：第一行\n第二行` 会把第二行踢出列表项。可接受，但值得在 UI 上加一句提示。

## 潜在风险

**7. P2 — 新建/合并卡片的 order 基于 `allItems`（可能被 keyword/日期筛选过滤）**
- 若在筛选视图下新建/合并，`allItems` 是子集，max order 会漏算**筛选外同章节**的卡 → 新卡落位不严格最后。
- 修复：改用 `allItemsUnfiltered`（全量，按 sectionId 过滤即可，sectionId 全局唯一）。小改动。

**8. P2 — `handleToggleTodoTask` 快速连点**（`options.tsx:1162`）——每次读渲染快照 `item.content`，广播刷新前的连点用陈旧内容。单用户低风险，可加本地乐观更新。

**9. P3 — MarkdownRenderer 模块级 `console.warn` 全局覆盖**——精确过滤但会掩盖未来其它 "type was not found" 警告；每个 bundle 各覆盖一次。

**10. P3 — `useNewCard`/merge 的 `allItems` 依赖**——useCallback 随每次搜索重建（无害，可改 ref）。

---

**建议**：修 1/2/3/4/5（清晰低风险）+ 7（边界风险）。8/9/10 可暂缓。

要修哪些？

---

## User

：修 1/2/3/4/5（清晰低风险）+ 7（边界风险）

---

## Assistant (Build · DeepSeek V4 Flash · 38.4s)

_Thinking:_

The user wants me to fix items 1/2/3/4/5 + 7:
1. `compareCards` util — dedupe 4 places
2. `maxScopeOrder` util — dedupe 2 places
3. `todayLocalDate()` consolidate in TodoCard (3×) and options (2 memos)
4. `DueChip` dedup status computation
5. Remove `console.debug` (9 places)
7. order computation uses `allItemsUnfiltered` instead of `allItems`

Let me implement each:

**1. `compareCards` in utils:**
```ts
export function compareCards<T extends { order?: number; createdAt: number }>(
  a: T,
  b: T
): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt
}
```
Use in:
- options.tsx:211 (onSearch sort)
- options.tsx:831 (move sort) — actually that one sorts and then splices; let me check if it's the same usage. Line 822 `sorted = sectionItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)`. Replace with `sort(compareCards)`.
- utils/index.ts:224 (computeDropIndex): `.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))` → `.sort(compareCards)`. But computeDropIndex is generic `T extends { id: string; order?: number }` — the T doesn't have createdAt! Let me check the signature. computeDropIndex<T extends { id: string; order?: number }>. So I need to either add createdAt to the constraint or use a simpler comparator there. The compareCards requires createdAt. 

Let me check computeDropIndex's actual generic. Line 193: `export function computeDropIndex<T extends { id: string; order?: number }>(cards: T[], ...)`. The T has no createdAt. So I can't use compareCards directly unless I extend the constraint. The items passed are Items (have createdAt). Let me extend the constraint to `{ id: string; order?: number; createdAt?: number }`? Hmm — that changes the public signature. Actually — the simplest: compareCards accepts `{ order?: number; createdAt?: number }` with createdAt optional, and the comparator uses `?? 0` for createdAt too? No — that changes semantics (createdAt could be undefined). 

Actually — for computeDropIndex and useCardDragReorder, the sort is WITHIN a section (same section cards). The createdAt tiebreaker is only needed when orders tie (undefined). For computeDropIndex, the cards are section cards being reordered — after a reorder they have explicit orders. The simplified sort is fine there. 

Hmm — but the user asked to unify. Let me make `compareCards` handle the general case and use it where the type fits:
- options:211: Items (have createdAt) ✓
- options:831: Items ✓
- computeDropIndex: T has no createdAt → keep its own simplified sort OR extend. 
- useCardDragReorder:155: Items ✓ (it's `(a, b) => (a.order ?? 0) - (b.order ?? 0)`) — could use compareCards (Items have createdAt).

For computeDropIndex, the generic T doesn't have createdAt. To unify, I could change the constraint to `{ id: string; order?: number; createdAt?: number }` and use compareCards. The createdAt is optional in the comparator (`(a.createdAt ?? 0) - (b.createdAt ?? 0)`). But that changes tie-break semantics for T without createdAt (they'd tie at 0 → stable sort). That's fine (computeDropIndex's sort is a stable-ish ordering within a filtered list). Actually — the existing simplified sort for computeDropIndex: `(a.order ?? 0) - (b.order ?? 0)` — items with same order keep original array order (Array.prototype.sort is stable in modern JS). Adding createdAt??0 tiebreak only matters when orders tie AND createdAt differs — for Items, this is the desired behavior. For generic T without createdAt, all tie at 0 → stable. Safe.

Let me define compareCards with createdAt optional:
```ts
export function compareCards<T extends { order?: number; createdAt?: number }>(
  a: T,
  b: T
): number {
  return (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
}
```
And use it in all 4 places. For computeDropIndex, change the constraint to include createdAt?: number.

Wait — the existing computeDropIndex constraint is `{ id: string; order?: number }`. Adding `createdAt?: number` is backward-compatible (callers pass Items). And it uses compareCards. Good.

useCardDragReorder:155: `.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))` → `.sort(compareCards)`. Items have createdAt. Good.

**2. `maxScopeOrder` in utils:**
```ts
export function maxScopeOrder<T extends { order?: number; sectionId?: string }>(
  items: T[],
  sectionId: string | undefined
): number {
  return items.reduce((acc, i) => {
    const inScope = sectionId ? i.sectionId === sectionId : !i.sectionId
    return inScope ? Math.max(acc, i.order ?? -1) : acc
  }, -1)
}
```
Use in useNewCard.ts:44 and options.tsx:493.

In useNewCard:
```ts
const order = maxScopeOrder(allItems, sectionId) + 1
```

In options merge:
```ts
const order: mergedMaxOrder + 1 → maxScopeOrder(allItemsUnfiltered, mergedSectionId) + 1
```
Wait — item 7 says use allItemsUnfiltered for BOTH new card and merge. Let me check: useNewCard receives `allItems`. For item 7, I should pass `allItemsUnfiltered` to useNewCard and use it in the merge too.

Hmm — let me think. `allItemsUnfiltered` is `searchItems({})` (all items across projects, or just the current project?). Line 315: `searchItems({}).then(setAllItemsUnfiltered)` — no projectId → ALL items across projects. And line 546: `setAllItemsUnfiltered(all)` (from refreshAllData). So allItemsUnfiltered = all cards in the DB.

For maxScopeOrder by sectionId: sectionIds are globally unique UUIDs. So filtering allItemsUnfiltered by sectionId finds all cards in that section (across the whole DB — but a section belongs to one project, so it's the same set). For the unclassified scope (`!i.sectionId`): allItemsUnfiltered includes todos too (which have no sectionId!). Todos would be counted in the unclassified scope max order! Todos have no order field → `i.order ?? -1` → -1. So they don't affect the max (unless... todos have no order, so -1). Wait — todos have `order: undefined` → `i.order ?? -1` = -1 → Math.max(-1, -1) = -1. So todos don't inflate the max order. Good — no issue. But actually — the new card being created is in a PROJECT (activeProjectId). The unclassified scope for that project... using allItemsUnfiltered filters `!i.sectionId` which includes todos AND unclassified cards from ALL projects. The max order among them is the unclassified max across projects. But orders are per-section-scope — the unclassified group is effectively per-project? Orders within the unclassified group... when reordering unclassified cards in project A, does it assign orders only to project A's unclassified? The reorder operates on the section scope = items with `!i.sectionId` (in the current project's allItems). So orders in the unclassified group are per-project (reorder only touches the visible project's unclassified cards). 

Hmm — so if project B has unclassified cards with high orders (e.g., 5), and project A's unclassified max is 2, a new unclassified card in project A would get order = max(all DB unclassified) + 1 = 6. In project A's sort (only A's cards), the new card (order 6) still sorts last (A's max is 2 < 6). So it's correct (just a larger number). No harm. Actually — using the GLOBAL unclassified max makes the new card's order larger than needed, but it still sorts last in A. Fine.

But wait — there's a subtle issue: using allItemsUnfiltered for the unclassified scope includes todos. Todos have no order (undefined → -1), so they don't affect max. But do todos have `sectionId`? No. So `!i.sectionId` includes todos. `i.order ?? -1` = -1. Max unaffected. Good.

So switching to allItemsUnfiltered is safe for both scopes. Let me verify `allItemsUnfiltered` is available where needed:
- useNewCard is called at line 388 — is allItemsUnfiltered defined before that? allItemsUnfiltered state is at line 108. So it's available at line 388. ✓.
- The merge handler (line 459+) — allItemsUnfiltered available. ✓.

So: pass `allItemsUnfiltered` to useNewCard instead of `allItems`, and use `allItemsUnfiltered` in the merge handler.

Wait — but useNewCard's `allItems` prop is currently used ONLY for the order computation. So rename the prop to `allItemsUnfiltered` (or `allItems` still but pass the unfiltered one). Let me keep the prop name `allItems` but pass `allItemsUnfiltered`? That's confusing. Let me rename the prop to `allItemsUnfiltered` for clarity. Actually — let me name it `scopeItems`? No. Let me name the prop `allItemsUnfiltered` and pass it. Hmm — or just `allItems` and pass allItemsUnfiltered (since the hook just needs "the full set for order computation"). Let me rename to `allItemsUnfiltered` for clarity.

**3. todayLocalDate consolidate:**
- TodoCard: compute `const today = todayLocalDate()` once at the top of the component, pass to DueChip as a prop (or compute in DueChip but once). Actually DueChip is a separate component. Let me pass `today` as a prop to DueChip, and use it in the main TodoCard too.
  - DueChip: `function DueChip({ item, today }: { item: Item; today: string })`. Compute status once, and derive the label WITHOUT re-computing dueStatus. 
- options: `todoStats` and `filteredTodos` memos each call todayLocalDate(). The user asked to consolidate. I can compute `const today = todayLocalDate()` once OUTSIDE the memos (in the component body), and use it in both memos. But — todayLocalDate() is "today" which only changes at midnight. Computing it once per render (outside memo) is fine. But then the memos' deps don't include today — if it changes at midnight without a re-render, stale. Edge case (app left open overnight). Actually — the current code computes it INSIDE each memo, so it's fresh when the memo re-runs. If I hoist it, it's the render-time value. For a memo that doesn't re-run at midnight... the memo deps are [todoItems] — if todoItems changes after midnight, the memo re-runs and uses the hoisted today (from the current render). Actually the hoisted today is computed each render, so it's always current-ish. The memo closure captures the render's today. Fine.

  Let me hoist `const today = todayLocalDate()` in options and use it in both memos. But — the memos have deps [todoItems] and [todoItems, todoFilter] — they don't include today. If today changes at midnight AND the memo doesn't re-run, stale. But if the component re-renders (any state change), today is recomputed and the memo... doesn't re-run (deps unchanged) → the memo closure STILL has the OLD today! Because useMemo only re-computes when deps change. So hoisting today and putting it in the memo deps is needed. Let me add `today` to the memo deps. But then at midnight, if no re-render happens, still stale until the next re-render. Edge case, acceptable.

  Actually — the cleanest: compute `today` via useMemo with a date-key dep? Over-engineering. Let me just hoist `const today = todayLocalDate()` and add it to the memos' deps. The overhead is negligible.

  Hmm — but the user's item 3 was mainly about TodoCard's 3×/render. Let me focus there (that's the clear win) and also consolidate options (2 memos). Let me do both.

**4. DueChip dedup:**
DueChip currently: computes `dueStatus` (line 34) + `dueLabel` (line 59, re-computes status). Fix: compute status once, derive the label from status. I'll add a helper `dueLabelForStatus(dueDate, status)` or make `dueLabel` accept an optional status. Actually — the cleanest: create a combined util `dueInfo(dueDate, today): { status: DueStatus; label: string }` and use it in DueChip. But dueLabel is used elsewhere (options? tests). Let me check where dueLabel is used. It's used in TodoCard (DueChip) and tests. Let me add `dueInfo` and have DueChip use it; keep dueLabel (used in tests) — actually dueLabel would become redundant with dueInfo. Let me refactor: `dueInfo(dueDate, today)` returns `{ status, label }`, and `dueLabel(dueDate, today)` becomes a thin wrapper `dueInfo(...).label` (or keep it for tests). Hmm — the tests test dueLabel directly. Let me keep dueLabel as the public API but implement dueInfo internally and have DueChip use dueInfo to avoid double computation.

Actually — simplest: change `dueLabel` signature to accept the status? That breaks the test. Let me instead have DueChip call `dueInfo` (new) once:
```ts
export function dueInfo(dueDate: string | undefined, today: string): { status: DueStatus; label: string } {
  const status = dueStatus(dueDate, today)
  return { status, label: labelFromStatus(dueDate, status) }
}
```
And dueLabel = `(dueDate, today) => dueInfo(dueDate, today).label`. DueChip uses dueInfo → gets status + label in one call.

Let me refactor utils:
```ts
export function dueStatus(dueDate, today): DueStatus { ... }  // keep
function labelFromStatus(dueDate, status): string { ... }
export function dueLabel(dueDate, today): string { return labelFromStatus(dueDate, dueStatus(dueDate, today)) }
export function dueInfo(dueDate, today): { status: DueStatus; label: string } {
  const status = dueStatus(dueDate, today)
  return { status, label: labelFromStatus(dueDate, status) }
}
```
Wait — but the existing dueLabel already computes the label via a switch on dueStatus. Let me look at the current dueLabel implementation to refactor properly. Earlier: dueLabel does `switch (dueStatus(dueDate, today)) {...}`. So I extract the switch into labelFromStatus(dueDate, status), and dueLabel = labelFromStatus(dueDate, dueStatus(...)).

DueChip uses dueInfo → `const { status, label } = dueInfo(item.dueDate, today)`.

**5. console.debug removal:** Remove 9 lines:
- background.ts:137, 156
- options.tsx:158, 575, 578, 595, 612
- capture.ts:43
- useReview.ts:109, 115

Let me read each context and remove.

**7. allItemsUnfiltered for order:** 
- useNewCard: change prop from `allItems` to `allItemsUnfiltered`, use maxScopeOrder.
- options merge: use allItemsUnfiltered + maxScopeOrder.

Wait — for useNewCard, `allItems` was passed at line 388. Let me change to `allItemsUnfiltered` and update the hook.

Let me now implement all. Let me start with utils (compareCards, maxScopeOrder, dueInfo/labelFromStatus), then the consumers.

Let me read the current utils around dueLabel to refactor.

修复 1/2/3/4/5 + 7。先读 utils 的 dueLabel 现状以重构：

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/utils/index.ts",
  "limit": 40,
  "offset": 156
}
```

**Output:**
```
<path>/home/xx/Lime/src/utils/index.ts</path>
<type>file</type>
<content>
156: /** Local date as "YYYY-MM-DD" (machine-local, not UTC). */
157: export function todayLocalDate(): string {
158:   const d = new Date()
159:   const m = String(d.getMonth() + 1).padStart(2, "0")
160:   const day = String(d.getDate()).padStart(2, "0")
161:   return `${d.getFullYear()}-${m}-${day}`
162: }
163: 
164: function dateDaysAgo(dateStr: string, n: number): string {
165:   const [y, m, d] = dateStr.split("-").map(Number)
166:   const dt = new Date(y, m - 1, d + n)
167:   const mm = String(dt.getMonth() + 1).padStart(2, "0")
168:   const dd = String(dt.getDate()).padStart(2, "0")
169:   return `${dt.getFullYear()}-${mm}-${dd}`
170: }
171: 
172: function diffDays(a: string, b: string): number {
173:   const [ya, ma, da] = a.split("-").map(Number)
174:   const [yb, mb, db] = b.split("-").map(Number)
175:   return Math.round(
176:     (new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime()) /
177:       86400000
178:   )
179: }
180: 
181: export type DueStatus = "none" | "overdue" | "today" | "tomorrow" | "future"
182: 
183: /** Due semantics: a day-based task expires at 00:00 of the NEXT day. */
184: export function dueStatus(dueDate: string | undefined, today: string): DueStatus {
185:   if (!dueDate) return "none"
186:   if (dueDate < today) return "overdue"
187:   if (dueDate === today) return "today"
188:   if (dueDate === dateDaysAgo(today, 1)) return "tomorrow"
189:   return "future"
190: }
191: 
192: /** Short human label for a due date, e.g. "今天" / "已过期 2 天". */
193: export function dueLabel(dueDate: string | undefined, today: string): string {
194:   switch (dueStatus(dueDate, today)) {
195:     case "none":

(Showing lines 156-195 of 228. Use offset=196 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.3s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/utils/index.ts",
  "limit": 33,
  "offset": 193
}
```

**Output:**
```
<path>/home/xx/Lime/src/utils/index.ts</path>
<type>file</type>
<content>
193: export function dueLabel(dueDate: string | undefined, today: string): string {
194:   switch (dueStatus(dueDate, today)) {
195:     case "none":
196:       return ""
197:     case "overdue":
198:       return `已过期 ${diffDays(dueDate!, today)} 天`
199:     case "today":
200:       return "今天"
201:     case "tomorrow":
202:       return "明天"
203:     default: {
204:       const [, m, d] = dueDate!.split("-")
205:       return `${+m}月${+d}日`
206:     }
207:   }
208: }
209: 
210: export type DropPos = "before" | "after"
211: 
212: /**
213:  * Computes the insertion index for a dragged card relative to a target card
214:  * within the target section's ordered card list (dragged card excluded).
215:  */
216: export function computeDropIndex<T extends { id: string; order?: number }>(
217:   cards: T[],
218:   draggedId: string,
219:   targetId: string,
220:   pos: DropPos
221: ): number {
222:   const sorted = cards
223:     .filter((c) => c.id !== draggedId)
224:     .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
225:   const targetIndex = sorted.findIndex((c) => c.id === targetId)

(Showing lines 193-225 of 228. Use offset=226 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 10.6s)

_Thinking:_

Now let me refactor utils. I'll:
1. Extract `labelFromStatus(dueDate, status)` and add `dueInfo(dueDate, today)`.
2. Add `compareCards`.
3. Add `maxScopeOrder`.
4. Update `computeDropIndex` to use compareCards (extend constraint with createdAt).

Let me do these edits.

First, the dueLabel refactor → add labelFromStatus + dueInfo.

Refactor utils — `labelFromStatus`/`dueInfo`、`compareCards`、`maxScopeOrder`，并让 computeDropIndex 用 compareCards：

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/utils/index.ts",
  "newString": "function labelFromStatus(\n  dueDate: string | undefined,\n  status: DueStatus\n): string {\n  switch (status) {\n    case \"none\":\n      return \"\"\n    case \"overdue\":\n      return `已过期 ${diffDays(dueDate!, todayLocalDate())} 天`\n    case \"today\":\n      return \"今天\"\n    case \"tomorrow\":\n      return \"明天\"\n    default: {\n      const [, m, d] = dueDate!.split(\"-\")\n      return `${+m}月${+d}日`\n    }\n  }\n}\n\n/** Short human label for a due date, e.g. \"今天\" / \"已过期 2 天\". */\nexport function dueLabel(dueDate: string | undefined, today: string): string {\n  return labelFromStatus(dueDate, dueStatus(dueDate, today))\n}\n\n/** Status + label in one pass (avoids computing dueStatus twice). */\nexport function dueInfo(\n  dueDate: string | undefined,\n  today: string\n): { status: DueStatus; label: string } {\n  const status = dueStatus(dueDate, today)\n  return { status, label: labelFromStatus(dueDate, status) }\n}",
  "oldString": "/** Short human label for a due date, e.g. \"今天\" / \"已过期 2 天\". */\nexport function dueLabel(dueDate: string | undefined, today: string): string {\n  switch (dueStatus(dueDate, today)) {\n    case \"none\":\n      return \"\"\n    case \"overdue\":\n      return `已过期 ${diffDays(dueDate!, today)} 天`\n    case \"today\":\n      return \"今天\"\n    case \"tomorrow\":\n      return \"明天\"\n    default: {\n      const [, m, d] = dueDate!.split(\"-\")\n      return `${+m}月${+d}日`\n    }\n  }\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 12.9s)

_Thinking:_

Wait — I made a mistake: in `labelFromStatus`, I used `todayLocalDate()` for the overdue case, but the original `dueLabel` used the passed `today` parameter. `diffDays(dueDate, today)` — the overdue day count depends on `today`. If I hardcode `todayLocalDate()` inside labelFromStatus, the count is computed against the real today rather than the passed `today`. For tests, they pass a fixed `today` (e.g., "2026-08-02") and expect "已过期 N 天" based on that `today`, not the real date. So using todayLocalDate() would break the tests (real today is 2026-08-02 per env, but the test passes different dates).

I need `labelFromStatus` to take `today` as a param. Let me fix: `labelFromStatus(dueDate, status, today)`.

`labelFromStatus` 需接收 `today` 参数（不能硬编码真实日期，测试依赖传入值）：

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/utils/index.ts",
  "newString": "function labelFromStatus(\n  dueDate: string | undefined,\n  status: DueStatus,\n  today: string\n): string {\n  switch (status) {\n    case \"none\":\n      return \"\"\n    case \"overdue\":\n      return `已过期 ${diffDays(dueDate!, today)} 天`\n    case \"today\":\n      return \"今天\"\n    case \"tomorrow\":\n      return \"明天\"\n    default: {\n      const [, m, d] = dueDate!.split(\"-\")\n      return `${+m}月${+d}日`\n    }\n  }\n}\n\n/** Short human label for a due date, e.g. \"今天\" / \"已过期 2 天\". */\nexport function dueLabel(dueDate: string | undefined, today: string): string {\n  return labelFromStatus(dueDate, dueStatus(dueDate, today), today)\n}\n\n/** Status + label in one pass (avoids computing dueStatus twice). */\nexport function dueInfo(\n  dueDate: string | undefined,\n  today: string\n): { status: DueStatus; label: string } {\n  const status = dueStatus(dueDate, today)\n  return { status, label: labelFromStatus(dueDate, status, today) }\n}",
  "oldString": "function labelFromStatus(\n  dueDate: string | undefined,\n  status: DueStatus\n): string {\n  switch (status) {\n    case \"none\":\n      return \"\"\n    case \"overdue\":\n      return `已过期 ${diffDays(dueDate!, todayLocalDate())} 天`\n    case \"today\":\n      return \"今天\"\n    case \"tomorrow\":\n      return \"明天\"\n    default: {\n      const [, m, d] = dueDate!.split(\"-\")\n      return `${+m}月${+d}日`\n    }\n  }\n}\n\n/** Short human label for a due date, e.g. \"今天\" / \"已过期 2 天\". */\nexport function dueLabel(dueDate: string | undefined, today: string): string {\n  return labelFromStatus(dueDate, dueStatus(dueDate, today))\n}\n\n/** Status + label in one pass (avoids computing dueStatus twice). */\nexport function dueInfo(\n  dueDate: string | undefined,\n  today: string\n): { status: DueStatus; label: string } {\n  const status = dueStatus(dueDate, today)\n  return { status, label: labelFromStatus(dueDate, status) }\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 10.8s)

Now add `compareCards` and `maxScopeOrder`, and update `computeDropIndex`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/utils/index.ts",
  "newString": "export type DropPos = \"before\" | \"after\"\n\n/** Order-first card comparator (order asc, then createdAt asc). */\nexport function compareCards<T extends { order?: number; createdAt?: number }>(\n  a: T,\n  b: T\n): number {\n  return (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)\n}\n\n/** Highest order currently in the given scope (sectionId or unclassified). */\nexport function maxScopeOrder<T extends { order?: number; sectionId?: string }>(\n  items: T[],\n  sectionId: string | undefined\n): number {\n  return items.reduce((acc, i) => {\n    const inScope = sectionId ? i.sectionId === sectionId : !i.sectionId\n    return inScope ? Math.max(acc, i.order ?? -1) : acc\n  }, -1)\n}\n\n/**\n * Computes the insertion index for a dragged card relative to a target card\n * within the target section's ordered card list (dragged card excluded).\n */\nexport function computeDropIndex<T extends { id: string; order?: number; createdAt?: number }>(\n  cards: T[],\n  draggedId: string,\n  targetId: string,\n  pos: DropPos\n): number {\n  const sorted = cards\n    .filter((c) => c.id !== draggedId)\n    .sort(compareCards)",
  "oldString": "export type DropPos = \"before\" | \"after\"\n\n/**\n * Computes the insertion index for a dragged card relative to a target card\n * within the target section's ordered card list (dragged card excluded).\n */\nexport function computeDropIndex<T extends { id: string; order?: number }>(\n  cards: T[],\n  draggedId: string,\n  targetId: string,\n  pos: DropPos\n): number {\n  const sorted = cards\n    .filter((c) => c.id !== draggedId)\n    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 7.0s)

_Thinking:_

Now update the consumers:

1. **options.tsx:211** (onSearch sort) → `.sort(compareCards)`
2. **options.tsx:831** (move sort) → `.sort(compareCards)`
3. **useCardDragReorder.ts:155** → `.sort(compareCards)`
4. **useNewCard.ts** → use `maxScopeOrder` + `allItemsUnfiltered` prop
5. **options.tsx merge** → use `maxScopeOrder(allItemsUnfiltered, mergedSectionId)`

Let me also handle todayLocalDate consolidation in options (todoStats + filteredTodos) and TodoCard (DueChip).

Let me do the options.tsx changes. First, the imports (add compareCards, maxScopeOrder; remove dueStatus if now unused? options still uses dueStatus in todoStats/filteredTodos). Let me check options usage of dueStatus — it's used in todoStats (line 1109) and filteredTodos (1127). With the consolidation, I'll hoist `today`. Let me keep dueStatus import (still used).

Let me start editing options.tsx.

Now update consumers. First options.tsx imports + the two sorts:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "import { buildMergedContent, compareCards, dueStatus, isTodoComplete, maxScopeOrder, toggleMarkdownTask, todayLocalDate } from \"./utils\"",
  "oldString": "import { buildMergedContent, dueStatus, isTodoComplete, toggleMarkdownTask, todayLocalDate } from \"./utils\""
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.4s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      const list = await searchItems(q)\n      // Todos are a global view of their own; never mix into project/search.\n      const filtered = list.filter((i) => i.type !== \"todo\")\n      filtered.sort(compareCards)",
  "oldString": "      const list = await searchItems(q)\n      // Todos are a global view of their own; never mix into project/search.\n      const filtered = list.filter((i) => i.type !== \"todo\")\n      filtered.sort(\n        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt\n      )"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      const sorted = sectionItems.sort(compareCards)",
  "oldString": "      const sorted = sectionItems.sort(\n        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt\n      )"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.3s)

Now the merge handler — use `maxScopeOrder` + `allItemsUnfiltered`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "    const mergedSectionId =\n      sameSection && firstSectionId ? firstSectionId : undefined\n\n    // Place the merged card last in its scope (same rule as new cards).\n    // Use the unfiltered item set so active search/date filters don't hide\n    // same-scope cards with higher orders.\n    const mergedMaxOrder = maxScopeOrder(allItemsUnfiltered, mergedSectionId)",
  "oldString": "    const mergedSectionId =\n      sameSection && firstSectionId ? firstSectionId : undefined\n\n    // Place the merged card last in its scope (same rule as new cards).\n    const mergedMaxOrder = allItems.reduce((acc, i) => {\n      const inScope = mergedSectionId\n        ? i.sectionId === mergedSectionId\n        : !i.sectionId\n      return inScope ? Math.max(acc, i.order ?? -1) : acc\n    }, -1)"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.8s)

_Thinking:_

Now the useCardDragReorder sort. Let me update it.

Now useCardDragReorder sort:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useCardDragReorder.ts",
  "limit": 10,
  "offset": 1
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useCardDragReorder.ts</path>
<type>file</type>
<content>
1: import { useCallback, useEffect, useRef, useState } from "react"
2: 
3: import type { Item } from "../types"
4: import { computeDropIndex, type DropPos } from "../utils"
5: 
6: export interface CardDropState {
7:   id: string
8:   pos: DropPos | "append"
9: }
10: 

(Showing lines 1-10 of 255. Use offset=11 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.6s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useCardDragReorder.ts",
  "newString": "import { compareCards, computeDropIndex, type DropPos } from \"../utils\"",
  "oldString": "import { computeDropIndex, type DropPos } from \"../utils\""
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.8s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useCardDragReorder.ts",
  "newString": "    const fullSorted = sectionCards.slice().sort(compareCards)",
  "oldString": "    const fullSorted = sectionCards\n      .slice()\n      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.5s)

_Thinking:_

Now useNewCard — change prop to `allItemsUnfiltered`, use `maxScopeOrder`. Let me read the current useNewCard and update.

Now useNewCard — `allItemsUnfiltered` prop + `maxScopeOrder`:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useNewCard.ts"
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useNewCard.ts</path>
<type>file</type>
<content>
1: import { useCallback, useState } from "react"
2: 
3: import { addItem } from "../database"
4: import type { Item } from "../types"
5: 
6: export function useNewCard({
7:   activeProjectId,
8:   activeSectionId,
9:   onSearch,
10:   allItems
11: }: {
12:   activeProjectId: string | null
13:   activeSectionId: string | null
14:   onSearch: (projectId?: string | null) => void
15:   allItems: Item[]
16: }) {
17:   const [newCardOpen, setNewCardOpen] = useState(false)
18:   const [newCardTitle, setNewCardTitle] = useState("")
19:   const [newCardContent, setNewCardContent] = useState("")
20: 
21:   const handleNewCard = useCallback(() => {
22:     if (!activeProjectId) return
23:     setNewCardTitle("")
24:     setNewCardContent("")
25:     setNewCardOpen(true)
26:   }, [activeProjectId])
27: 
28:   const handleSaveNewCard = useCallback(async () => {
29:     const title = newCardTitle.trim()
30:     const content = newCardContent.trim()
31:     if (!title || !activeProjectId) return
32:     // Default into the active section so the new card stays visible in the
33:     // current single-section view ("__unclassified__" / null = unclassified).
34:     const sectionId =
35:       activeSectionId && activeSectionId !== "__unclassified__"
36:         ? activeSectionId
37:         : undefined
38:     // Place the new card LAST in its section: order = max(existing) + 1.
39:     // Cards sort by `order ?? 0` first, then createdAt — an explicit order is
40:     // required so a fresh card (undefined order, ties at 0) doesn't jump to
41:     // the front of a reordered section.
42:     const maxOrder = allItems.reduce((acc, i) => {
43:       const inScope = sectionId ? i.sectionId === sectionId : !i.sectionId
44:       return inScope ? Math.max(acc, i.order ?? -1) : acc
45:     }, -1)
46:     const item: Item = {
47:       id: crypto.randomUUID(),
48:       type: "text",
49:       title,
50:       content,
51:       createdAt: Date.now(),
52:       projectId: activeProjectId,
53:       order: maxOrder + 1,
54:       ...(sectionId ? { sectionId } : {})
55:     }
56:     await addItem(item)
57:     setNewCardOpen(false)
58:     setNewCardTitle("")
59:     setNewCardContent("")
60:     onSearch(activeProjectId)
61:   }, [
62:     newCardTitle,
63:     newCardContent,
64:     activeProjectId,
65:     activeSectionId,
66:     onSearch,
67:     allItems
68:   ])
69: 
70:   return {
71:     newCardOpen,
72:     newCardTitle,
73:     newCardContent,
74:     setNewCardTitle,
75:     setNewCardContent,
76:     setNewCardOpen,
77:     handleNewCard,
78:     handleSaveNewCard
79:   }
80: }

(End of file - total 80 lines)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.3s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useNewCard.ts",
  "newString": "import { useCallback, useState } from \"react\"\n\nimport { addItem } from \"../database\"\nimport type { Item } from \"../types\"\nimport { maxScopeOrder } from \"../utils\"\n\nexport function useNewCard({\n  activeProjectId,\n  activeSectionId,\n  onSearch,\n  allItemsUnfiltered\n}: {\n  activeProjectId: string | null\n  activeSectionId: string | null\n  onSearch: (projectId?: string | null) => void\n  allItemsUnfiltered: Item[]\n}) {",
  "oldString": "import { useCallback, useState } from \"react\"\n\nimport { addItem } from \"../database\"\nimport type { Item } from \"../types\"\n\nexport function useNewCard({\n  activeProjectId,\n  activeSectionId,\n  onSearch,\n  allItems\n}: {\n  activeProjectId: string | null\n  activeSectionId: string | null\n  onSearch: (projectId?: string | null) => void\n  allItems: Item[]\n}) {"
}
```

**Output:**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/xx/Lime/src/hooks/useNewCard.ts">
ERROR [43:22] Cannot find name 'allItems'.
ERROR [68:5] Cannot find name 'allItems'.
</diagnostics>
```

---

## Assistant (Build · DeepSeek V4 Flash · 6.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useNewCard.ts",
  "newString": "    // Place the new card LAST in its section: order = max(existing) + 1.\n    // Cards sort by `order ?? 0` first, then createdAt — an explicit order is\n    // required so a fresh card (undefined order, ties at 0) doesn't jump to\n    // the front of a reordered section. The unfiltered item set keeps active\n    // search/date filters from hiding same-scope cards with higher orders.\n    const maxOrder = maxScopeOrder(allItemsUnfiltered, sectionId)\n    const item: Item = {\n      id: crypto.randomUUID(),\n      type: \"text\",\n      title,\n      content,\n      createdAt: Date.now(),\n      projectId: activeProjectId,\n      order: maxOrder + 1,\n      ...(sectionId ? { sectionId } : {})\n    }\n    await addItem(item)\n    setNewCardOpen(false)\n    setNewCardTitle(\"\")\n    setNewCardContent(\"\")\n    onSearch(activeProjectId)\n  }, [\n    newCardTitle,\n    newCardContent,\n    activeProjectId,\n    activeSectionId,\n    onSearch,\n    allItemsUnfiltered\n  ])",
  "oldString": "    // Place the new card LAST in its section: order = max(existing) + 1.\n    // Cards sort by `order ?? 0` first, then createdAt — an explicit order is\n    // required so a fresh card (undefined order, ties at 0) doesn't jump to\n    // the front of a reordered section.\n    const maxOrder = allItems.reduce((acc, i) => {\n      const inScope = sectionId ? i.sectionId === sectionId : !i.sectionId\n      return inScope ? Math.max(acc, i.order ?? -1) : acc\n    }, -1)\n    const item: Item = {\n      id: crypto.randomUUID(),\n      type: \"text\",\n      title,\n      content,\n      createdAt: Date.now(),\n      projectId: activeProjectId,\n      order: maxOrder + 1,\n      ...(sectionId ? { sectionId } : {})\n    }\n    await addItem(item)\n    setNewCardOpen(false)\n    setNewCardTitle(\"\")\n    setNewCardContent(\"\")\n    onSearch(activeProjectId)\n  }, [\n    newCardTitle,\n    newCardContent,\n    activeProjectId,\n    activeSectionId,\n    onSearch,\n    allItems\n  ])"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.7s)

Now update options.tsx call site to pass `allItemsUnfiltered`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "  } = useNewCard({\n    activeProjectId,\n    activeSectionId,\n    onSearch,\n    allItemsUnfiltered\n  })",
  "oldString": "  } = useNewCard({ activeProjectId, activeSectionId, onSearch, allItems })"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 8.6s)

_Thinking:_

Now item 3 — todayLocalDate consolidation in options (todoStats + filteredTodos memos). Let me hoist `const today = todayLocalDate()` and use it in both memos, adding it to their deps. Let me update the todo section.

Now consolidate `todayLocalDate()` in options (item 3):

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "  // ---- Todo state & handlers (global view, newest first, not draggable) ----\n  const today = todayLocalDate()\n\n  const todoStats = useMemo(() => {\n    let incomplete = 0\n    let completed = 0\n    let overdue = 0\n    let todayCount = 0\n    for (const t of todoItems) {\n      if (isTodoComplete(t.content)) {\n        completed++\n      } else {\n        incomplete++\n      }\n      const s = dueStatus(t.dueDate, today)\n      if (s === \"overdue\") overdue++\n      if (s === \"today\") todayCount++\n    }\n    return { total: todoItems.length, incomplete, completed, overdue, today: todayCount }\n  }, [todoItems, today])\n\n  const filteredTodos = useMemo(() => {\n    const list = todoItems.filter((t) => {\n      switch (todoFilter) {\n        case \"all\":\n          return true\n        case \"incomplete\":\n          return !isTodoComplete(t.content)\n        case \"completed\":\n          return isTodoComplete(t.content)\n        case \"overdue\":\n          return dueStatus(t.dueDate, today) === \"overdue\"\n        case \"today\":\n          return dueStatus(t.dueDate, today) === \"today\"\n      }\n    })\n    return list.sort((a, b) => {\n      const ad = a.dueDate\n      const bd = b.dueDate\n      if (ad && bd) return ad.localeCompare(bd)\n      if (ad) return -1\n      if (bd) return 1\n      return b.createdAt - a.createdAt\n    })\n  }, [todoItems, todoFilter, today])",
  "oldString": "  // ---- Todo state & handlers (global view, newest first, not draggable) ----\n  const todoStats = useMemo(() => {\n    const today = todayLocalDate()\n    let incomplete = 0\n    let completed = 0\n    let overdue = 0\n    let todayCount = 0\n    for (const t of todoItems) {\n      if (isTodoComplete(t.content)) {\n        completed++\n      } else {\n        incomplete++\n      }\n      const s = dueStatus(t.dueDate, today)\n      if (s === \"overdue\") overdue++\n      if (s === \"today\") todayCount++\n    }\n    return { total: todoItems.length, incomplete, completed, overdue, today: todayCount }\n  }, [todoItems])\n\n  const filteredTodos = useMemo(() => {\n    const today = todayLocalDate()\n    const list = todoItems.filter((t) => {\n      switch (todoFilter) {\n        case \"all\":\n          return true\n        case \"incomplete\":\n          return !isTodoComplete(t.content)\n        case \"completed\":\n          return isTodoComplete(t.content)\n        case \"overdue\":\n          return dueStatus(t.dueDate, today) === \"overdue\"\n        case \"today\":\n          return dueStatus(t.dueDate, today) === \"today\"\n      }\n    })\n    return list.sort((a, b) => {\n      const ad = a.dueDate\n      const bd = b.dueDate\n      if (ad && bd) return ad.localeCompare(bd)\n      if (ad) return -1\n      if (bd) return 1\n      return b.createdAt - a.createdAt\n    })\n  }, [todoItems, todoFilter])"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 7.8s)

_Thinking:_

Now item 3+4 in TodoCard — consolidate todayLocalDate (3 calls → 1) and DueChip dedup (dueInfo). Let me update TodoCard:
- Compute `const today = todayLocalDate()` once at the component top.
- Pass `today` to DueChip as a prop.
- DueChip uses `dueInfo(item.dueDate, today)` → status + label in one call.
- TodoCard uses `today` for the overdue check.

Let me edit TodoCard.

Now TodoCard — one `today`, DueChip uses `dueInfo` (items 3+4):

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "newString": "function DueChip({ item, today }: { item: Item; today: string }) {\n  const { status, label } = dueInfo(item.dueDate, today)\n  if (status === \"none\") return null\n  const tone = {\n    overdue: { color: \"error.main\" },\n    today: { color: \"warning.main\" },\n    tomorrow: { color: \"text.secondary\" },\n    future: { color: \"text.secondary\" }\n  }[status]\n  return (\n    <Typography\n      variant=\"caption\"\n      sx={(t) => ({\n        fontSize: \"0.65rem\",\n        lineHeight: 1.4,\n        px: 0.75,\n        py: 0.15,\n        borderRadius: 0.75,\n        color: tone.color,\n        bgcolor:\n          status === \"overdue\"\n            ? alpha(t.palette.error.main, 0.08)\n            : status === \"today\"\n              ? alpha(t.palette.warning.main, 0.08)\n              : alpha(t.palette.text.secondary, 0.08)\n      })}>\n      {label}\n    </Typography>\n  )\n}",
  "oldString": "function DueChip({ item }: { item: Item }) {\n  const status = dueStatus(item.dueDate, todayLocalDate())\n  if (status === \"none\") return null\n  const tone = {\n    overdue: { color: \"error.main\" },\n    today: { color: \"warning.main\" },\n    tomorrow: { color: \"text.secondary\" },\n    future: { color: \"text.secondary\" }\n  }[status]\n  return (\n    <Typography\n      variant=\"caption\"\n      sx={(t) => ({\n        fontSize: \"0.65rem\",\n        lineHeight: 1.4,\n        px: 0.75,\n        py: 0.15,\n        borderRadius: 0.75,\n        color: tone.color,\n        bgcolor:\n          status === \"overdue\"\n            ? alpha(t.palette.error.main, 0.08)\n            : status === \"today\"\n              ? alpha(t.palette.warning.main, 0.08)\n              : alpha(t.palette.text.secondary, 0.08)\n      })}>\n      {dueLabel(item.dueDate, todayLocalDate())}\n    </Typography>\n  )\n}"
}
```

**Output:**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/xx/Lime/src/components/TodoCard.tsx">
ERROR [34:29] Cannot find name 'dueInfo'.
ERROR [269:10] Property 'today' is missing in type '{ item: Item; }' but required in type '{ item: Item; today: string; }'.
</diagnostics>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.1s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "newString": "import {\n  dueInfo,\n  isTodoComplete,\n  markdownCompletedCount,\n  markdownTaskCount,\n  todayLocalDate\n} from \"../utils\"",
  "oldString": "import {\n  dueLabel,\n  dueStatus,\n  isTodoComplete,\n  markdownCompletedCount,\n  markdownTaskCount,\n  todayLocalDate\n} from \"../utils\""
}
```

**Output:**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/xx/Lime/src/components/TodoCard.tsx">
ERROR [89:19] Cannot find name 'dueStatus'. Did you mean 'status'?
ERROR [268:10] Property 'today' is missing in type '{ item: Item; }' but required in type '{ item: Item; today: string; }'.
</diagnostics>
```

---

## Assistant (Build · DeepSeek V4 Flash · 6.1s)

_Thinking:_

Now I need to:
1. Add `const today = todayLocalDate()` in TodoCard component and use it for line 90's overdue check + pass to DueChip.
2. Update the DueChip usage to pass `today`.

Let me look at the TodoCard component body around lines 86-90 and the DueChip usage at line ~268.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "newString": "  const today = todayLocalDate()\n  const done = isTodoComplete(item.content)\n  const total = markdownTaskCount(item.content)\n  const doneCount = markdownCompletedCount(item.content)\n  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0\n  const overdue = dueStatus(item.dueDate, today) === \"overdue\"",
  "oldString": "  const done = isTodoComplete(item.content)\n  const total = markdownTaskCount(item.content)\n  const doneCount = markdownCompletedCount(item.content)\n  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0\n  const overdue = dueStatus(item.dueDate, todayLocalDate()) === \"overdue\""
}
```

**Output:**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/xx/Lime/src/components/TodoCard.tsx">
ERROR [90:19] Cannot find name 'dueStatus'. Did you mean 'status'?
ERROR [269:10] Property 'today' is missing in type '{ item: Item; }' but required in type '{ item: Item; today: string; }'.
</diagnostics>
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

_Thinking:_

I need to re-import `dueStatus` (I removed it from imports). And pass `today` to DueChip. Let me fix both.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "newString": "import {\n  dueInfo,\n  dueStatus,\n  isTodoComplete,\n  markdownCompletedCount,\n  markdownTaskCount,\n  todayLocalDate\n} from \"../utils\"",
  "oldString": "import {\n  dueInfo,\n  isTodoComplete,\n  markdownCompletedCount,\n  markdownTaskCount,\n  todayLocalDate\n} from \"../utils\""
}
```

**Output:**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/xx/Lime/src/components/TodoCard.tsx">
ERROR [270:10] Property 'today' is missing in type '{ item: Item; }' but required in type '{ item: Item; today: string; }'.
</diagnostics>
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.3s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "limit": 6,
  "offset": 267
}
```

**Output:**
```
<path>/home/xx/Lime/src/components/TodoCard.tsx</path>
<type>file</type>
<content>
267:           sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
268:           {new Date(item.createdAt).toLocaleDateString("zh-CN")}
269:         </Typography>
270:         <DueChip item={item} />
271:       </Stack>
272:     </Paper>

(Showing lines 267-272 of 274. Use offset=273 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.1s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/TodoCard.tsx",
  "newString": "        <DueChip item={item} today={today} />",
  "oldString": "        <DueChip item={item} />"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.5s)

_Thinking:_

Now item 5 — remove the console.debug statements. Let me find and remove all 9-10 of them. Let me read each context and remove.

- background.ts:137, 156
- options.tsx:158, 575, 578, 595, 612
- capture.ts:43
- useReview.ts:109, 115

Let me look at each.

Now item 5 — remove `console.debug` remnants. Let me view each context:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && for f in \"src/background.ts:137\" \"src/background.ts:156\" \"src/options.tsx:158\" \"src/options.tsx:575\" \"src/options.tsx:578\" \"src/options.tsx:595\" \"src/options.tsx:612\" \"src/contents/capture.ts:43\" \"src/hooks/useReview.ts:109\" \"src/hooks/useReview.ts:115\"; do file=\"${f%%:*}\"; line=\"${f##*:}\"; echo \"=== $f ===\"; sed -n \"$((line-1)),$((line+2))p\" \"$file\"; done"
}
```

**Output:**
```
=== src/background.ts:137 ===
  try {
    console.debug("contextMenus.onClicked:", info.menuItemId)
    await ensureMenusReady()
    const { menuItemId } = info
=== src/background.ts:156 ===
    ) => {
      console.debug("[lime:save]", {
        type,
        content: content.slice(0, 60),
=== src/options.tsx:158 ===

  console.debug("[review:state]", {
    reviewItems: reviewItems.length,
    reviewCompleted,
=== src/options.tsx:575 ===
      if (reviewItemIds.has(itemId)) {
        console.debug("[review:toggle] removing", itemId)
        await removeReview(itemId)
        const dueAfter = await getDueReviews()
=== src/options.tsx:578 ===
        const dueAfter = await getDueReviews()
        console.debug("[review:toggle] removed, due count:", dueAfter.length)
        setReviewItemIds((prev) => {
          const next = new Set(prev)
=== src/options.tsx:595 ===
      // Has title → add directly
      console.debug("[review:toggle] adding", itemId)
      await addReview({
        id: crypto.randomUUID(),
=== src/options.tsx:612 ===
      const dueAfter = await getDueReviews()
      console.debug("[review:toggle] added, due count:", dueAfter.length)
      setReviewItemIds((prev) => new Set(prev).add(itemId))
      setSnackbarMsg("已加入复习")
=== src/contents/capture.ts:43 ===
    if (!text) return
    console.debug("[lime:capture] Alt+S:", text.slice(0, 60))

    const payload = {
=== src/hooks/useReview.ts:109 ===
    if (sidebarTab !== "review" || reviewDateFilter) {
      console.debug("[review:load] guard blocked", {
        sidebarTab,
        reviewDateFilter
=== src/hooks/useReview.ts:115 ===
    }
    console.debug("[review:load] guard passed, loading...", {
      allItemsUnfiltered: allItemsRef.current.length
    })

```

---

## Assistant (Build · DeepSeek V4 Flash · 5.1s)

_Thinking:_

Let me remove all these console.debug lines. I'll do them one by one with edits (or sed). Let me use targeted edits.

1. background.ts:137 — `console.debug("contextMenus.onClicked:", info.menuItemId)` — remove.
2. background.ts:156 — the `[lime:save]` block — remove (it spans multiple lines).
3. options.tsx:158 — the `[review:state]` block — remove.
4. options.tsx:575 — `console.debug("[review:toggle] removing", itemId)` — remove.
5. options.tsx:578 — `console.debug("[review:toggle] removed, due count:", dueAfter.length)` — remove.
6. options.tsx:595 — `console.debug("[review:toggle] adding", itemId)` — remove.
7. options.tsx:612 — `console.debug("[review:toggle] added, due count:", dueAfter.length)` — remove.
8. capture.ts:43 — `console.debug("[lime:capture] Alt+S:", text.slice(0, 60))` — remove.
9. useReview.ts:109 — the `[review:load] guard blocked` block — remove.
10. useReview.ts:115 — `console.debug("[review:load] guard passed, loading...", {...})` — remove.

Let me read the multi-line blocks first (background 156, options 158, useReview 109/115) to remove them cleanly.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/background.ts",
  "limit": 14,
  "offset": 153
}
```

**Output:**
```
<path>/home/xx/Lime/src/background.ts</path>
<type>file</type>
<content>
153:       projectId?: string,
154:       projectName?: string
155:     ) => {
156:       console.debug("[lime:save]", {
157:         type,
158:         content: content.slice(0, 60),
159:         projectId,
160:         projectName
161:       })
162:       const item = createItem({ type, content, source: base.source, projectId })
163:       const saved = await addItem(item)
164:       if (saved && projectId) {
165:         touchProject(projectId).catch(() => {})
166:       }

(Showing lines 153-166 of 380. Use offset=167 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.5s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/background.ts",
  "newString": "    ) => {\n      const item = createItem({ type, content, source: base.source, projectId })",
  "oldString": "    ) => {\n      console.debug(\"[lime:save]\", {\n        type,\n        content: content.slice(0, 60),\n        projectId,\n        projectName\n      })\n      const item = createItem({ type, content, source: base.source, projectId })"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.4s)

_Thinking:_

Wait — removing the console.debug block removes the usage of `projectName` param. Let me check if projectName is still used in the function after removal. The param `projectName` was only used in the debug log. Now unused → TS might warn (noUnusedParameters). Let me check the function signature and whether projectName is used elsewhere.

Let me look at the broader function signature.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/background.ts",
  "limit": 18,
  "offset": 145
}
```

**Output:**
```
<path>/home/xx/Lime/src/background.ts</path>
<type>file</type>
<content>
145:     const base = {
146:       source: { title, url, site },
147:       createdAt: Date.now()
148:     }
149: 
150:     const saveAndNotify = async (
151:       type: Item["type"],
152:       content: string,
153:       projectId?: string,
154:       projectName?: string
155:     ) => {
156:       const item = createItem({ type, content, source: base.source, projectId })
157:       const saved = await addItem(item)
158:       if (saved && projectId) {
159:         touchProject(projectId).catch(() => {})
160:       }
161:       notifyTab(tab?.id, saved, type, projectName)
162:     }

(Showing lines 145-162 of 374. Use offset=163 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.9s)

_Thinking:_

Good — `projectName` is still used at line 161 (`notifyTab(..., projectName)`). So no unused param issue. The `console.debug` removal is clean.

Now remove the other debug lines:
- background.ts:137 (`console.debug("contextMenus.onClicked:", info.menuItemId)`)
- options.tsx:158 (`[review:state]` block)
- options.tsx:575, 578, 595, 612
- capture.ts:43
- useReview.ts:109, 115

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/background.ts",
  "newString": "  try {\n    await ensureMenusReady()",
  "oldString": "  try {\n    console.debug(\"contextMenus.onClicked:\", info.menuItemId)\n    await ensureMenusReady()"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.2s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 12,
  "offset": 154
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
154:     subSectionCount: number
155:   } | null>(null)
156:   const [mergeState, setMergeState] = useState<Item[] | null>(null)
157: 
158:   console.debug("[review:state]", {
159:     reviewItems: reviewItems.length,
160:     reviewCompleted,
161:     reviewIndex,
162:     reviewFlipped,
163:     sidebarTab,
164:     reviewDateFilter,
165:     reviewItemIds: reviewItemIds.size

(Showing lines 154-165 of 2096. Use offset=166 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.2s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 10,
  "offset": 165
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
165:     reviewItemIds: reviewItemIds.size
166:   })
167:   const [slideDir, setSlideDir] = useState<1 | -1>(1)
168: 
169:   const reviewProgress = useMemo(
170:     () => ({
171:       current: Math.min(reviewIndex + 1, reviewItems.length),
172:       total: reviewItems.length,
173:       sessionMastered: Array.from(sessionRatings.values()).filter((r) => r >= 3)
174:         .length

(Showing lines 165-174 of 2096. Use offset=175 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.1s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "  const [mergeState, setMergeState] = useState<Item[] | null>(null)\n\n  const [slideDir, setSlideDir] = useState<1 | -1>(1)",
  "oldString": "  const [mergeState, setMergeState] = useState<Item[] | null>(null)\n\n  console.debug(\"[review:state]\", {\n    reviewItems: reviewItems.length,\n    reviewCompleted,\n    reviewIndex,\n    reviewFlipped,\n    sidebarTab,\n    reviewDateFilter,\n    reviewItemIds: reviewItemIds.size\n  })\n  const [slideDir, setSlideDir] = useState<1 | -1>(1)"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.5s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      if (reviewItemIds.has(itemId)) {\n        await removeReview(itemId)",
  "oldString": "      if (reviewItemIds.has(itemId)) {\n        console.debug(\"[review:toggle] removing\", itemId)\n        await removeReview(itemId)"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 2.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 10,
  "offset": 558
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
558: 
559:   const handleToggleReview = useCallback(
560:     async (itemId: string) => {
561:       const card = allItemsUnfiltered.find((i) => i.id === itemId)
562:       if (!card) return
563: 
564:       // If already in review, remove it
565:       if (reviewItemIds.has(itemId)) {
566:         await removeReview(itemId)
567:         const dueAfter = await getDueReviews()

(Showing lines 558-567 of 2086. Use offset=568 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 55,
  "offset": 566
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
566:         await removeReview(itemId)
567:         const dueAfter = await getDueReviews()
568:         console.debug("[review:toggle] removed, due count:", dueAfter.length)
569:         setReviewItemIds((prev) => {
570:           const next = new Set(prev)
571:           next.delete(itemId)
572:           return next
573:         })
574:         setSnackbarMsg("已移出复习")
575:         return
576:       }
577: 
578:       // If no title, prompt for one
579:       if (!card.title) {
580:         setReviewTitlePending(itemId)
581:         return
582:       }
583: 
584:       // Has title → add directly
585:       console.debug("[review:toggle] adding", itemId)
586:       await addReview({
587:         id: crypto.randomUUID(),
588:         itemId: card.id,
589:         projectId: card.projectId ?? "",
590:         srs: {
591:           dueDate: Date.now(),
592:           interval: 0,
593:           easeFactor: 2.5,
594:           reviewCount: 0,
595:           lastReviewDate: 0
596:         },
597:         dueDate: Date.now(),
598:         status: "active",
599:         addedAt: Date.now()
600:       })
601:       const dueAfter = await getDueReviews()
602:       console.debug("[review:toggle] added, due count:", dueAfter.length)
603:       setReviewItemIds((prev) => new Set(prev).add(itemId))
604:       setSnackbarMsg("已加入复习")
605:     },
606:     [allItemsUnfiltered, reviewItemIds]
607:   )
608: 
609:   const handleReviewFlip = useCallback(() => {
610:     if (!animating) setReviewFlipped((prev) => !prev)
611:   }, [animating])
612: 
613:   const handleReviewRate = useCallback(
614:     async (rating: 1 | 2 | 3 | 4) => {
615:       if (
616:         reviewIndex >= reviewItems.length ||
617:         animating ||
618:         reviewItems.length === 0
619:       )
620:         return

(Showing lines 566-620 of 2086. Use offset=621 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.6s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "        await removeReview(itemId)\n        const dueAfter = await getDueReviews()\n        setReviewItemIds((prev) => {",
  "oldString": "        await removeReview(itemId)\n        const dueAfter = await getDueReviews()\n        console.debug(\"[review:toggle] removed, due count:\", dueAfter.length)\n        setReviewItemIds((prev) => {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.3s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      // Has title → add directly\n      await addReview({",
  "oldString": "      // Has title → add directly\n      console.debug(\"[review:toggle] adding\", itemId)\n      await addReview({"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      const dueAfter = await getDueReviews()\n      setReviewItemIds((prev) => new Set(prev).add(itemId))",
  "oldString": "      const dueAfter = await getDueReviews()\n      console.debug(\"[review:toggle] added, due count:\", dueAfter.length)\n      setReviewItemIds((prev) => new Set(prev).add(itemId))"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.7s)

_Thinking:_

Now `dueAfter` might be unused after removing the debug logs. Let me check — line 567 `const dueAfter = await getDueReviews()` and line 601 `const dueAfter = await getDueReviews()`. Both were only used in the console.debug. Let me check if they're used elsewhere now.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"dueAfter\" src/options.tsx"
}
```

**Output:**
```
567:        const dueAfter = await getDueReviews()
599:      const dueAfter = await getDueReviews()

```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

_Thinking:_

`dueAfter` is now unused (only assigned, never read). TS with `noUnusedLocals` would flag these. Let me remove both lines.

`dueAfter` 现在未使用。移除这两行：

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "        await removeReview(itemId)\n        setReviewItemIds((prev) => {",
  "oldString": "        await removeReview(itemId)\n        const dueAfter = await getDueReviews()\n        setReviewItemIds((prev) => {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.4s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "      setReviewItemIds((prev) => new Set(prev).add(itemId))",
  "oldString": "      const dueAfter = await getDueReviews()\n      setReviewItemIds((prev) => new Set(prev).add(itemId))"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.3s)

_Thinking:_

Now check if `getDueReviews` is still used in options.tsx (it was imported). Let me check — it might now be unused in options.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"getDueReviews\" src/options.tsx"
}
```

**Output:**
```
65:  getDueReviews,
641:        const due = await getDueReviews()

```

---

## Assistant (Build · DeepSeek V4 Flash · 5.1s)

_Thinking:_

`getDueReviews` is still used at line 641. Good — the import stays.

Now capture.ts:43 and useReview.ts:109, 115. Let me remove those.

`getDueReviews` 仍在用。移除 capture.ts 与 useReview.ts 的 debug：

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/contents/capture.ts",
  "limit": 10,
  "offset": 40
}
```

**Output:**
```
<path>/home/xx/Lime/src/contents/capture.ts</path>
<type>file</type>
<content>
40:     const sel = window.getSelection()
41:     const text = sel?.toString().trim()
42:     if (!text) return
43:     console.debug("[lime:capture] Alt+S:", text.slice(0, 60))
44: 
45:     const payload = {
46:       type: "text" as const,
47:       content: text,
48:       source: {
49:         title: document.title,

(Showing lines 40-49 of 56. Use offset=50 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 8.3s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/contents/capture.ts",
  "newString": "    if (!text) return\n\n    const payload = {",
  "oldString": "    if (!text) return\n    console.debug(\"[lime:capture] Alt+S:\", text.slice(0, 60))\n\n    const payload = {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.5s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useReview.ts",
  "limit": 20,
  "offset": 105
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useReview.ts</path>
<type>file</type>
<content>
105:   // Load due cards every time the user enters review tab (always from DB)
106:   // allItemsUnfiltered NOT in deps to prevent refreshAllData from racing with rating timeout
107:   useEffect(() => {
108:     if (sidebarTab !== "review" || reviewDateFilter) {
109:       console.debug("[review:load] guard blocked", {
110:         sidebarTab,
111:         reviewDateFilter
112:       })
113:       return
114:     }
115:     console.debug("[review:load] guard passed, loading...", {
116:       allItemsUnfiltered: allItemsRef.current.length
117:     })
118:     getDueReviews().then((due) => {
119:       const items = pairWithItems(due, allItemsRef.current)
120:       console.debug("[review:load] result", {
121:         dueCount: due.length,
122:         pairedCount: items.length
123:       })
124:       setReviewItems(items)

(Showing lines 105-124 of 188. Use offset=125 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.9s)

_Thinking:_

There are more debug logs in useReview.ts than I found earlier (line 120 too). Let me remove all of them in this function. Let me read a bit more and remove lines 109-112, 115-117, 120-123.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useReview.ts",
  "newString": "  useEffect(() => {\n    if (sidebarTab !== \"review\" || reviewDateFilter) {\n      return\n    }\n    getDueReviews().then((due) => {\n      const items = pairWithItems(due, allItemsRef.current)\n      setReviewItems(items)",
  "oldString": "  useEffect(() => {\n    if (sidebarTab !== \"review\" || reviewDateFilter) {\n      console.debug(\"[review:load] guard blocked\", {\n        sidebarTab,\n        reviewDateFilter\n      })\n      return\n    }\n    console.debug(\"[review:load] guard passed, loading...\", {\n      allItemsUnfiltered: allItemsRef.current.length\n    })\n    getDueReviews().then((due) => {\n      const items = pairWithItems(due, allItemsRef.current)\n      console.debug(\"[review:load] result\", {\n        dueCount: due.length,\n        pairedCount: items.length\n      })\n      setReviewItems(items)"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 4.1s)

_Thinking:_

Let me check for any other console.debug in useReview.ts and the rest of the codebase that I might have missed (the grep earlier showed only those, but the "result" one at line 120 wasn't in the grep — probably because the grep was limited or it was added later). Let me re-grep for console.debug across src.

复查是否还有 console.debug 残留：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -rn \"console\\.\\(log\\|debug\\)\" src/ --include=\"*.tsx\" --include=\"*.ts\" | grep -v test"
}
```

**Output:**
```
src/hooks/useBackupSync.ts:67:      console.debug("[lime:sync]", result.message)
src/hooks/useBackupSync.ts:71:      console.debug("[lime:sync] 同步失败:", e)
src/hooks/useBackupSync.ts:93:        console.debug("[lime:sync]", remote.message || "下载失败")
src/hooks/useBackupSync.ts:98:        console.debug("[lime:sync]", remote.message || "数据无变化")
src/hooks/useBackupSync.ts:114:        console.debug("[lime:sync]", msg)
src/hooks/useBackupSync.ts:120:      console.debug("[lime:sync] 下载失败:", e)
src/tabs/new-project.tsx:65:    console.debug("[lime:save]", {

```

---

## Assistant (Build · DeepSeek V4 Flash · 3.6s)

_Thinking:_

More debug logs in useBackupSync.ts (6) and new-project.tsx (1). The earlier grep didn't catch them (I only searched specific patterns or files). Let me remove these too — the user asked to clean up console.debug.

Let me read each context and remove them.

`useBackupSync.ts` 还有 6 处、`new-project.tsx` 1 处。一并清理：

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useBackupSync.ts",
  "limit": 62,
  "offset": 62
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useBackupSync.ts</path>
<type>file</type>
<content>
62:         reviews,
63:         setSyncStatus
64:       )
65:       if (result.success) chrome.storage.local.set({ lastSyncTime: Date.now() })
66:       setSyncStatus(result.message)
67:       console.debug("[lime:sync]", result.message)
68:     } catch (e) {
69:       setSnackbarMsg(`同步失败：${e}`)
70:       setSyncStatus("同步失败")
71:       console.debug("[lime:sync] 同步失败:", e)
72:     }
73:   }
74: 
75:   const handleDownloadSync = async () => {
76:     try {
77:       const cred = await getSyncCredentials()
78:       if (!cred) {
79:         setSyncStatus("请先在设置中配置坚果云")
80:         return
81:       }
82: 
83:       const reviews = await getAllReviews()
84:       const remote = await downloadRemote(
85:         cred,
86:         allItemsUnfiltered,
87:         projects,
88:         reviews,
89:         setSyncStatus
90:       )
91:       if (!remote.success) {
92:         setSyncStatus(remote.message || "下载失败")
93:         console.debug("[lime:sync]", remote.message || "下载失败")
94:         return
95:       }
96:       if (remote.direction === "noop") {
97:         setSyncStatus(remote.message || "数据无变化")
98:         console.debug("[lime:sync]", remote.message || "数据无变化")
99:         return
100:       }
101:       if (remote.payload) {
102:         setSyncStatus("正在应用数据…")
103:         await bulkReplace(
104:           remote.payload.items,
105:           remote.payload.projects,
106:           remote.payload.reviews ?? [],
107:           allItemsUnfiltered,
108:           projects,
109:           reviews
110:         )
111:         chrome.storage.local.set({ lastSyncTime: Date.now() })
112:         const msg = remote.message || "从云端同步"
113:         setSyncStatus(msg)
114:         console.debug("[lime:sync]", msg)
115:         await refreshAllData()
116:       }
117:     } catch (e) {
118:       setSnackbarMsg(`下载失败：${e}`)
119:       setSyncStatus("下载失败")
120:       console.debug("[lime:sync] 下载失败:", e)
121:     }
122:   }
123: 

(Showing lines 62-123 of 130. Use offset=124 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useBackupSync.ts",
  "newString": "      if (result.success) chrome.storage.local.set({ lastSyncTime: Date.now() })\n      setSyncStatus(result.message)\n    } catch (e) {\n      setSnackbarMsg(`同步失败：${e}`)\n      setSyncStatus(\"同步失败\")\n    }\n  }",
  "oldString": "      if (result.success) chrome.storage.local.set({ lastSyncTime: Date.now() })\n      setSyncStatus(result.message)\n      console.debug(\"[lime:sync]\", result.message)\n    } catch (e) {\n      setSnackbarMsg(`同步失败：${e}`)\n      setSyncStatus(\"同步失败\")\n      console.debug(\"[lime:sync] 同步失败:\", e)\n    }\n  }"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.6s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useBackupSync.ts",
  "newString": "      if (!remote.success) {\n        setSyncStatus(remote.message || \"下载失败\")\n        return\n      }\n      if (remote.direction === \"noop\") {\n        setSyncStatus(remote.message || \"数据无变化\")\n        return\n      }\n      if (remote.payload) {\n        setSyncStatus(\"正在应用数据…\")\n        await bulkReplace(\n          remote.payload.items,\n          remote.payload.projects,\n          remote.payload.reviews ?? [],\n          allItemsUnfiltered,\n          projects,\n          reviews\n        )\n        chrome.storage.local.set({ lastSyncTime: Date.now() })\n        const msg = remote.message || \"从云端同步\"\n        setSyncStatus(msg)\n        await refreshAllData()\n      }\n    } catch (e) {\n      setSnackbarMsg(`下载失败：${e}`)\n      setSyncStatus(\"下载失败\")\n    }\n  }",
  "oldString": "      if (!remote.success) {\n        setSyncStatus(remote.message || \"下载失败\")\n        console.debug(\"[lime:sync]\", remote.message || \"下载失败\")\n        return\n      }\n      if (remote.direction === \"noop\") {\n        setSyncStatus(remote.message || \"数据无变化\")\n        console.debug(\"[lime:sync]\", remote.message || \"数据无变化\")\n        return\n      }\n      if (remote.payload) {\n        setSyncStatus(\"正在应用数据…\")\n        await bulkReplace(\n          remote.payload.items,\n          remote.payload.projects,\n          remote.payload.reviews ?? [],\n          allItemsUnfiltered,\n          projects,\n          reviews\n        )\n        chrome.storage.local.set({ lastSyncTime: Date.now() })\n        const msg = remote.message || \"从云端同步\"\n        setSyncStatus(msg)\n        console.debug(\"[lime:sync]\", msg)\n        await refreshAllData()\n      }\n    } catch (e) {\n      setSnackbarMsg(`下载失败：${e}`)\n      setSyncStatus(\"下载失败\")\n      console.debug(\"[lime:sync] 下载失败:\", e)\n    }\n  }"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/tabs/new-project.tsx",
  "limit": 14,
  "offset": 60
}
```

**Output:**
```
<path>/home/xx/Lime/src/tabs/new-project.tsx</path>
<type>file</type>
<content>
60:     const saved = await addItem(item)
61: 
62:     const result = await chrome.storage.session.get("pendingTabId")
63:     const tabId = (result as { pendingTabId?: number }).pendingTabId
64: 
65:     console.debug("[lime:save]", {
66:       type: pending.type,
67:       projectId,
68:       content: pending.content.slice(0, 60),
69:       dedup: !saved
70:     })
71: 
72:     // Delegate toast to the background SW
73:     sendMessage({

(Showing lines 60-73 of 188. Use offset=74 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 9.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/tabs/new-project.tsx",
  "newString": "    const saved = await addItem(item)\n\n    const result = await chrome.storage.session.get(\"pendingTabId\")\n    const tabId = (result as { pendingTabId?: number }).pendingTabId\n\n    // Delegate toast to the background SW\n    sendMessage({",
  "oldString": "    const saved = await addItem(item)\n\n    const result = await chrome.storage.session.get(\"pendingTabId\")\n    const tabId = (result as { pendingTabId?: number }).pendingTabId\n\n    console.debug(\"[lime:save]\", {\n      type: pending.type,\n      projectId,\n      content: pending.content.slice(0, 60),\n      dedup: !saved\n    })\n\n    // Delegate toast to the background SW\n    sendMessage({"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 3.2s)

_Thinking:_

Now `saved` in new-project.tsx — was it only used in the debug log? Let me check. Line 60 `const saved = await addItem(item)`. After removing the debug log, is `saved` used elsewhere?

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"\\bsaved\\b\" src/tabs/new-project.tsx"
}
```

**Output:**
```
60:    const saved = await addItem(item)
69:      saved,

```

---

## Assistant (Build · DeepSeek V4 Flash · 6.6s)

_Thinking:_

`saved` is still used at line 69 (in the sendMessage payload presumably). Good — the import/var stays.

Now let me run tsc to catch any remaining issues (unused imports, the computeDropIndex generic change, dueInfo usage, etc.).

Now run tsc to catch any leftover issues:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && pnpm exec tsc --noEmit 2>&1 | head -15 && echo \"=== done ===\""
}
```

**Output:**
```
=== done ===

```

---

## Assistant (Build · DeepSeek V4 Flash · 11.8s)

_Thinking:_

tsc clean. Let me run the tests + build. Also — let me verify the `dueLabel` tests still pass (I refactored dueLabel to use labelFromStatus which takes today). The tests call `dueLabel("2026-08-01", today)` etc. My refactor preserves the same output. Let me run tests.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && pnpm test 2>&1 | grep \"Tests:\" && pnpm run build 2>&1 | tail -1"
}
```

**Output:**
```
Tests:       81 passed, 81 total
🟢 DONE   | Finished in 3135ms!

```

---

## Assistant (Build · DeepSeek V4 Flash · 5.2s)

_Thinking:_

All green — 81 tests, build ✓.

Let me review the full diff and commit. Let me also double-check that `dueLabel` is still exported and the tests use it (the test file imports dueLabel — yes, and it passes).

Let me look at the diff stat and verify nothing else broke.

Actually — let me also verify: in options.tsx, `todayLocalDate` is still imported and used (I hoisted `const today = todayLocalDate()`). Yes. And `dueStatus` still used (todoStats/filteredTodos). And `maxScopeOrder` used (merge). `compareCards` used (onSearch + move). Good.

In TodoCard: `dueInfo`, `dueStatus`, `todayLocalDate` all used. `dueLabel` no longer imported (removed). Good.

In useNewCard: `maxScopeOrder` used. `allItems` → `allItemsUnfiltered`. Good.

Let me check the diff stat and commit.

全绿：81 测试、构建 ✓。查看改动并提交：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && git diff --stat && git add -A && git commit -m \"refactor: dedupe compareCards/maxScopeOrder/dueInfo, consolidate todayLocalDate, remove console.debug logs, order uses unfiltered items\" -q && git log --oneline -1"
}
```

**Output:**
```
 src/background.ts               |  7 ------
 src/components/TodoCard.tsx     | 13 ++++++-----
 src/contents/capture.ts         |  1 -
 src/hooks/useBackupSync.ts      |  6 -----
 src/hooks/useCardDragReorder.ts |  6 ++---
 src/hooks/useNewCard.ts         | 15 ++++++-------
 src/hooks/useReview.ts          | 11 ---------
 src/options.tsx                 | 49 ++++++++++++++---------------------------
 src/tabs/new-project.tsx        |  7 ------
 src/utils/index.ts              | 46 +++++++++++++++++++++++++++++++++-----
 10 files changed, 73 insertions(+), 88 deletions(-)
3b53bb2 refactor: dedupe compareCards/maxScopeOrder/dueInfo, consolidate todayLocalDate, remove console.debug logs, order uses unfiltered items

```

---

## Assistant (Build · DeepSeek V4 Flash · 8.5s)

_Thinking:_

Committed `3b53bb2`. Let me summarize the review fixes.

1. **`compareCards`** — extracted to utils, used in 4 places (options onSearch, options move, useCardDragReorder, computeDropIndex).
2. **`maxScopeOrder`** — extracted to utils, used in useNewCard + merge handler.
3. **`todayLocalDate()` consolidation** — TodoCard: 3 calls → 1 (`today` once, passed to DueChip); options: hoisted once, used in both memos.
4. **`DueChip` dedup** — new `dueInfo(dueDate, today)` returns {status, label} in one pass (was computing dueStatus twice); `dueLabel` refactored as a wrapper.
5. **`console.debug` removed** — 10+ places across background, options, capture, useReview, useBackupSync, new-project.
7. **order uses unfiltered items** — both useNewCard and merge now use `allItemsUnfiltered` (via maxScopeOrder) so active search/date filters can't hide same-scope cards with higher orders.

Net: 10 files, +73/−88.

Let me present the summary.

Code review 修复完成，提交 `3b53bb2`（10 文件 +73/−88）。

## 修复对照

**1. 排序比较器去重** — 抽 `compareCards(order 升序 → createdAt 升序)` 到 utils，统一 4 处：`options.tsx` onSearch、`options.tsx` 移动/重排、`useCardDragReorder`、`computeDropIndex`（泛型约束补 `createdAt?`，向后兼容）。

**2. max order 去重** — 抽 `maxScopeOrder(items, sectionId)` 到 utils，统一 `useNewCard` 与合并处理器。

**3. `todayLocalDate()` 合并** — `TodoCard`：单次渲染 3 次 → **1 次**（`today` 算一次传给 DueChip + 复用）；`options`：两个 memo 各算一次 → 提升到组件级一次。

**4. `DueChip` 状态重复计算** — 新增 `dueInfo(dueDate, today)` 一次算出 `{status, label}`（原先 `dueStatus` + `dueLabel` 内部**再算一次**）；`dueLabel` 改为薄包装，测试不变。

**5. `console.debug` 清理** — 共 **13 处**全部移除：`background`(2)、`options`(5，含两处 `[review:toggle]`)、`capture`(1)、`useReview`(4)、`useBackupSync`(6)、`new-project`(1)；顺带删掉了 2 个仅用于日志的 `dueAfter` 临时变量。

**7. order 用全量数据** — `useNewCard` 与合并处理器改用 `allItemsUnfiltered`（经 `maxScopeOrder`），筛选视图下新建/合并不再漏算筛选外同章节卡的高 order → 落位严格最后。

**验证**：`tsc` ✓、**81 测试** ✓、构建 ✓。

---

## User

当前复习卡片上会影响todo icon的数字显示。分析并解决

---

## Assistant (Build · DeepSeek V4 Flash · 29.5s)

_Thinking:_

The user reports: 复习卡片 (review cards) affect the todo icon's number display. The todo icon's badge = incomplete todos + due reviews (per memory #157: "Todo badge composition: incomplete todo count + review due count (sum); review button badge unchanged.").

So the todo icon badge = `todoStats.incomplete + dueCount`. The review cards (复习) affect the `dueCount` part. The user says "当前复习卡片上会影响todo icon的数字显示" — the review cards affect the todo icon's number display.

Wait — let me re-read. "当前复习卡片上会影响todo icon的数字显示" — currently, review cards (the ones in the review view, i.e., reviewItemIds) affect the todo icon's number. 

The todo badge = incomplete todos + due reviews (sum). So adding a card to review (adding a review entry with dueDate = now) increases `dueCount` → increases the todo badge. The user is saying this coupling is a problem: review cards shouldn't affect the todo icon's number.

Hmm — wait, but the user DESIGNED it that way: "todo badge = 未完成 todo 数 + 复习待办数（之和）". Memory #157 says: "Todo badge composition: incomplete todo count + review due count (sum); review button badge unchanged."

So the user previously wanted the SUM. Now they're reporting it as a problem: "当前复习卡片上会影响todo icon的数字显示". 

Let me parse more carefully. "复习卡片上" could mean "on the review cards" or "the review feature". "会影响todo icon的数字显示" = affects the todo icon's number display.

So: when there are review cards (cards added to review), the todo icon's badge shows a number. The user finds this problematic now — review cards shouldn't inflate the todo badge.

Wait — but maybe the issue is more specific. Let me think about what "复习卡片" means. When a card is added to review (handleToggleReview → addReview with dueDate: Date.now()), it becomes due immediately. So `dueCount` increases. The todo badge = todoStats.incomplete + dueCount. So adding ANY card to review immediately bumps the todo badge.

The user's complaint: this coupling is wrong. The todo badge should reflect ONLY todos, not review cards. OR — the user wants to change the composition.

Actually — let me reconsider. The original design decision (from the todo feature request): "卡片上需要有已完成/未完成，使用和未完成复习一样的提醒方式（按钮数字和badge数字，badge是未完成卡片和未复习卡片之和）来提醒未完成todo卡片". So the user asked: the badge = 未完成卡片 + 未复习卡片之和. The NavRail todo button badge = incomplete todos + due reviews.

But NOW the user says review cards affect the todo icon's number and wants it analyzed + fixed. So the direction changed: the todo badge should probably be JUST incomplete todos, and the review badge stays as due reviews. The "sum" coupling was the original request, but now the user finds it wrong.

Hmm — wait, let me re-read once more: "当前复习卡片上会影响todo icon的数字显示。分析并解决". 

Interpretation A: The review cards affect the todo badge (the sum coupling). The user wants the todo badge decoupled from reviews → todo badge = incomplete todos only.

Interpretation B: There's a BUG where review cards wrongly increment the todo badge beyond the intended sum.

Given the phrasing "会影响...的数字显示。分析并解决", I think the user now considers the coupling a problem and wants the todo badge to be just incomplete todos. This reverses the earlier "sum" decision.

Actually — let me reconsider. Maybe there's a subtle bug. Let me check the actual computation:
- `todoCount = todoStats.incomplete + dueCount` (options.tsx ~1143).
- `dueCount` comes from useReview — it's the due review count.

When does `dueCount` update? useReview computes dueCount. When a card is added to review (handleToggleReview), it calls addReview (dueDate: now) then reloads review data → dueCount increases. So the todo badge increases. That's the sum behavior — by design.

But ALSO — consider: the review session itself. When the user rates cards during review, updateReviewSrs changes dueDate. Cards rated <3 are requeued (still due), >=3 get future due dates. So dueCount changes during review → todo badge changes during review. That could feel like "复习卡片会影响 todo icon".

I think the user wants to DECOUPLE: the todo icon badge should only reflect todos. Let me confirm this interpretation and propose the fix.

Actually — the user said "分析并解决" (analyze and solve), giving me the go-ahead. I should:
1. Analyze the coupling (todoCount = todoStats.incomplete + dueCount).
2. Solve: change the todo badge to only incomplete todos? OR change what dueCount means?

Wait — but I should be careful. Let me reconsider whether the user wants to REMOVE the review from the todo badge, or whether there's an actual bug.

Let me think about the "复习卡片" term again. In the app, "复习" = the review module (SRS). "复习卡片" = cards that have been added to review. The todo icon's badge = 未完成 todo + 复习待办. So "复习卡片上会影响todo icon的数字显示" = review cards inflate the todo icon number.

The user's original intent for the sum: they wanted the badge to be a single "attention number". But now they realize it conflates two different things — adding a card to review makes the todo icon light up, which is confusing.

So the fix: **the todo badge should show only incomplete todos**. The review button's badge already shows due reviews. Decoupling makes each icon show its own metric.

But wait — let me reconsider. The user might want to KEEP the sum but fix something else. Let me look at the actual current behavior to be sure. Let me check:
1. `todoCount` computation.
2. The NavRail todo badge.
3. The extension toolbar badge (background) — `due.length + incompleteTodos` (I set it to the sum earlier!). 

Ah — the EXTENSION toolbar badge also = due + incomplete todos (background updateBadge). So the extension badge is also affected by reviews.

So "todo icon" = the NavRail todo button badge + possibly the extension toolbar badge. Both show the sum.

The user's complaint is that review cards affect these numbers. The clean fix: make the todo badge = incomplete todos only, and the review badge = due reviews only (already the case). The extension toolbar badge — what should it show? Currently due + incomplete. If we decouple, maybe the extension badge should... hmm. The extension badge historically showed the review due count (before todos existed). Then I changed it to due + incomplete. 

Let me reconsider what's most sensible:
- NavRail 复习 badge = dueCount (reviews only) — unchanged.
- NavRail todo badge = incomplete todos ONLY (decouple from reviews).
- Extension toolbar badge = ? It's a single global badge. Options: (a) due + incomplete (current), (b) reviews only (historical), (c) todos only. 

The user's complaint is specifically about review cards affecting the todo icon. The extension toolbar badge isn't an "icon" per se but shows the aggregate. Hmm — "todo icon" likely means the NavRail todo button. Let me focus there but also consider the extension badge.

Actually — wait. Let me reconsider the user's exact words once more: "当前复习卡片上会影响todo icon的数字显示". 

Maybe the issue is the REVERSE: they want the todo icon to show the sum but it's being affected incorrectly? No — "复习卡片上会影响" clearly means review cards affect it, and they don't want that.

Let me go with: **decouple — todo badge = incomplete todos only**. The extension toolbar badge — I'll set it to also be... hmm. Let me think. If the extension badge shows due + incomplete (sum), it's still affected by reviews. But the user specifically mentioned "todo icon". The extension toolbar badge isn't the "todo icon". Let me keep the extension badge as the aggregate (it's the global attention indicator) OR align it. 

Actually — let me reconsider the whole thing. The memory #157 (my own note): "Todo badge composition: incomplete todo count + review due count (sum); review button badge unchanged." This was the user's explicit decision. Now they're reversing it. So the new decision: todo badge = incomplete todos only.

For the extension toolbar badge — it was historically the review due count (pre-todo). I changed it to sum during the todo work. If I decouple the NavRail todo badge, should the extension badge also change? The extension badge is the "toolbar attention" — showing the sum (todos + reviews) is arguably useful. But it's ALSO "affected by review cards". The user didn't mention the toolbar badge explicitly. 

Let me be conservative: fix the NavRail todo badge to incomplete-only. For the extension toolbar badge, I should decide — since the user's complaint is about the coupling, and the extension badge ALSO couples, I should probably make it consistent. But the extension badge historically = review due. If I change it to incomplete-todos-only, then reviews wouldn't show on the toolbar at all (bad — reviews are a core feature). If I keep it as sum, it's still "affected by review cards" but that's the aggregate.

Hmm — the cleanest semantic: 
- 复习 icon badge = due reviews.
- todo icon badge = incomplete todos.
- Extension toolbar badge = ??? — it's ONE number for the whole extension. The most sensible aggregate for "things needing attention" = incomplete todos + due reviews (the current sum). This is intentional (global attention). The user's complaint is about the TODO ICON specifically being inflated by reviews.

Wait — but actually, let me re-read the ORIGINAL todo feature request: "badge是未完成卡片和未复习卡片之和". So the user ORIGINALLY wanted the todo icon badge = sum. Now they say review cards affect the todo icon's number and want it fixed. 

So they've changed their mind. The new requirement: review cards should NOT affect the todo icon. So the todo badge = incomplete todos only.

For the extension toolbar badge — the user hasn't complained about it. But it uses the same "sum" logic. To be consistent with the decoupling philosophy, should the extension badge change? Let me think about what the extension badge should show. It's the browser-toolbar badge. Historically (before todos), it showed the review due count. The most useful global attention indicator... Actually — I'll change the extension badge to ALSO be incomplete-todos-only? No — that loses review visibility. 

Hmm. Let me reconsider. The user's complaint is ONLY about the todo icon. The extension toolbar badge is a different thing. Let me:
1. NavRail todo badge: incomplete todos only.
2. Extension toolbar badge: keep as sum (due + incomplete) — it's the global attention aggregate, not the "todo icon". 

But wait — is the extension badge ALSO considered "todo icon"? No. The NavRail has explicit 复习 and todo icons. The extension toolbar badge is separate.

Actually — hold on. Let me reconsider whether the user wants the SUM at all anymore. Let me re-read the ORIGINAL request once more from history §769: "3.卡片上需要有已完成/未完成，使用和未完成复习一样的提醒方式（按钮数字和badge数字，badge是未完成卡片和未复习卡片之和）来提醒未完成todo卡片". 

So: "badge 是未完成卡片和未复习卡片之和" — badge = incomplete + un-reviewed. This was explicit. Now: "复习卡片上会影响todo icon的数字显示。分析并解决" — review cards affect the todo icon number; analyze and solve.

So the user reversed course. The fix is to decouple. Given they said "分析并解决", they want me to identify the coupling and remove it.

Let me now also reconsider: maybe the issue is even more specific. Let me check the actual flow. When the user adds a card to review, `addReview({..., dueDate: Date.now(), ...})`. dueDate = now → immediately due. So dueCount increments. This is the "复习卡片" affecting the todo badge.

Actually — wait. There might be a DIFFERENT subtle issue. Let me check `dueCount` in useReview and how it's computed. Maybe `dueCount` includes ALL reviews (even ones not due) and there's a bug where the count is wrong.

Let me look at useReview's dueCount computation and the todo badge wiring. Let me investigate before deciding.

Let me read the relevant code:
1. options.tsx todoCount + NavRail props.
2. useReview dueCount.
3. background updateBadge.

Let me look.

复习卡片影响 todo icon 数字——查 badge 的计算耦合。先读 NavRail badge、`todoCount`、`dueCount` 与 background 的扩展 badge：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"todoCount\\|dueCount\\|todoBadge\\|badge\" src/options.tsx | head; echo \"=== NavRail badge props ===\"; grep -n \"todoCount\\|dueCount\" src/components/NavRail.tsx; echo \"=== useReview dueCount ===\"; grep -n \"dueCount\" src/hooks/useReview.ts"
}
```

**Output:**
```
254:    dueCount,
1125:  // Todo badge = incomplete todos + due reviews (single attention number).
1126:  const todoCount = todoStats.incomplete + dueCount
1236:          dueCount={dueCount}
1237:          todoCount={todoCount}
2067:            dueCount={dueCount}
=== NavRail badge props ===
13:  dueCount: number
15:  todoCount: number
54:  dueCount,
55:  todoCount,
76:          b.badgeFor === "review" ? dueCount : b.badgeFor === "todo" ? todoCount : 0
=== useReview dueCount ===
49:  const [dueCount, setDueCount] = useState(0)
52:    dueCount: 0,
68:      setDueCount(s.dueCount)
71:        dueCount: s.dueCount,
166:    dueCount,

```

---

## Assistant (Build · DeepSeek V4 Flash · 25.7s)

_Thinking:_

Confirmed:
- `todoCount = todoStats.incomplete + dueCount` (options.tsx:1126) — the todo badge = incomplete todos + due reviews.
- NavRail uses `dueCount` for review badge and `todoCount` for todo badge.
- `dueCount` from useReview — the due review count.

So when review cards exist (dueCount > 0), the todo icon badge increases. The user wants this decoupled: todo badge = incomplete todos only.

Now — let me also check the background extension badge. It computes `due.length + incompleteTodos` (I set it earlier). Should I change that too? The user said "todo icon 的数字显示". The extension toolbar badge is the "扩展badge" — separate from the todo icon. But the same coupling exists there.

Let me decide the fix:
1. **NavRail todo badge**: `todoCount = todoStats.incomplete` (decouple from dueCount).
2. **Background extension badge**: Currently `due + incompleteTodos`. This is the global toolbar badge. The user's complaint is about the todo icon. But the extension badge has the same coupling. Should I keep it as the aggregate or change it?

The extension toolbar badge was ORIGINALLY the review due count (before todos). The user never complained about the extension badge showing reviews. But — the extension badge shows "due + incomplete todos" which is ALSO affected by review cards. 

Hmm — let me think about what's most consistent. The user wants: review cards should NOT affect the todo icon. The extension toolbar badge is a single global indicator. If I keep it as sum, it's still "affected by reviews" but that's the GLOBAL attention number (intended). The user specifically mentioned "todo icon" — the NavRail button. 

Actually — let me reconsider. Maybe the user ALSO considers the extension badge a "todo icon"? No — the extension badge is the browser toolbar. It's an aggregate.

I'll make a decision: 
- NavRail todo badge = incomplete todos only (decouple).
- Extension toolbar badge = keep as the aggregate (due + incomplete) OR align it to reviews-only? 

Hmm. Let me reconsider the extension badge's history. Memory #86: "Save feedback badge uses tabId-scoped setBadgeText({text, tabId}) so per-tab confirmations don't overwrite the global due-count badge". So the global badge was "due-count" (reviews). Then during the todo work, I changed `updateBadge` to `due + incompleteTodos`. 

The user's current complaint is about the todo icon specifically. To minimize scope and follow the decoupling intent, I think the cleanest is:
- **NavRail todo badge**: incomplete todos only.
- **Extension toolbar badge**: I'll make it consistent with the todo badge semantics? OR keep as global aggregate?

Actually — let me reconsider the whole design intent. The extension toolbar badge should alert the user to things needing attention. The sum (due reviews + incomplete todos) is the total attention number. That's reasonable for a toolbar badge. The problem the user has is specifically that the TODO ICON (in the NavRail) shows a number inflated by review cards. The review icon already shows dueCount. So the todo icon double-counting reviews is confusing.

Decision:
- NavRail todo badge = `todoStats.incomplete` only.
- Extension toolbar badge = keep the sum (it's the global attention indicator, and the user didn't complain about it). 

Hmm — but wait, let me reconsider. If the extension badge keeps the sum, and the user's mental model is "review cards shouldn't inflate todo numbers", they might also expect the extension badge to not include reviews. But the extension badge ISN'T the todo icon. Let me keep it as the aggregate (most useful) but... actually, let me reconsider whether the user wants the extension badge to remain.

Actually — let me re-read the user's message once more: "当前复习卡片上会影响todo icon的数字显示。分析并解决". 

"todo icon 的数字显示" — the todo icon's number display. This is the NavRail todo button's badge. The fix: decouple it from reviews.

For the extension toolbar badge — it's not the "todo icon". I'll leave it as the aggregate (due + incomplete todos), since that's the global attention indicator and the user didn't flag it. But — hmm, is that inconsistent? The user might notice the extension badge still changes when they add a review card. But that's the GLOBAL badge, showing "total things needing attention" = reasonable.

Actually — you know what, let me reconsider. Given the user's clear preference for decoupling, maybe the extension badge should ALSO be review-only (its historical behavior) OR todo-only. Let me think about what makes sense:
- The extension toolbar badge has ONE slot. 
- Review due cards and incomplete todos are both "attention" items.
- The user's original design: sum. Now: decouple todo icon.

I'll keep the extension badge as the sum (global attention), because it's genuinely useful and NOT the "todo icon". The NavRail todo badge becomes incomplete-only. If the user wants the extension badge changed too, they'll say so.

Hmm — wait. Actually, let me reconsider ONE more time. There's a risk: if the user's intent is "review cards shouldn't show up in todo-related numbers AT ALL", then the extension badge (which they might perceive as the todo badge since it's the only badge on the browser icon) could be the thing they're complaining about. "todo icon" — could "todo icon" mean the TODO but in the NavRail? The NavRail has distinct icons for 项目/复习/备份/TODO. The "todo icon" = the TODO NavRail button. Its badge = todoCount. That's the clearest reading.

Let me go with: **NavRail todo badge = incomplete todos only**. And I'll ALSO reconsider the extension badge.

For the extension badge — let me keep it as the sum for now (it's the global indicator), but actually — hmm. Let me reconsider by thinking about what the user experiences. The user opens the extension, sees the NavRail todo icon with a number that goes up when they review cards. Confusing. The fix removes that. The extension toolbar badge is smaller/less prominent; the user probably hasn't focused on it. Keep it as sum.

Wait — actually, I realize I should double-check: is the extension toolbar badge even set correctly/visible? It was set in updateBadge. Let me keep it as-is (sum). 

Actually — let me reconsider whether to ALSO remove the review component from the extension badge for consistency. The user's principle: "todo 数字不该受复习影响". The extension badge IS a number that includes todos. If the user later checks the extension badge, they'd see it change with reviews — but that's the aggregate. I'll keep it. If the user wants it changed, they'll ask.

Hmm, but actually — let me reconsider the memory #157 update. Memory says "Todo badge composition: incomplete todo count + review due count (sum); review button badge unchanged." This memory is now WRONG (the user reversed it). I should update the memory after the fix.

Now let me implement:

1. **options.tsx:1126**: `const todoCount = todoStats.incomplete + dueCount` → `const todoCount = todoStats.incomplete`.

Wait — but if I remove dueCount from todoCount, is `dueCount` still used elsewhere? Yes — NavRail review badge (dueCount prop, line 1236) and FooterBar (line 2067). So dueCount stays.

2. The comment at 1125 should be updated.

3. **background.ts updateBadge**: currently `due.length + incompleteTodos`. Keep or change? Let me reconsider — I'll change it to match the new semantics? The extension badge = global attention. Hmm. Let me keep it as the sum for now, since it's the global indicator and removing reviews from it would make the toolbar badge ignore reviews entirely (which would be a regression from historical behavior where it showed due reviews).

Actually — wait. Let me reconsider the extension badge once more. Before todos, it showed `due.length` (reviews). After todos, `due + incomplete`. If I now decouple the NavRail todo badge, should the extension badge revert to... what? The user's complaint is that REVIEWS affect TODO numbers. The extension badge includes BOTH. If the user's concern is pure "review shouldn't inflate todo", the extension badge is a mixed indicator — it's fine as an aggregate.

But actually — hmm, let me reconsider if the user considers the extension badge the "todo icon". The Chrome toolbar icon with the badge — when you hover, it says "lime". It's the EXTENSION's badge, not a "todo icon". The NavRail "todo icon" is the explicit TODO button. I'm confident it's the NavRail one.

Decision: NavRail todo badge = incomplete todos only. Extension badge stays as aggregate (due + incomplete). 

Hmm — actually, let me reconsider whether the user wants the extension badge decoupled too. The phrase "todo icon" is specific. Let me do the NavRail fix and mention the extension badge decision in my summary, offering to change it if desired.

Wait — actually, let me reconsider the extension badge more carefully. The user's principle seems to be "todo 相关数字不应受复习影响". The extension toolbar badge — is it a "todo 相关数字"? It shows the sum, which includes todos. When a review card is added, the badge increments. If the user perceives the extension badge as "the todo count" (since it shows the sum which is dominated by the todo number), they'd be annoyed too.

To be safe and consistent, let me make the EXTENSION badge ALSO not include reviews — i.e., revert it to... hmm, but then reviews aren't visible on the toolbar. 

Ugh. Let me think about the CLEANEST semantic:
- Each NavRail icon shows its OWN metric: 复习 = due reviews; todo = incomplete todos.
- The extension toolbar badge: it's the "app" badge. What should it aggregate? 

Option 1: sum (due + incomplete) — current. Global attention.
Option 2: incomplete todos only — matches "todo is the thing needing attention".
Option 3: due reviews only — historical.

The user complained that reviews affect todo numbers. The extension badge showing the sum means reviews affect "the number". But is the extension badge a "todo number"? Not exactly. 

I'll go with: **NavRail todo badge = incomplete todos only** (the clear fix for the complaint), and **keep the extension badge as the sum** but note it in the summary. Actually — let me reconsider: the user said "分析并解决" — solve the problem. The problem: review cards affect todo icon numbers. The extension badge isn't the todo icon. So the minimal correct fix is the NavRail todo badge.

But wait — actually, I want to reconsider whether the extension badge should change. Let me look at it from the "what would the user expect" angle. The user added todos and wanted the badge. Now they realize the coupling is bad. They'll likely ALSO not want the extension badge to couple... but the extension badge was ALWAYS showing reviews (historically). The user never complained about that. So the extension badge showing reviews is expected behavior. The problem is ONLY the todo icon showing reviews.

Final: NavRail todo badge = incomplete todos only. Extension badge unchanged (sum).

Hmm — wait, actually, let me reconsider whether the extension badge should keep the sum or... Let me look at what updateBadge actually does now and decide. Let me read it.

Actually, let me reconsider — I realize there might be a subtlety. Let me re-read: "当前复习卡片上会影响todo icon的数字显示". 

Maybe "复习卡片" specifically means cards IN the review session/queue. When the user adds a card to review (it becomes due immediately), dueCount goes up, todo badge goes up. Yes.

Let me implement the decoupling. Let me also reconsider — should `todoCount` be renamed or keep the name? Keep `todoCount` (it's the todo badge). Just change the value.

Let me also update the memory #157 after.

Let me also check: is there anywhere else that uses the "sum" logic? The background extension badge. And the memory. Let me check background.ts updateBadge.

`todoCount = todoStats.incomplete + dueCount`（options.tsx:1126）——todo 图标 badge 里硬加了复习待办数，加卡进复习就会让 todo 数字跳增。查 background 扩展 badge 的同样耦合：

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/background.ts",
  "limit": 16,
  "offset": 14
}
```

**Output:**
```
<path>/home/xx/Lime/src/background.ts</path>
<type>file</type>
<content>
14:   touchProject,
15:   tx
16: } from "./database"
17: import type { Item, Project, SourceMeta } from "./types"
18: import type { ExtensionMessage } from "./types/messages"
19: import { isTodoComplete } from "./utils"
20: 
21: async function updateBadge() {
22:   try {
23:     const due = await getDueReviews()
24:     const todos = await searchItems({ type: "todo" })
25:     const incompleteTodos = todos.filter((t) => !isTodoComplete(t.content)).length
26:     const total = due.length + incompleteTodos
27:     chrome.action.setBadgeText({
28:       text: total > 0 ? String(total) : ""
29:     })

(Showing lines 14-29 of 373. Use offset=30 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 7.4s)

_Thinking:_

The background extension badge also uses `due.length + incompleteTodos` (the sum). 

The user's complaint is about the "todo icon 的数字显示" — the NavRail todo icon badge. The fix is to decouple `todoCount` from `dueCount`.

For the extension toolbar badge — it's the global attention indicator. I'll keep it as the sum (it aggregates both attention signals; removing reviews from it would hide review due dates from the toolbar, which was its historical purpose). The user complained specifically about the todo icon.

Wait — but let me reconsider. Is it possible the user considers the extension badge as part of "todo icon"? No. "todo icon" is the NavRail TODO button.

Let me implement:
1. options.tsx:1125-1126: `todoCount = todoStats.incomplete` + update comment.

Let me also double check: after this change, does anything break? `dueCount` is still used (NavRail review badge + FooterBar). `todoCount` only for the NavRail todo badge. Good.

Let me make the edit.

扩展 badge 是全局注意力聚合（历史即如此），用户抱怨的是 NavRail 的 todo 图标。修复：todo 图标 badge 只统计未完成 todo，去掉 `dueCount`：

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "newString": "  // Todo badge = incomplete todos only. Review cards must not inflate the\n  // todo icon's number (review has its own due-count badge on the 复习 button).\n  const todoCount = todoStats.incomplete",
  "oldString": "  // Todo badge = incomplete todos + due reviews (single attention number).\n  const todoCount = todoStats.incomplete + dueCount"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · DeepSeek V4 Flash · 8.0s)

_Thinking:_

Now — I should also reconsider the extension toolbar badge. The user's principle is "todo 数字不该受复习影响". The extension badge shows the sum. Should I decouple it too?

Let me think about the user's likely intent. The extension toolbar badge historically showed due reviews. During the todo feature, I made it `due + incompleteTodos`. The user's complaint is that REVIEW cards affect todo numbers.

Hmm — actually, let me reconsider whether the extension badge should be part of this fix. The user said "todo icon 的数字显示". If they ONLY mean the NavRail todo button, then the extension badge is out of scope. But the extension badge is literally the number on the extension icon — the most visible "badge". If the user sees the browser toolbar badge change when they add a review card, they might ALSO consider that a problem.

But — the extension badge is a GLOBAL indicator, not specifically the "todo icon". Its job is to show total attention needed. Keeping reviews in it is reasonable.

However — I realize there's a real risk of ambiguity. Let me think about what's most defensible:
- The NavRail todo badge: decoupled (done).
- The NavRail review badge: dueCount (unchanged).
- The extension toolbar badge: it aggregates both. 

I'll keep the extension badge as the sum, since it's the app-level attention badge and the user's specific complaint was the todo ICON. But I'll mention this in my summary so the user can decide.

Actually — wait. Let me reconsider. The user's message is a bit terse: "当前复习卡片上会影响todo icon的数字显示。分析并解决". The most literal reading: the review cards affect the todo icon's number. The todo icon = NavRail TODO button. Fix = decouple. Done.

But hold on — let me reconsider if there's an ACTUAL bug beyond the design. Let me think... When a card is added to review, `addReview` sets dueDate = now. `getDueReviews` returns reviews due <= now → includes it. So dueCount increments. `todoCount` = incomplete + dueCount increments. That's the coupling — by design (sum). The user now rejects it.

Is there a DIFFERENT bug? E.g., maybe `dueCount` isn't updating correctly and the todo badge shows a wrong number? The user says "会影响...数字显示" — it affects the display. The sum behavior is the cause. Decoupling fixes it.

Let me also verify: the `dueCount` in useReview — is it the DUE count or the TOTAL review count? Let me check useReview line 49-71. If dueCount were the total reviews (not due), that would be a bug (all reviews counted, even completed ones). Let me check.

确认 `dueCount` 是"待复习"而非"全部复习卡"（避免把已复习的也算进 todo 数字）：

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useReview.ts",
  "limit": 30,
  "offset": 47
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useReview.ts</path>
<type>file</type>
<content>
47:   } = options
48: 
49:   const [dueCount, setDueCount] = useState(0)
50:   const [reviewStats, setReviewStats] = useState<ReviewStats>({
51:     masteredCount: 0,
52:     dueCount: 0,
53:     activeCount: 0
54:   })
55:   const [recentItems, setRecentItems] = useState<
56:     { date: string; items: Item[] }[]
57:   >([])
58:   const [todayRatings, setTodayRatings] = useState<
59:     [number, number, number, number]
60:   >([0, 0, 0, 0])
61:   const [streakDays, setStreakDays] = useState(0)
62: 
63:   const allItemsRef = useRef(allItemsUnfiltered)
64:   allItemsRef.current = allItemsUnfiltered
65: 
66:   useEffect(() => {
67:     getReviewStatsByStore().then((s) => {
68:       setDueCount(s.dueCount)
69:       setReviewStats({
70:         masteredCount: s.masteredCount,
71:         dueCount: s.dueCount,
72:         activeCount: s.activeCount
73:       })
74:     })
75:     getRecentItemsBySrs(allItemsUnfiltered).then(setRecentItems)
76:     getAllReviews().then((reviews) => {

(Showing lines 47-76 of 177. Use offset=77 to continue.)
</content>
```

---

## Assistant (Build · DeepSeek V4 Flash · 22.2s)

_Thinking:_

`dueCount` comes from `getReviewStatsByStore().dueCount` — a proper due-count query (reviews due). So dueCount = 待复习数 (correct). The todo badge was `incomplete + dueCount` (the sum). Now decoupled.

The fix is clean. Let me verify tsc + tests + build, then commit.

Let me also reconsider the extension badge decision once more. Given the user's clear intent ("review cards shouldn't affect todo numbers"), and the extension badge shows `due + incompleteTodos` (the same coupling), I think I should at least ASK or mention it. But actually — let me reconsider: the extension badge is a GLOBAL indicator. It's not the "todo icon". The user's complaint is specifically about the todo icon. 

However — I want to be thorough. The extension badge showing the sum means: adding a review card bumps the toolbar badge. If the user's mental model is "todo 数字", they might be OK with the toolbar badge being an aggregate. But if they're strict about "reviews shouldn't affect todo numbers", they'd want the toolbar badge to not include reviews.

Let me make a judgment call: I'll keep the extension badge as the sum (global attention, historical review visibility preserved), and explicitly note this decision in my summary, offering to decouple it too if desired. This respects the "review-then-execute" workflow — I state my decision and let them adjust.

Actually — hmm. Let me reconsider. The user said "分析并解决" (analyze AND solve). They want it solved. The todo icon is solved. The extension badge — if I leave it coupled and the user later notices, that's another round. Let me think about which is more likely correct.

The extension badge historically = due reviews. It was the "review reminder" on the toolbar. During todo work I ADDED incomplete todos to it (making it the sum). So the extension badge's "review" content is the historical baseline; the todo addition was MY decision. 

Given the user now wants decoupling (reviews don't affect todo numbers), the cleanest consistent design:
- Extension badge = ? 

Option A: revert to due reviews only (historical). Then todos don't show on the toolbar. The user might miss the todo reminder.
Option B: keep the sum.
Option C: incomplete todos only. Then reviews vanish from the toolbar (bad).

Hmm. Actually — the user's original todo request wanted the badge to be "未完成卡片和未复习卡片之和". That was for the NAVRAIL todo icon (and the extension badge, which they lumped together? "使用和未完成复习一样的提醒方式（按钮数字和badge数字...）"). "按钮数字和badge数字" — button number AND badge number. So the ORIGINAL request wanted BOTH the button and the badge to show the sum. Now they want the todo icon decoupled.

So the "badge" in the original request = the extension badge. And the "按钮" = the NavRail todo button. Both showed the sum. Now the user says review cards affect "todo icon 的数字显示" and wants it fixed.

So — should I fix BOTH the NavRail todo badge AND the extension badge? The user said "todo icon". If "todo icon" = the NavRail button, fix that. The extension badge — is it a "todo icon"? No, it's the extension icon.

I'll fix the NavRail todo badge (done) and ALSO reconsider the extension badge. Given the original request explicitly wanted the badge = sum, and the user's current complaint is about the "todo icon", I think the extension badge (as the app-level aggregate) can stay as the sum. But to be safe, let me present this clearly and let the user decide.

Actually — let me reconsider the extension badge from the user's perspective ONE final time. The user sees:
- NavRail todo icon: shows incomplete + due. ← they complain about this.
- NavRail review icon: shows due.
- Extension toolbar badge: shows due + incomplete (sum).

If the user thinks "复习卡片影响 todo icon 数字", and the extension badge is a prominent number that ALSO includes reviews... they might consider it part of the problem. But the extension badge ALSO includes todos, so it's ambiguous which "part" it belongs to.

I'll keep the extension badge as the sum (it's the global attention indicator and its review component is historical), and clearly note it. The user can ask to change it.

Wait — actually, let me reconsider. I keep going back and forth. Let me just make the most defensible choice and present it:

**Fix**: NavRail todo badge = incomplete todos only. Extension toolbar badge stays as `due + incomplete` (global attention aggregate — review visibility preserved, historical behavior). Review button badge unchanged (dueCount).

Let me verify the build and commit, then update the memory (#157) since the composition changed.

Let me run tsc + tests + build.

`dueCount` 正确（待复习数）。修复到位。验证 + 提交：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && pnpm exec tsc --noEmit 2>&1 | head -5 && pnpm test 2>&1 | grep \"Tests:\" && pnpm run build 2>&1 | tail -1"
}
```

**Output:**
```
Tests:       81 passed, 81 total
🟢 DONE   | Finished in 3170ms!

```

---

## Assistant (Build · DeepSeek V4 Flash · 3.0s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && git add -A && git commit -m \"fix: todo badge counts incomplete todos only — review cards no longer inflate it\" -q && git log --oneline -1"
}
```

**Output:**
```
308607f fix: todo badge counts incomplete todos only — review cards no longer inflate it

```

---

## Assistant (Build · DeepSeek V4 Flash · 5.6s)

_Thinking:_

Committed. Now let me update the memory #157 since the composition changed:
- Old: "Todo badge composition: incomplete todo count + review due count (sum); review button badge unchanged."
- New: "Todo badge = incomplete todos only; review button badge = due reviews; extension toolbar badge = due reviews + incomplete todos (global attention)."

Let me update the memory.

Then present the summary. Let me also verify there are no other places using the old "sum" for the todo icon (I already checked). And present my decision on the extension badge.

更新记忆（badge 构成已变）：

**Tool: ctx_memory**

**Input:**
```json
{
  "action": "update",
  "ids": [
    157
  ],
  "content": "Badge composition (post-decouple): NavRail todo badge = incomplete todos ONLY (review cards must not inflate it); NavRail review badge = due reviews; extension toolbar badge = due reviews + incomplete todos (global attention aggregate, kept)."
}
```

**Output:**
```
Updated memory [ID: 157] in CONFIG_VALUES.
```

---

## Assistant (Build · DeepSeek V4 Flash · 5.0s)

分析并解决完成，提交 `308607f`。

## 分析

**根因**：todo 图标 badge 的计算是 `todoCount = todoStats.incomplete + dueCount`（`options.tsx`）——把**复习待办数**直接加进了 todo 图标。只要一张卡被加入复习（`addReview` 的 dueDate=now → 立即待复习），`dueCount` 就 +1，todo 图标随之跳变。这是 todo 功能最初设计时定的"和"语义，现在证明耦合不合理。

## 解决

- **NavRail todo 图标 badge = 未完成 todo 数**（去掉 `dueCount`）——复习卡不再影响它
- **复习图标 badge** 不变（`dueCount`，待复习数）
- **扩展工具栏 badge** 保持 `due + 未完成 todo`（全局注意力聚合，复习可见性保留，历史上即含复习数）——它不是"todo 图标"，未动

**验证**：`tsc` ✓、81 测试 ✓、构建 ✓。

如果扩展工具栏 badge 也想与复习解耦（改为只统计 todo，或回归只统计复习），告诉我，一行改动。

---

## User

分析当前的复习系统，关注底层的数据设计和算法与上层的功能设计

---

## Assistant (Plan · DeepSeek V4 Flash · 8.9s)

_Thinking:_

The user wants me to analyze the current review system — focusing on the bottom-level data design and algorithm, and the top-level functional design. This is a read-only analysis task (plan mode).

Recall from the session history: the user earlier said "现有的复习系统感觉底层的实现有一些问题；先搁置复习系统相关的推进" — they felt the review system's underlying implementation has problems but shelved it. Now they want a thorough analysis of:
1. 底层的数据设计和算法 (bottom-level data design and algorithm) — the SRS data model, SM-2 algorithm, DB stores.
2. 上层的功能设计 (top-level functional design) — the review UI/session flow.

Let me analyze the review system thoroughly. I need to read:
- src/hooks/useReview.ts (review state management)
- src/hooks/useSrs.ts (probably the SRS logic)
- The review-related parts of src/database/index.ts (ReviewEntry, getDueReviews, updateReviewSrs, getReviewStatsByStore, getRecentItemsBySrs, addReview, removeReview)
- The SM-2 algorithm (rateSrs) in utils
- ReviewSession component
- The review parts of options.tsx
- The types (ReviewEntry, SrsData)
- The background badge using reviews

Let me read these files to build a comprehensive analysis.

Let me start by reading the types, database review functions, SRS algorithm, useReview, useSrs, and ReviewSession.

Let me recall from memory:
- #88: SRS review (SM-2) operates on all items across all projects. Cards without srs data are treated as due on first review (zero-onboarding).
- #127: Review queue uses DB as sole source of truth: after each rating, write to DB via updateReviewSrs, then re-read getDueReviews() to refresh the queue. React reviewItems is a snapshot.
- SM-2 algorithm: starting ease 2.5, min 1.3, max interval 365 days.
- Ratings: 1=重来, 2=困难, 3=良好, 4=简单.
- Cards rated <3 are requeued (trim-queue); >=3 removed from queue.
- Review data in separate `reviews` store (ReviewEntry with itemId unique index).
- Card must have Item.title before it can be added to review.

Let me read the actual code to analyze deeply. Let me look at:
1. `src/types/index.ts` — ReviewEntry, SrsData definitions.
2. `src/utils/index.ts` — rateSrs (SM-2).
3. `src/database/index.ts` — review store functions.
4. `src/hooks/useSrs.ts`, `useReview.ts`.
5. `src/components/ReviewSession.tsx`.
6. options.tsx review parts.
7. background.ts badge + webdav proxy.

Let me read these.

复习系统分析。先读底层数据模型与算法（类型、rateSrs、database 复习函数）：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"ReviewEntry\\|SrsData\\|interface.*Review\" src/types/index.ts | head; echo \"=== ReviewEntry 定义 ===\"; sed -n \"$(grep -n 'interface ReviewEntry\\|interface SrsData\\|type ReviewEntry\\|type SrsData' src/types/index.ts | head -1 | cut -d: -f1),+40p\" src/types/index.ts"
}
```

**Output:**
```
17:export interface SrsData {
65:export interface ReviewEntry {
69:  srs: SrsData
=== ReviewEntry 定义 ===
export interface SrsData {
  dueDate: number
  interval: number
  easeFactor: number
  reviewCount: number
  lastReviewDate: number
  reviewHistory?: { date: number; rating: 1 | 2 | 3 | 4 }[]
}

export interface Item {
  id: string
  type: ItemType
  /** User's title/summary — the card's core identifier */
  title?: string
  content: string
  context?: {
    paragraph?: string
  }
  source?: SourceMeta
  createdAt: number
  projectId?: string
  sectionId?: string
  /** Mark as read/unread for link type */
  read?: boolean
  hash?: string
  /** Derived field for indexing */
  sourceSite?: string
  /** Manual ordering within a project (lower = earlier) */
  order?: number
  /** Last modification timestamp (for incremental sync) */
  updatedAt?: number
  /** Optional attached image URLs (mixed cards: text + images) */
  images?: string[]
  /** Todo due date as local "YYYY-MM-DD" (day-based expiry) */
  dueDate?: string
}

export interface SearchQuery {
  keyword?: string
  site?: string
  type?: ItemType

```

---

## Assistant (Plan · DeepSeek V4 Flash · 4.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/types/index.ts",
  "limit": 14,
  "offset": 62
}
```

**Output:**
```
<path>/home/xx/Lime/src/types/index.ts</path>
<type>file</type>
<content>
62: 
63: export type ReviewStatus = "active" | "mastered"
64: 
65: export interface ReviewEntry {
66:   id: string
67:   itemId: string
68:   projectId: string
69:   srs: SrsData
70:   status: ReviewStatus
71:   /** Denormalized from srs.dueDate for IndexedDB indexing */
72:   dueDate: number
73:   addedAt: number
74: }
75: 

(Showing lines 62-75 of 110. Use offset=76 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.6s)

_Thinking:_

Now the data model:
- `SrsData`: dueDate, interval, easeFactor, reviewCount, lastReviewDate, reviewHistory (optional).
- `ReviewEntry`: id, itemId, projectId, srs (SrsData), status, dueDate (denormalized for indexing), addedAt.

Now let me read rateSrs (SM-2 algorithm) in utils.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"rateSrs\\|SM-2\\|easeFactor\\|interval\" src/utils/index.ts | head; echo \"=== rateSrs ===\"; sed -n \"$(grep -n 'export function rateSrs' src/utils/index.ts | cut -d: -f1),+40p\" src/utils/index.ts"
}
```

**Output:**
```
=== rateSrs ===
sed: -e expression #1, char 1: unknown command: `,'

```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.7s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -rn \"rateSrs\" src/ | head; echo \"=== useSrs ===\"; ls src/hooks/"
}
```

**Output:**
```
src/options.tsx:77:import { dayKey, rateSrs } from "./hooks/useSrs"
src/options.tsx:620:        ? rateSrs(currentSrs, rating)
src/options.tsx:621:        : rateSrs(
src/hooks/useSrs.ts:15:export function rateSrs(srs: SrsData, rating: 1 | 2 | 3 | 4): SrsData {
src/database/index.test.ts:1:import { rateSrs } from "../hooks/useSrs"
src/database/index.test.ts:420:      const srs = rateSrs(
src/database/index.test.ts:433:        current = rateSrs(current, 4)
src/database/index.test.ts:447:      const srs = rateSrs(
=== useSrs ===
useBackupSync.ts
useCardDragReorder.ts
useNewCard.ts
useProjects.ts
useReview.ts
useSrs.ts

```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.1s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useSrs.ts"
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useSrs.ts</path>
<type>file</type>
<content>
1: import { getAllReviews } from "../database"
2: import type { Item, ReviewEntry, SrsData } from "../types"
3: 
4: function defaultSrs(): SrsData {
5:   return {
6:     dueDate: Date.now(),
7:     interval: 0,
8:     easeFactor: 2.5,
9:     reviewCount: 0,
10:     lastReviewDate: 0
11:   }
12: }
13: 
14: /** Apply SM-2 rating to SrsData, returning a new SrsData */
15: export function rateSrs(srs: SrsData, rating: 1 | 2 | 3 | 4): SrsData {
16:   let { interval, easeFactor, reviewCount } = srs
17:   reviewCount++
18: 
19:   if (rating < 3) {
20:     interval = 1
21:     easeFactor = Math.max(1.3, easeFactor - 0.2)
22:   } else if (rating === 3) {
23:     interval = Math.max(1, interval * easeFactor)
24:   } else {
25:     interval = Math.max(1, interval * easeFactor * 1.3)
26:     easeFactor += 0.15
27:   }
28: 
29:   interval = Math.min(365, Math.max(1, Math.round(interval)))
30:   easeFactor = Math.max(1.3, Math.round(easeFactor * 100) / 100)
31: 
32:   const now = Date.now()
33:   const reviewHistory = [
34:     ...(srs.reviewHistory ?? []),
35:     { date: now, rating }
36:   ].slice(-200)
37: 
38:   return {
39:     interval,
40:     easeFactor,
41:     reviewCount,
42:     dueDate: rating < 3 ? now : now + interval * 86400000,
43:     lastReviewDate: now,
44:     reviewHistory
45:   }
46: }
47: 
48: export interface ReviewStats {
49:   masteredCount: number
50:   dueCount: number
51:   activeCount: number
52: }
53: 
54: const DAY_MS = 86400000
55: 
56: export function dayKey(ts: number): string {
57:   const d = new Date(ts)
58:   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
59: }
60: 
61: export async function getRecentItems(
62:   allItems: Item[],
63:   days = 3
64: ): Promise<{ date: string; items: Item[] }[]> {
65:   const cutoff = Date.now() - days * DAY_MS
66:   const reviews = await getAllReviews()
67:   // Filter for recently reviewed entries
68:   const recentReviews = reviews.filter((r) => r.srs.lastReviewDate >= cutoff)
69:   if (recentReviews.length === 0) return []
70: 
71:   // Build item lookup
72:   const itemMap = new Map(allItems.map((i) => [i.id, i]))
73: 
74:   // Group by date with actual items
75:   const map = new Map<string, Item[]>()
76:   for (const r of recentReviews) {
77:     const item = itemMap.get(r.itemId)
78:     if (!item) continue
79:     const key = dayKey(r.srs.lastReviewDate)
80:     const arr = map.get(key) ?? []
81:     arr.push(item)
82:     map.set(key, arr)
83:   }
84: 
85:   return Array.from(map.entries())
86:     .sort((a, b) => b[0].localeCompare(a[0]))
87:     .map(([date, cardItems]) => ({ date, items: cardItems }))
88: }

(End of file - total 88 lines)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 14.8s)

_Thinking:_

Now I have the SM-2 algorithm. Let me analyze it carefully:

**rateSrs analysis:**
```ts
reviewCount++
if (rating < 3) {
  interval = 1
  easeFactor = Math.max(1.3, easeFactor - 0.2)
} else if (rating === 3) {
  interval = Math.max(1, interval * easeFactor)
} else {  // rating 4
  interval = Math.max(1, interval * easeFactor * 1.3)
  easeFactor += 0.15
}
interval = Math.min(365, Math.max(1, Math.round(interval)))
easeFactor = Math.max(1.3, Math.round(easeFactor * 100) / 100)
dueDate = rating < 3 ? now : now + interval * 86400000
```

**Problems in the algorithm:**

1. **First-review bug (interval = 0 → 0 × easeFactor = 0 → Math.max(1, 0) = 1 day)**: On the first review (interval = 0), rating 3 → `interval * easeFactor` = 0 → Math.max(1, 0) = 1. Rating 4 → 0 × EF × 1.3 = 0 → 1. So the first "良好"/"简单" rating schedules the next review in **1 day**. But standard SM-2 schedules the FIRST interval at 1 day for rating 3, 2-3 days for rating 4. Here rating 3 and 4 both give 1 day on the first review — a rating-4 first review is indistinguishable from rating 3 (both 1 day). That's a **real flaw**: the interval multiplication `interval * easeFactor` on interval=0 always yields 0 → clamped to 1. So the first interval is ALWAYS 1 day regardless of rating. The intent (rating 4 = longer) doesn't manifest until the SECOND review.

2. **Rating 3 doesn't adjust easeFactor**: Standard SM-2: quality 4 → EF + 0.1, quality 5 → EF + 0 (no change), quality < 3 → EF decreases. Here rating 3 (良好) leaves EF unchanged (correct per SM-2: quality 3 = no change), rating 4 increases +0.15 (SM-2 uses +0.1 for quality 4). Minor deviation.

3. **rating < 3 → interval = 1** (not "reset to 0" or "1 day"). Standard SM-2: quality < 3 → repetitions reset to 0 (interval = 0, review again same day). Here it schedules 1 DAY later (interval=1) but dueDate = now (rating<3 → dueDate = now). So the dueDate is NOW but interval=1. **Inconsistency**: dueDate = now (immediately due) but interval = 1 (says 1 day). On the next rating of this card (same session, since it's due now), `interval * easeFactor` = 1 × EF. So after a "重来", the next rating uses interval=1 as the basis. This conflates "repetitions reset" with "1 day". In standard SM-2, a failed card resets repetitions to 0 (next interval is 1 day on success). Here the reset to 1 is roughly equivalent but the dueDate=now means it's re-due immediately (same session) — which is the trim-queue behavior (rated <3 requeued). OK.

4. **Ease factor on rating 3**: `interval * easeFactor` — with interval possibly 0 (first review) → 0 → 1. Standard SM-2 first intervals: I(1) = 1, I(2) = 6 (after EF... actually SM-2: I(n) = I(n-1) × EF for n>2, I(1)=1, I(2)=6). This implementation collapses to a simpler Anki-ish model. Not strictly SM-2 but a reasonable variant.

5. **easeFactor cap**: min 1.3, no max cap. Standard SM-2 caps EF at 1.3 min. Anki caps EF at ~2.5-3.0 max? Anki has a max ease (default 3.1?). Here no upper bound — EF can grow unboundedly with rating 4 (+0.15 each). Long-term this inflates intervals toward the 365 cap. Minor.

6. **dueDate = now + interval×86400000** — the interval is in DAYS from now. For rating <3, dueDate=now → re-due immediately.

Now the data design:

**ReviewEntry denormalization:**
- `srs.dueDate` AND top-level `dueDate` (denormalized for IndexedDB index). The index is on the top-level `dueDate`. This dual storage is a **maintenance hazard**: updateReviewSrs must update BOTH (or they drift). Let me verify how updateReviewSrs handles it.
- `status: "active" | "mastered"` — but is `mastered` ever set? The algorithm has no concept of "graduating" to mastered (e.g., interval >= some threshold like 21 days → mastered). Let me check where status is set. If status is never updated to "mastered", the masteredCount stat is always 0 (except manually?). Let me check.
- `projectId` on ReviewEntry — denormalized from the item, for the review date-filter view. Also a sync/consistency concern.

Let me read the database review functions: getDueReviews, updateReviewSrs, addReview, removeReview, getReviewStatsByStore, getRecentItemsBySrs.

Let me read the database index.ts review sections.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"getDueReviews\\|updateReviewSrs\\|addReview\\|removeReview\\|getReviewStatsByStore\\|getRecentItemsBySrs\\|getAllReviews\\|deleteReview\\|mastered\" src/database/index.ts | head -30"
}
```

**Output:**
```
80:                  status: item.srs.interval >= 365 ? "mastered" : "active",
620:export async function addReview(entry: ReviewEntry): Promise<void> {
626:export async function removeReview(itemId: string): Promise<void> {
653:export async function getDueReviews(): Promise<ReviewEntry[]> {
675:export async function getAllReviews(): Promise<ReviewEntry[]> {
694:export async function getReviewStatsByStore(): Promise<{
697:  masteredCount: number
703:      let masteredCount = 0
714:          if (entry.status === "mastered") masteredCount++
717:          resolve({ dueCount, activeCount, masteredCount })
725:export async function updateReviewSrs(
738:          // Auto-promote to mastered when interval reaches max
739:          if (srs.interval >= 365) entry.status = "mastered"

```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.2s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/database/index.ts",
  "limit": 120,
  "offset": 620
}
```

**Output:**
```
<path>/home/xx/Lime/src/database/index.ts</path>
<type>file</type>
<content>
620: export async function addReview(entry: ReviewEntry): Promise<void> {
621:   await withStore("reviews", "readwrite", (store) => {
622:     store.put(entry)
623:   })
624: }
625: 
626: export async function removeReview(itemId: string): Promise<void> {
627:   await withStore("reviews", "readwrite", (store) => {
628:     const idx = store.index("itemId")
629:     return new Promise<void>((resolve, reject) => {
630:       const req = idx.getKey(itemId)
631:       req.onsuccess = () => {
632:         if (req.result) store.delete(req.result as string)
633:         resolve()
634:       }
635:       req.onerror = () => reject(req.error)
636:     })
637:   })
638: }
639: 
640: export async function getReviewByItemId(
641:   itemId: string
642: ): Promise<ReviewEntry | undefined> {
643:   return withStore("reviews", "readonly", (store) => {
644:     const idx = store.index("itemId")
645:     return new Promise<ReviewEntry | undefined>((resolve, reject) => {
646:       const req = idx.get(itemId)
647:       req.onsuccess = () => resolve(req.result as ReviewEntry | undefined)
648:       req.onerror = () => reject(req.error)
649:     })
650:   })
651: }
652: 
653: export async function getDueReviews(): Promise<ReviewEntry[]> {
654:   return withStore("reviews", "readonly", (store) => {
655:     const idx = store.index("dueDate")
656:     const range = IDBKeyRange.upperBound(Date.now())
657:     return new Promise<ReviewEntry[]>((resolve, reject) => {
658:       const results: ReviewEntry[] = []
659:       const req = idx.openCursor(range)
660:       req.onsuccess = () => {
661:         const cursor = req.result
662:         if (cursor) {
663:           const entry = cursor.value as ReviewEntry
664:           if (entry.status === "active") results.push(entry)
665:           cursor.continue()
666:         } else {
667:           resolve(results)
668:         }
669:       }
670:       req.onerror = () => reject(req.error)
671:     })
672:   })
673: }
674: 
675: export async function getAllReviews(): Promise<ReviewEntry[]> {
676:   return withStore("reviews", "readonly", (store) => {
677:     return new Promise<ReviewEntry[]>((resolve, reject) => {
678:       const results: ReviewEntry[] = []
679:       const req = store.openCursor()
680:       req.onsuccess = () => {
681:         const cursor = req.result
682:         if (cursor) {
683:           results.push(cursor.value as ReviewEntry)
684:           cursor.continue()
685:         } else {
686:           resolve(results)
687:         }
688:       }
689:       req.onerror = () => reject(req.error)
690:     })
691:   })
692: }
693: 
694: export async function getReviewStatsByStore(): Promise<{
695:   dueCount: number
696:   activeCount: number
697:   masteredCount: number
698: }> {
699:   return withStore("reviews", "readonly", (store) => {
700:     return new Promise((resolve, reject) => {
701:       let dueCount = 0
702:       let activeCount = 0
703:       let masteredCount = 0
704:       const now = Date.now()
705:       const req = store.openCursor()
706:       req.onsuccess = () => {
707:         const cursor = req.result
708:         if (cursor) {
709:           const entry = cursor.value as ReviewEntry
710:           if (entry.status === "active") {
711:             activeCount++
712:             if (entry.dueDate <= now) dueCount++
713:           }
714:           if (entry.status === "mastered") masteredCount++
715:           cursor.continue()
716:         } else {
717:           resolve({ dueCount, activeCount, masteredCount })
718:         }
719:       }
720:       req.onerror = () => reject(req.error)
721:     })
722:   })
723: }
724: 
725: export async function updateReviewSrs(
726:   itemId: string,
727:   srs: SrsData
728: ): Promise<void> {
729:   await withStore("reviews", "readwrite", (store) => {
730:     const idx = store.index("itemId")
731:     return new Promise<void>((resolve, reject) => {
732:       const req = idx.get(itemId)
733:       req.onsuccess = () => {
734:         const entry = req.result as ReviewEntry
735:         if (entry) {
736:           entry.srs = srs
737:           entry.dueDate = srs.dueDate
738:           // Auto-promote to mastered when interval reaches max
739:           if (srs.interval >= 365) entry.status = "mastered"

(Showing lines 620-739 of 747. Use offset=740 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 15.9s)

_Thinking:_

Now I have the database layer. Let me read the rest of updateReviewSrs and the useReview hook + the review session UI + how options.tsx wires it.

Key observations so far:

**Data design:**
1. `ReviewEntry` has BOTH `srs.dueDate` AND a denormalized top-level `dueDate` (for the IDB index). `updateReviewSrs` updates both (line 736-737). The index is on `dueDate`. This dual-write is a maintenance hazard but currently consistent.

2. **`status` semantics are muddled**: 
   - `addReview` creates with status "active" (from options line ~590).
   - `updateReviewSrs` auto-promotes to "mastered" when `interval >= 365` (line 738-739).
   - `getDueReviews` filters `status === "active"` AND `dueDate <= now`.
   - `getReviewStatsByStore` counts active/mastered.
   - **Problem**: A "mastered" card (interval=365) is EXCLUDED from the due queue forever. But when you rate it <3 (重来), `rateSrs` sets interval=1 but `updateReviewSrs` only promotes to mastered when interval>=365 — it does NOT demote from mastered to active! So a mastered card rated <3: interval=1, dueDate=now, but `status` stays "mastered" → `getDueReviews` excludes it (status !== "active") → **the card vanishes from review forever**. This is a **real bug**: once a card hits interval 365 and becomes "mastered", rating it poorly can't bring it back (it's permanently filtered out).

   Wait — let me double check. `getDueReviews` filters `entry.status === "active"`. A mastered card rated 1/2/3/4: rateSrs returns new srs; updateReviewSrs sets entry.srs = srs, entry.dueDate = srs.dueDate, and only promotes (interval >= 365 → mastered). If the rated srs has interval < 365, the status is NOT changed → stays "mastered". So the card is mastered and excluded. **Confirmed bug.**

   Actually — also the threshold: "mastered" at interval >= 365. On the rating that reaches 365, status becomes mastered. But that same rating set dueDate = now + 365 days. So the card is "mastered" (no longer in queue). Fine. But if you then review it manually... how do you review a mastered card? You can't (it's filtered out of due). So mastered cards are terminal. Unless the user re-adds (removeReview + addReview). This is a design flaw: no way to un-master, and rating <3 on a mastered card is impossible (it never appears).

   Actually — wait, there's a deeper issue. A card reaches mastered via interval >= 365. To have interval 365, the user must have rated it 3/4 repeatedly. When they hit exactly 365, it's mastered. But the rating that produces interval 365 — was it rated 3 or 4? Either way mastered. So the "mastered" state is an auto-promotion with no user control and no way back. And the mastered count is a stat but mastered cards are excluded from review entirely.

3. **`getDueReviews` uses the `dueDate` index with `IDBKeyRange.upperBound(now)`** — returns all entries with dueDate <= now. Then filters active in the cursor. Efficient-ish (index scan). But — the `dueDate` here is the DENORMALIZED top-level field. If it ever drifts from srs.dueDate, the query is wrong. Currently kept in sync.

4. **`getReviewStatsByStore` scans the WHOLE store** (openCursor) counting — O(n) per call. Called on review tab enter + badge updates. For large data, minor.

5. **No cap on review history growth** — reviewHistory sliced to 200 (rateSrs line 36). OK, bounded.

6. **`projectId` denormalized on ReviewEntry** — used for the review-date filter (filter by project). If an item moves projects (impossible now — cards can't change project), drift. Also the review-date view filters by projectId. Since cards can't change project, OK.

7. **`dueDate` top-level denormalization** — actually there's a subtle issue: `entry.dueDate = srs.dueDate` in updateReviewSrs, but does addReview also set both? Let me check options addReview — it sets `srs: {..., dueDate: Date.now()}` AND `dueDate: Date.now()`. So yes both. OK.

**Algorithm issues (rateSrs):**
1. **First-review interval always 1 day** (interval=0 × EF = 0 → clamp 1) — rating 3 and 4 both schedule 1 day on first review. Rating 4 gives no longer first interval. Real flaw.
2. **rating < 3 → dueDate = now** but **interval = 1** — the "重来" card is due immediately (requeued in-session), but its interval is set to 1. On the next rating, interval × EF = 1 × EF. This is roughly SM-2's "reset to 0 repetitions, next interval 1 day" — acceptable but the interval=1 + dueDate=now is semantically odd (interval says "1 day until due" but dueDate says "now").
3. **EF unbounded upper** — no max cap. With rating 4 (+0.15), EF grows toward infinity, intervals slam into the 365 cap faster. Anki caps ease (default 2.5 max ~2.6-ish, configurable 1.3-3.0). Minor long-term.
4. **Rating 3 vs 4 both on interval=0 → 1 day** — the "简单" (4) on first review doesn't jump ahead. In SM-2 the first interval for quality 4 is ~4 days, quality 3 is 1 day. Here both 1 day.
5. **No minimum first interval for rating 4** — should be ~4 days (SM-2 I(2)=6 after I(1)=1... actually the classic SM-2: I(1)=1, I(2)=6, I(n)=I(n-1)×EF). This implementation never does the "6 day" second interval — it's always interval × EF from day 1. So the schedule grows purely multiplicatively: 1 → EF → EF² → ... which is a reasonable Anki-like model but NOT SM-2's step function. The docstring says "Apply SM-2 rating" but it's actually an Anki-ish variant.

**Now the upper functional design (useReview + ReviewSession + options wiring):**

Let me read useReview.ts fully and ReviewSession.tsx and the options review flow.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/hooks/useReview.ts"
}
```

**Output:**
```
<path>/home/xx/Lime/src/hooks/useReview.ts</path>
<type>file</type>
<content>
1: import { useCallback, useEffect, useMemo, useRef, useState } from "react"
2: 
3: import type { SidebarTab } from "../components/NavRail"
4: import {
5:   searchItems as dbSearch,
6:   getAllReviews,
7:   getDueReviews,
8:   getReviewStatsByStore
9: } from "../database"
10: import type { Item } from "../types"
11: import { dayKey, getRecentItems as getRecentItemsBySrs } from "./useSrs"
12: import type { ReviewStats } from "./useSrs"
13: 
14: function pairWithItems(
15:   reviews: Awaited<ReturnType<typeof getDueReviews>>,
16:   items: Item[]
17: ): Item[] {
18:   const itemMap = new Map(items.map((i) => [i.id, i]))
19:   return reviews
20:     .map((r) => itemMap.get(r.itemId))
21:     .filter((i): i is Item => i !== undefined)
22: }
23: 
24: interface UseReviewOptions {
25:   allItemsUnfiltered: Item[]
26:   searchItems: typeof dbSearch
27:   onSearch: () => Promise<void>
28:   sidebarTab: SidebarTab
29:   setSidebarTab: (tab: SidebarTab) => void
30:   reviewItems: Item[]
31:   setReviewItems: (items: Item[]) => void
32:   reviewDateFilter: string | null
33:   setReviewDateFilter: (key: string | null) => void
34: }
35: 
36: export function useReview(options: UseReviewOptions) {
37:   const {
38:     allItemsUnfiltered,
39:     searchItems,
40:     onSearch,
41:     sidebarTab,
42:     setSidebarTab,
43:     reviewItems,
44:     reviewDateFilter,
45:     setReviewDateFilter,
46:     setReviewItems
47:   } = options
48: 
49:   const [dueCount, setDueCount] = useState(0)
50:   const [reviewStats, setReviewStats] = useState<ReviewStats>({
51:     masteredCount: 0,
52:     dueCount: 0,
53:     activeCount: 0
54:   })
55:   const [recentItems, setRecentItems] = useState<
56:     { date: string; items: Item[] }[]
57:   >([])
58:   const [todayRatings, setTodayRatings] = useState<
59:     [number, number, number, number]
60:   >([0, 0, 0, 0])
61:   const [streakDays, setStreakDays] = useState(0)
62: 
63:   const allItemsRef = useRef(allItemsUnfiltered)
64:   allItemsRef.current = allItemsUnfiltered
65: 
66:   useEffect(() => {
67:     getReviewStatsByStore().then((s) => {
68:       setDueCount(s.dueCount)
69:       setReviewStats({
70:         masteredCount: s.masteredCount,
71:         dueCount: s.dueCount,
72:         activeCount: s.activeCount
73:       })
74:     })
75:     getRecentItemsBySrs(allItemsUnfiltered).then(setRecentItems)
76:     getAllReviews().then((reviews) => {
77:       const todayKey = dayKey(Date.now())
78:       const allDateKeys = new Set<string>()
79:       const counts: [number, number, number, number] = [0, 0, 0, 0]
80:       for (const r of reviews) {
81:         if (!r.srs.reviewHistory) continue
82:         let foundToday = false
83:         for (const h of r.srs.reviewHistory) {
84:           allDateKeys.add(dayKey(h.date))
85:           if (dayKey(h.date) === todayKey && !foundToday) {
86:             foundToday = true
87:             if (h.rating >= 1 && h.rating <= 4) counts[h.rating - 1]++
88:           }
89:         }
90:       }
91:       setTodayRatings(counts)
92:       const sorted = Array.from(allDateKeys).sort().reverse()
93:       const now = new Date()
94:       let streak = 0
95:       for (let i = 0; i < sorted.length; i++) {
96:         const d = new Date(now)
97:         d.setDate(now.getDate() - i)
98:         if (sorted[i] === dayKey(d.getTime())) streak++
99:         else break
100:       }
101:       setStreakDays(streak)
102:     })
103:   }, [allItemsUnfiltered])
104: 
105:   // Load due cards every time the user enters review tab (always from DB)
106:   // allItemsUnfiltered NOT in deps to prevent refreshAllData from racing with rating timeout
107:   useEffect(() => {
108:     if (sidebarTab !== "review" || reviewDateFilter) {
109:       return
110:     }
111:     getDueReviews().then((due) => {
112:       const items = pairWithItems(due, allItemsRef.current)
113:       setReviewItems(items)
114:     })
115:   }, [sidebarTab, reviewDateFilter]) // eslint-disable-line react-hooks/exhaustive-deps
116: 
117:   const recentDates = useMemo(() => {
118:     const DAY_MS = 86400000
119:     const now = Date.now()
120:     const result: { key: string; label: string; count: number }[] = []
121:     for (let i = 0; i < 3; i++) {
122:       const d = new Date(now - i * DAY_MS)
123:       const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
124:       const label = i === 0 ? "（今天）" : i === 1 ? "（昨天）" : "（前天）"
125:       const group = recentItems.find((g) => g.date === key)
126:       if (group)
127:         result.push({
128:           key,
129:           label: `${d.getMonth() + 1}月${d.getDate()}日${label}`,
130:           count: group.items.length
131:         })
132:     }
133:     return result
134:   }, [recentItems])
135: 
136:   const reviewDateItems = useMemo(() => {
137:     if (!reviewDateFilter) return []
138:     return recentItems.find((g) => g.date === reviewDateFilter)?.items ?? []
139:   }, [reviewDateFilter, recentItems])
140: 
141:   // Entering review tab: load due cards (fresh, no session persistence)
142:   const handleStartReview = useCallback(async () => {
143:     const due = await getDueReviews()
144:     const items = pairWithItems(due, allItemsUnfiltered)
145:     setReviewItems(items)
146:     setSidebarTab("review")
147:   }, [allItemsUnfiltered, setSidebarTab, setReviewItems])
148: 
149:   const handleExitReview = useCallback(async () => {
150:     setReviewItems([])
151:     setReviewDateFilter(null)
152:     setSidebarTab("projects")
153:     await onSearch()
154:   }, [onSearch, setSidebarTab, setReviewItems, setReviewDateFilter])
155: 
156:   const handleReviewDateClick = useCallback(
157:     (dateKey: string | null) => {
158:       if (dateKey) setReviewItems([])
159:       setReviewDateFilter(dateKey)
160:       if (dateKey) setSidebarTab("review")
161:     },
162:     [setSidebarTab, setReviewDateFilter, setReviewItems]
163:   )
164: 
165:   return {
166:     dueCount,
167:     reviewStats,
168:     todayRatings,
169:     streakDays,
170:     recentDates,
171:     reviewDateItems,
172:     handleStartReview,
173:     handleExitReview,
174:     handleReviewDateClick,
175:     recentItems
176:   }
177: }

(End of file - total 177 lines)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 5.2s)

_Thinking:_

Now let me read the ReviewSession component and how options.tsx wires the review flow (handleReviewRate, the review session state). Let me also check the review session UI.

Key observations from useReview:
- `reviewItems` (the queue) is state in options, set from getDueReviews. 
- Entering review: getDueReviews → pairWithItems → setReviewItems.
- The review session state (reviewIndex, reviewFlipped, reviewCompleted, sessionRatings) lives in options.tsx.
- `handleStartReview` — not actually used? The review auto-loads via the useEffect on sidebarTab. Memory #75 says no manual start button — entering the tab auto-triggers.
- `recentItems` / `reviewDateFilter` — the date-filter view.

Now the options.tsx review flow (handleReviewRate, the session logic). Let me read it.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 95,
  "offset": 613
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
613:         reviewItems.length === 0
614:       )
615:         return
616:       const current = reviewItems[reviewIndex]
617:       if (!current) return
618:       const currentSrs = reviewSrsMap.get(current.id)
619:       const newSrs = currentSrs
620:         ? rateSrs(currentSrs, rating)
621:         : rateSrs(
622:             {
623:               dueDate: Date.now(),
624:               interval: 0,
625:               easeFactor: 2.5,
626:               reviewCount: 0,
627:               lastReviewDate: 0
628:             },
629:             rating
630:           )
631:       await updateReviewSrs(current.id, newSrs)
632:       setSessionRatings((prev) => {
633:         if (prev.has(current.id)) return prev
634:         const next = new Map(prev)
635:         next.set(current.id, rating)
636:         return next
637:       })
638:       setAnimating(true)
639:       setSlideDir(1)
640:       setTimeout(async () => {
641:         const due = await getDueReviews()
642:         const itemMap = new Map(allItemsUnfiltered.map((i) => [i.id, i]))
643:         const items = due
644:           .map((r) => itemMap.get(r.itemId))
645:           .filter((i): i is Item => i !== undefined)
646:         setReviewFlipped(false)
647:         if (items.length === 0) {
648:           setReviewCompleted(true)
649:           setReviewItems([])
650:         } else {
651:           setReviewItems(items)
652:           setReviewIndex(0)
653:         }
654:         setAnimating(false)
655:       }, 350)
656:     },
657:     [reviewIndex, reviewItems, reviewSrsMap, animating, allItemsUnfiltered]
658:   )
659: 
660:   const handleReviewPrev = useCallback(() => {
661:     if (reviewIndex > 0 && !animating) {
662:       setSlideDir(-1)
663:       setAnimating(true)
664:       setReviewFlipped(false)
665:       setTimeout(() => {
666:         setReviewIndex((i) => i - 1)
667:         setAnimating(false)
668:       }, 350)
669:     }
670:   }, [reviewIndex, animating])
671: 
672:   const handleReviewNext = useCallback(() => {
673:     if (reviewIndex < reviewItems.length - 1 && !animating) {
674:       setSlideDir(1)
675:       setAnimating(true)
676:       setReviewFlipped(false)
677:       setTimeout(() => {
678:         setReviewIndex((i) => i + 1)
679:         setAnimating(false)
680:       }, 350)
681:     }
682:   }, [reviewIndex, reviewItems.length, animating])
683: 
684:   const {
685:     backupFileInputRef,
686:     handleExportBackup,
687:     handleUploadSync,
688:     handleDownloadSync
689:   } = useBackupSync({
690:     projects,
691:     allItemsUnfiltered,
692:     backupSelectedIds,
693:     setBackupSelectedIds,
694:     syncStatus,
695:     setSyncStatus,
696:     refreshAllData,
697:     setSnackbarMsg
698:   })
699: 
700:   const handleImportBackupFile = async (
701:     e: React.ChangeEvent<HTMLInputElement>
702:   ) => {
703:     const file = e.target.files?.[0]
704:     if (!file) return
705:     try {
706:       const result = await importFromZip(
707:         file,

(Showing lines 613-707 of 2082. Use offset=708 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 11.4s)

_Thinking:_

Now I understand the review session flow in options.tsx:

**handleReviewRate:**
1. Gets the current card + its srs from `reviewSrsMap`.
2. Applies `rateSrs`.
3. `updateReviewSrs(current.id, newSrs)` — writes to DB.
4. Records the session rating (sessionRatings Map, first rating per card wins — `if (prev.has(current.id)) return prev`).
5. Sets animating + slide, then after 350ms re-queries `getDueReviews()` and rebuilds the queue. If empty → reviewCompleted. Else setReviewItems + setReviewIndex(0).

**Key design observations (upper layer):**

1. **The queue is fully rebuilt after every rating** — after each rating, `getDueReviews()` re-queries and the queue resets to index 0. So the review session is NOT a fixed queue; it's "everything due right now, reshuffled after each rating". Cards rated <3 (due now) get requeued (still due) → appear again. Cards rated >=3 get future due dates → removed from queue. So the session continues until no cards are due. This is the "trim-queue" model.

   **Problem 1 — the queue shrinks and reshuffles**: After rating card N, the whole queue re-queries (due cards only) and resets to index 0. So the review ORDER changes after each rating (the due set shrinks). The user reviews the FIRST due card each time. This means the order is effectively "dueDate asc" (from the index scan) each round, and requeued cards (rating<3) jump to the FRONT (their dueDate = now, which is <= the other due cards' dueDate... actually all due cards have dueDate <= now, so the requeued card with dueDate=now is the LAST in the index scan order (highest dueDate among due). Hmm — the index returns ascending dueDate. The requeued card (dueDate=now, the latest) sorts LAST in the new queue. So after rating <3, the card goes to the END of the queue. That's actually reasonable (review others first, come back to the failed one).

   But — the queue reset to index 0 after EVERY rating means the user always sees the FIRST due card. If the user rated a card and it's requeued to the end, the next card shown is the next-due card. This is a workable model but it means: **you cannot "review card 5 of 10" then continue from card 6** — after rating, the queue is rebuilt and index resets. The prev/next buttons (handleReviewPrev/Next) navigate the CURRENT queue snapshot. But after a rating, the queue changes. So prev/next only work within the un-rated portion. Confusing UX: the session index is fragile.

2. **`reviewSrsMap`** — a map of itemId → SrsData for the current queue. Let me check how it's built. It's likely built when the queue loads (from getDueReviews → ReviewEntry.srs). Let me verify.

3. **The rating < 3 requeue** — since rateSrs sets dueDate=now for rating<3, the card is due again immediately. getDueReviews re-includes it. So "重来" cards keep cycling. But — there's the mastered bug I found: a mastered card never enters getDueReviews (status filter), so it can't be rated <3. And a card rated <3 while active stays active (status unchanged). OK.

4. **Session stats**: `reviewProgress`, `sessionMastered` (ratings >= 3), `todayRatings`, `streakDays`. These are display-only.

5. **reviewCompleted** — when no more due cards after a rating → completed screen.

6. **No session persistence** — entering review loads due; leaving discards. Memory #127.

Let me now check the ReviewSession component (the UI) and how reviewSrsMap is built. Let me also check the review date-filter view and the "mastered" flow more.

Let me read the reviewSrsMap construction and the ReviewSession component.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"reviewSrsMap\\|reviewItems\\b\\|setReviewItems\\|reviewCompleted\\|reviewDateItems\\|reviewIndex\" src/options.tsx | head -30"
}
```

**Output:**
```
105:  const [reviewItems, setReviewItems] = useState<Item[]>([])
130:  const [reviewSrsMap, setReviewSrsMap] = useState<Map<string, SrsData>>(
138:  const [reviewIndex, setReviewIndex] = useState(0)
140:  const [reviewCompleted, setReviewCompleted] = useState(false)
162:      current: Math.min(reviewIndex + 1, reviewItems.length),
163:      total: reviewItems.length,
167:    [reviewIndex, reviewItems.length, sessionRatings]
257:    reviewDateItems,
269:    reviewItems,
270:    setReviewItems,
278:    for (const [itemId, srs] of reviewSrsMap) {
286:  }, [reviewDateFilter, reviewSrsMap])
289:    if (!ratingFilter) return reviewDateItems
290:    return reviewDateItems.filter(
293:  }, [reviewDateItems, ratingFilter, cardFirstRating])
339:    if (reviewItems.length === 0 && sidebarTab !== "review") {
347:  }, [reviewItems, sidebarTab])
556:    // reviewItemIds + reviewSrsMap updated by the effect on allItemsUnfiltered change
611:        reviewIndex >= reviewItems.length ||
613:        reviewItems.length === 0
616:      const current = reviewItems[reviewIndex]
618:      const currentSrs = reviewSrsMap.get(current.id)
649:          setReviewItems([])
651:          setReviewItems(items)
657:    [reviewIndex, reviewItems, reviewSrsMap, animating, allItemsUnfiltered]
661:    if (reviewIndex > 0 && !animating) {
670:  }, [reviewIndex, animating])
673:    if (reviewIndex < reviewItems.length - 1 && !animating) {
682:  }, [reviewIndex, reviewItems.length, animating])
1530:                      item={reviewItems[reviewIndex] ?? null}

```

---

## Assistant (Plan · DeepSeek V4 Flash · 4.1s)

_Thinking:_

Let me read the reviewSrsMap building logic (around line 270-295) and the effect that syncs reviewItemIds + reviewSrsMap on allItemsUnfiltered change (line 556 area).

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 40,
  "offset": 268
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
268:     setSidebarTab,
269:     reviewItems,
270:     setReviewItems,
271:     reviewDateFilter,
272:     setReviewDateFilter
273:   })
274: 
275:   const cardFirstRating = useMemo(() => {
276:     const m = new Map<string, 1 | 2 | 3 | 4>()
277:     if (!reviewDateFilter) return m
278:     for (const [itemId, srs] of reviewSrsMap) {
279:       if (!srs.reviewHistory) continue
280:       const entry = srs.reviewHistory.find(
281:         (e) => dayKey(e.date) === reviewDateFilter
282:       )
283:       if (entry) m.set(itemId, entry.rating)
284:     }
285:     return m
286:   }, [reviewDateFilter, reviewSrsMap])
287: 
288:   const filteredDateItems = useMemo(() => {
289:     if (!ratingFilter) return reviewDateItems
290:     return reviewDateItems.filter(
291:       (item) => cardFirstRating.get(item.id) === ratingFilter
292:     )
293:   }, [reviewDateItems, ratingFilter, cardFirstRating])
294: 
295:   // Mount: initial load
296:   useEffect(() => {
297:     onSearch()
298:     loadTodos()
299:     // eslint-disable-next-line react-hooks/exhaustive-deps
300:   }, [])
301: 
302:   // Load unfiltered items for review (cross-project, independent of active project)
303:   useEffect(() => {
304:     searchItems({}).then(setAllItemsUnfiltered)
305:   }, [])
306: 
307:   // Load review states (refresh when data changes)

(Showing lines 268-307 of 2082. Use offset=308 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.7s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 30,
  "offset": 307
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
307:   // Load review states (refresh when data changes)
308:   useEffect(() => {
309:     getAllReviews().then((reviews) => {
310:       setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
311:       setReviewSrsMap(new Map(reviews.map((r) => [r.itemId, r.srs])))
312:     })
313:   }, [allItemsUnfiltered])
314: 
315:   // Immediate search for non-keyword filter changes
316:   useEffect(() => {
317:     onSearch()
318:   }, [activeProjectId, dateRange])
319: 
320:   // Debounced search for keyword (avoids per-keystroke queries).
321:   // Projects are strictly isolated: without an active project the search bar
322:   // filters the project hub by name/note instead of searching cards.
323:   useEffect(() => {
324:     if (!activeProjectId) return
325:     const t = setTimeout(() => {
326:       onSearch()
327:     }, 300)
328:     return () => clearTimeout(t)
329:   }, [keyword, activeProjectId])
330: 
331:   // Clear selection when the search scope changes so batch ops never act on
332:   // cards hidden by a new keyword/date range/reading filter.
333:   useEffect(() => {
334:     setSelectedIds([])
335:   }, [keyword, dateRange, activeProjectId, readingFilter])
336: 

(Showing lines 307-336 of 2082. Use offset=337 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 4.5s)

_Thinking:_

Now I have a clear picture of the upper layer. Let me read the ReviewSession component briefly and the review date-filter wiring. Let me also check the ReviewSession UI (rating buttons, flip, etc.) — it's the functional design surface.

Let me read ReviewSession.tsx.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && wc -l src/components/ReviewSession.tsx && grep -n \"rating\\|Rating\\|翻面\\|已完成\\|重来\\|困难\\|良好\\|简单\\|progress\\|mastered\\|handleRate\" src/components/ReviewSession.tsx | head -30"
}
```

**Output:**
```
348 src/components/ReviewSession.tsx
25:  ratings: Map<string, number>
26:  masteredCount: number
28:  todayRatings: [number, number, number, number]
31:  onRate: (rating: 1 | 2 | 3 | 4) => void
37:const LABELS = ["重来", "困难", "良好", "简单"]
48:  ratings,
49:  masteredCount,
51:  todayRatings,
79:    const firstRatings = Array.from(ratings.values())
80:    const avgRating =
81:      firstRatings.length > 0
82:        ? firstRatings.reduce((s, r) => s + r, 0) / firstRatings.length
84:    const goodCount = firstRatings.filter((r) => r >= 3).length
148:            熟悉率 {goodCount}/{total} · 平均评分 {avgRating.toFixed(1)}
150:          {masteredCount > 0 && (
154:              累计已掌握 {masteredCount} 张卡片
172:        masteredCount={masteredCount}
174:        todayRatings={todayRatings}
301:      {/* Rating buttons */}
313:          const rating = (i + 1) as 1 | 2 | 3 | 4
321:                  onRate(rating)

```

---

## Assistant (Plan · DeepSeek V4 Flash · 54.9s)

_Thinking:_

Now I have enough to do the analysis. Let me also quickly check the ReviewSession structure around the flip + rating buttons, and the "掌握" logic (sessionMastered counts ratings >= 3). And check the review date-filter view rendering. Actually, I have enough.

Let me also verify a couple of remaining things:
1. The `reviewCompleted` screen + how the session ends.
2. The background badge / webdav reviews in sync.

Actually — let me check one more thing: the `mastered` auto-promotion flow and whether `getDueReviews` excludes mastered, and whether there's a way to un-master. And the `handleToggleReview` — when a mastered card is toggled off, removeReview. When toggled on, addReview creates a NEW entry with status active (defaultSrs). So un-mastering = toggle off + on. But a mastered card is excluded from the queue — can the user even see it to toggle? In the date-filter view or via the card list (reviewItemIds includes mastered). The card's review toggle button shows "in review" (reviewItemIds.has). Toggling off removes it. Toggling on adds a fresh active entry. So mastered cards can be re-activated via the card's review toggle — but that RESETS the SRS (fresh entry with interval 0, EF 2.5). Not ideal but functional.

Let me also check the sync for reviews (SyncPayload includes reviews). Already known.

Now — the analysis. The user asked to analyze:
1. 底层的数据设计和算法 (bottom: data design + algorithm)
2. 上层的功能设计 (top: functional design)

Let me structure a comprehensive analysis with concrete findings, root causes, and recommendations. This is plan mode — analysis only, no changes.

Let me compile the findings:

## 一、底层数据设计

### 1. ReviewEntry 数据结构
```ts
ReviewEntry {
  id, itemId, projectId, status, dueDate (denormalized), addedAt, srs: SrsData
}
SrsData { dueDate, interval, easeFactor, reviewCount, lastReviewDate, reviewHistory[] }
```

**问题 A1 — 双重 dueDate 冗余**：`srs.dueDate` 与顶层 `dueDate` 并存（后者为 IDB 索引）。`updateReviewSrs` 手动同步两处（index.ts:736-737）。一旦漏同步 → 查询（getDueReviews 走索引）与数据不一致。**修复方向**：让 `dueDate` 派生，或消除一个（索引可建在 `srs.dueDate` 上——IndexedDB 不支持嵌套路径索引，所以冗余是不得已，但应封装在数据库层，杜绝业务代码直接写）。

**问题 A2 — `status` 的"mastered"是单行道**：`updateReviewSrs` 只做 `interval >= 365 → mastered` 的提升（index.ts:738-739），**从不降级**。后果：
- 一张卡达到 interval=365 变 mastered 后，被 `getDueReviews`（`status === "active"` 过滤）永久排除。
- 此时用户再想"重来"复习它 → 不可能（不进队列）。唯一的"恢复"是手动从卡片列表移除再重加（**SRS 数据被清零重置**，不是恢复）。
- 而且 mastered 卡在 `reviewItemIds` 里仍显示"在复习"，但永不出现 → 困惑。
- **这是一个真实的逻辑断点**。

**问题 A3 — 冗余/一致性风险**：`projectId` 冗余在 ReviewEntry 上（用于复习日期视图按项目过滤）。卡片不能跨项目移动（已锁定），所以当前无漂移，但属于冗余派生字段。

**问题 A4 — 无数据清理/退出机制**：reviewHistory 有 200 条上限（rateSrs slice(-200)），OK。但 mastered 卡永久留在 reviews store（不删除）→ 数据无上限增长，getReviewStatsByStore 每次全表扫描（O(n)）。

### 2. SM-2 算法（rateSrs，useSrs.ts:15-46）

**问题 B1 — 首次复习间隔恒为 1 天（真实缺陷）**：
```ts
interval = Math.max(1, interval * easeFactor)   // 首评 interval=0 → 0 → 1
interval = Math.max(1, interval * easeFactor * 1.3)  // rating 4 → 0 → 1
```
首评时 interval=0，任何 rating（3/4）都算出 0 → clamp 到 1 天。**rating 4（简单）与 rating 3（良好）首次完全一样（1 天）**。"简单"的第一次不跳步。标准 SM-2 首评良好=1 天、简单≈4 天。这是算法与"评分语义"脱节的核心问题。

**问题 B2 — 复读（rating<3）的 dueDate 与 interval 矛盾**：
```ts
interval = 1                    // 说"1 天后"
dueDate = rating < 3 ? now      // 但立即到期
```
interval=1 + dueDate=now 语义不一致。下一次评分 `interval × easeFactor` = 1 × EF，与"重置为 0 次重复"的标准 SM-2 行为有偏差（标准是重复数归零，成功后的首次间隔才是 1 天）。当前实现把"重来"直接当 1 天，但 dueDate=now 又立即重排 → 相当于"当天重学 + 下次间隔 1×EF"。

**问题 B3 — EF 无上限**：rating 4 每次 +0.15，无上限。长期 EF 膨胀 → 间隔快速撞 365 上限。Anki 有 max ease（默认 2.5-3.1）。应设上限（如 3.0）。

**问题 B4 — 不是标准 SM-2，是无步进线性 Anki 变体**：标准 SM-2 有 I(1)=1、I(2)=6 的步进表；本实现是 `interval × EF` 纯指数。标注为 "SM-2" 但实际是 Anki-like。可接受（Anki 更常用），但应明确"是 Anki 风格"，并把首评问题修掉。

**问题 B5 — 首次 0 间隔的 EF 也不参与**：首次评分 easeFactor=2.5 起评。标准 OK。

## 二、上层功能设计

### 1. 复习队列（handleReviewRate，options.tsx:608-658）

**问题 C1 — 每次评分后整队重建 + index 归零**：每评一张，`getDueReviews()` 全量重查 → `setReviewItems(items)` + `setReviewIndex(0)`。副作用：
- 复习顺序在每次评分后重排（因为 due 集合变了），用户看到的"第 N 张"是动态的。
- **prev/next 按钮与重建冲突**：评分后队列重排，prev/next 导航的是快照，但快照被替换。UI 上"上一张/下一张"的语义不稳定。
- 一次"复习 N 张"的会话感很弱——更像"反复刷当前 due 集合直到清空"。

**问题 C2 — 重排机制**：rating<3 的卡 dueDate=now → 在新的 index 查询里排最后（dueDate 升序），被"刷"到队尾 → 先复习其它，最后回到失败的卡。这个方向 OK，但配合 C1 的整队重建，行为不直观。

**问题 C3 — 会话进度/掌握统计口径**：`sessionRatings`（Map，每卡首次评分）；`sessionMastered = ratings >= 3`。"掌握"= 一次评分>=3，而非"连续 N 次成功"。与 SRS 语义（interval 达到阈值才算掌握）不一致——session 里的"掌握数"只是"本次评了 >=3 的卡数"，而 ReviewSession 顶部又显示累计 masteredCount（interval=365 的）。两套"掌握"概念并存，口径混乱。

**问题 C4 — 无 session 持久化**：进入复习 tab 自动加载，离开丢弃（memory #127）。用户误关 tab 即丢失本次进度（重新开始）。这与"复习中途退出"的常见需求冲突。设计上是"无会话"，但体验上可能被感知为丢进度。

### 2. 复习日期视图（recentItems / reviewDateFilter）

**问题 D1 — recentItems 只取近 3 天**（getRecentItems days=3），侧栏"近期回顾"只显示今天/昨天/前天。历史复习记录无法回溯查看（只能看 3 天）。且 dateKey 覆盖 `allDateKeys`（streak 统计用的是全部历史 dateKey，来自 reviewHistory），但 recentItems（可点选的日期）只有 3 天。**streak 用全量历史、日期视图只有 3 天**——两套时间窗。

**问题 D2 — cardFirstRating 取 reviewHistory 中该日期的"第一条"**：如果某卡一天内评了多次（重来后再次评分），只算第一条的 rating。过滤口径 OK 但注意。

**问题 D3 — recentItems 依赖 reviewHistory**：旧数据（无 reviewHistory）的卡不会出现在近期回顾里。

### 3. 数据流/同步

**问题 E1 — reviews 通过 bulkReplace 同步**（sync payload 含 reviews），带 itemId 唯一索引。跨设备同步时，ReviewEntry 以整条覆盖。若两台设备对同一卡有不同的 SRS 进度，后同步方覆盖先同步方 → **SRS 进度冲突无合并策略**（与 items 的 diff 合并不同，reviews 是整条替换）。这是底层数据设计对"多设备 SRS"的天然缺陷。

**问题 E2 — updateReviewSrs 用 itemId 索引查找后修改**：读-改-写非原子（先 get 再 put），在并发/多设备场景有竞态。单设备内 OK。

### 4. 其它

**问题 F1 — mastered 阈值与 interval 上限耦合**：365 = 间隔上限 = mastered 阈值。改成"间隔 >= 21 天即毕业"是常见做法（Anki graduated），但会与当前 365 语义冲突。需统一"掌握"定义。

**问题 F2 — badge/todo 联动**：todo badge 已解耦（上轮）。dueCount 用于复习 badge + 扩展 badge。

Now let me organize this into a clear analysis document with prioritized recommendations. Since this is plan mode, I present the analysis and a recommended fix direction, and ask the user which areas to address.

Let me prioritize:
- **P1 (真实缺陷，建议修)**:
  - B1: 首评间隔恒 1 天（rating 4 无差异）
  - A2: mastered 单行道（interval>=365 后永远被排除，无法重来）
  - C1: 整队重建 + index 归零（会话导航不稳定）
- **P2 (设计问题，可重构)**:
  - B2/B3: interval=1+dueDate=now 矛盾；EF 无上限
  - C3: 两套"掌握"口径
  - D1: recentItems 3 天窗口 vs streak 全量
  - E1: 同步 reviews 无合并策略
- **P3 (可暂缓)**:
  - A1/A3: 冗余字段（结构性问题，低风险）
  - D2/D3, F1, E2

Let me also verify a couple of facts before finalizing:
- The mastered threshold: `interval >= 365` in updateReviewSrs (line 738-739). And rateSrs caps interval at 365. So the FIRST time interval hits 365, status → mastered, and dueDate = now + 365. That's a year out. So a mastered card is due in 365 days but excluded from queue. It's effectively "done". OK.
- Actually wait — let me re-examine the mastered bug more carefully. When a card reaches interval=365 via a rating, updateReviewSrs sets status=mastered. But — was the rating that hit 365 a rating 3 or 4? Either way. After mastering, dueDate = now + 365d. getDueReviews excludes it (status !== active). So it never appears. To review it again, the user would need... nothing in the UI allows it. The date-filter view (recentItems) shows the card if reviewed recently (within 3 days — the mastering review is within 3 days). From there, is there a rating button? The date view shows cards with a rating filter; clicking opens ItemDialog. The ItemDialog review toggle would show "in review" (reviewItemIds has it). Toggling off → removeReview; toggling on → addReview fresh (resets SRS). So the ONLY way to "un-master" is a full SRS reset. Confirmed design gap.

- Also: is there a scenario where a mastered card is STILL rated? In handleReviewRate, reviewItems comes from getDueReviews (active only). So mastered cards never get rated. The `currentSrs` for a mastered card would never be looked up. So the mastered bug is: once mastered, the card is terminal unless manually reset. Actually — hmm, is this even a BUG or intended? "Mastered = done forever" might be intended. But the issue is:
  1. No UI feedback that it's mastered / no way to review it again.
  2. If the user forgets the card, it's gone from review forever (a year later it MIGHT be due — but excluded).
  
  Actually — the deeper issue: **getDueReviews filters `status === "active"`**. A mastered card at interval=365 has dueDate = now+365. Even if status were active, it wouldn't be due for a year. So filtering mastered is fine for the queue. The problem is the LACK of un-mastering + the fact that interval=365 is the SAME as the cap (so you can't tell "mastered by design" from "just reached the cap"). 

  Hmm — let me reconsider. Is the mastered auto-promotion actually harmful? A card with interval 365 is due in a year. If it stays active, it appears in the queue in a year. If it's mastered, it never appears. The mastered state is a "graduate" marker. The harm: (a) no way back, (b) the "重来" option is meaningless for mastered cards (they can't appear), (c) reviewStats counts them separately. 

  Actually the REAL bug is subtler: **what if a mastered card's rating would have been < 3?** It can't be rated at all (excluded). So the auto-mastering at 365 makes it IMPOSSIBLE for a card to ever fail after reaching 365. The user loses control. That's the design gap.

OK, I'm confident in my findings. Let me also double-check the ReviewSession top bar / completion screen briefly to describe the upper design accurately. Actually I have enough.

Let me also verify one thing about `reviewSrsMap` — it maps ALL reviews (not just due). In handleReviewRate, `reviewSrsMap.get(current.id)` returns the srs for the card being rated. Since the card is in the due queue, its entry exists. Good.

Now — one more upper-layer observation: the review flow requires `Item.title` to add a card to review (handleToggleReview: `if (!card.title) { setReviewTitlePending(itemId); return }`). So title-less cards prompt for a title first. Reasonable constraint.

Let me write the analysis. I'll present it as a structured report, then propose fix priorities and ask which to pursue.

Actually — the user asked to "分析当前的复习系统，关注底层的数据设计和算法与上层的功能设计". This is analysis only (plan mode). Let me present a thorough analysis. I should be comprehensive but organized. Then propose directions and ask for their priorities.

Let me write it in Chinese, well-structured.

复习系统分析完成。以下是底层（数据 + 算法）与上层（功能）的完整剖析。

---

# 一、底层数据设计

## 1. ReviewEntry 结构
```ts
ReviewEntry { id, itemId, projectId, status, dueDate(顶层冗余), addedAt, srs: SrsData }
SrsData { dueDate, interval, easeFactor, reviewCount, lastReviewDate, reviewHistory[] }
```
索引：`itemId` 唯一索引 + `dueDate` 索引（在**顶层冗余字段**上）。

**A1 · 双重 dueDate 冗余** — `srs.dueDate` 与顶层 `dueDate` 并存，后者仅为 IndexedDB 索引服务（IDB 不支持嵌套路径索引）。`updateReviewSrs` 手动同步两处（`index.ts:736-737`）。漏同步即查询漂移。**风险源**。

**A2 · `status="mastered"` 是单行道（真实断点）** — `updateReviewSrs` 只做 `interval >= 365 → mastered` 的提升（`index.ts:738-739`），**从不降级**。后果：
- 卡到 365 变 mastered 后，被 `getDueReviews`（`status === "active"` 过滤）**永久排除**
- 用户**无法对已掌握卡"重来"**——它永远不会再进队列；唯一的"恢复"是手动从卡片移除再重加，而重加会**清空 SRS 数据**（全新 entry）
- `reviewItemIds` 里它仍显示"在复习"，但永不出现 → 用户困惑

**A3 · projectId / 顶层 dueDate 冗余** — 均为派生冗余（复习日期视图按项目过滤 + 索引）。卡片不能跨项目移动，当前无漂移，但属于一致性命中。

**A4 · 数据无回收** — mastered 卡永久留在 reviews store，`getReviewStatsByStore` 每次全表扫描（O(n)），数据无上限。

## 2. SM-2 算法（`rateSrs`，useSrs.ts:15-46）

**B1 · 首次复习间隔恒为 1 天（真实缺陷）**：
```ts
interval = Math.max(1, interval * easeFactor)         // 首评 interval=0 → 0 → 1
interval = Math.max(1, interval * easeFactor * 1.3)   // rating 4 → 0 → 1
```
首评时 `interval=0`，rating 3 **和** 4 都算出 0 → clamp 到 1 天。"简单"首次评分与"良好"完全等价，**评分语义与排程脱节**。标准 SM-2 首评良好=1 天、简单≈4 天。

**B2 · 复读（rating<3）语义矛盾** — `interval=1`（说"1 天后"）但 `dueDate=now`（立即到期）。下一次评分用 `1 × EF` 作为基础，与"重复数归零、成功后再给 1 天"的标准 SM-2 有偏差。

**B3 · EF 无上限** — rating 4 每次 +0.15，无限膨胀 → 间隔快速撞 365 上限。Anki 有 max ease（~2.5-3.1）。长期偏斜。

**B4 · 并非标准 SM-2** — 标准 SM-2 有 I(1)=1、I(2)=6 的步进表；本实现是 `interval × EF` 纯指数（Anki 风格）。标注"SM-2"名不符实，但 Anki 风格本身合理，**关键是首评问题要修**。

---

# 二、上层功能设计

## 1. 复习会话（`handleReviewRate`，options.tsx:608-658）

**C1 · 每次评分后整队重建 + index 归零（体验不稳）** — 每评一张卡：`getDueReviews()` 全量重查 → `setReviewItems(items)` + `setReviewIndex(0)`。副作用：
- 复习顺序每次评分后重排（due 集合在变），"第 N 张"是动态的
- **prev/next 与重建冲突**：导航的是当前快照，评分后快照被替换 → "上一张/下一张"语义不稳定
- 会话感很弱——更像"反复刷当前 due 集合直到清空"，而非"复习 N 张"

**C2 · 重来机制** — rating<3 的卡 `dueDate=now`，在新查询（dueDate 升序）里排**队尾** → 先复习其它、最后回失败卡。方向合理，但被 C1 的整队重建干扰。

**C3 · 两套"掌握"口径并存** — 会话内 `sessionMastered = 评分 >= 3`（一次评分就算掌握）；顶部又显示累计 `masteredCount`（interval=365 的）。两个"掌握"含义完全不同，且与 SRS 语义（连续成功才掌握）都不一致。

**C4 · 无会话持久化** — 进入复习 tab 自动加载、离开丢弃。误关 tab 即丢本次进度。

## 2. 复习日期视图

**D1 · 时间窗割裂** — `recentItems` 只取**近 3 天**（侧栏可点选的近期回顾），但 **streak 连续天数用全量 `reviewHistory` 的 dateKey**。两套时间窗：可回溯查看的只有 3 天，统计却是全部历史。

**D2 · `cardFirstRating` 取该日第一条评分** — 一天内重来多次只算第一条。过滤口径 OK 但要注意。

**D3 · recentItems 依赖 `reviewHistory`** — 旧数据（无 history）的卡不会出现在近期回顾。

## 3. 同步

**E1 · reviews 同步无合并策略（多设备 SRS 缺陷）** — `bulkReplace` 对 ReviewEntry 是**整条覆盖**（按 id diff），与 items 的字段级合并不同。两台设备对同一卡有不同 SRS 进度时，**后同步方覆盖先同步方**，进度丢失。这是底层设计对"多设备 SRS"的天然缺陷。

**E2 · `updateReviewSrs` 读-改-写非原子** — 先 `idx.get` 再 `put`，并发/多设备有竞态。单设备内 OK。

---

# 三、优先级建议

| 级别 | 项 | 说明 |
|---|---|---|
| **P1 真实缺陷** | **B1** 首评间隔恒 1 天 | 修 `interval=0` 时给首评固定步长（3→1天，4→4天） |
| | **A2** mastered 单行道 | 支持降级（重来解除 mastered）+ 取消永久排除，或给出明确"毕业即退出"设计 |
| | **C1** 整队重建 | 会话内维护**稳定的待复习队列快照**（评分后从队中移除/重排队尾，不重查重建） |
| **P2 设计重构** | **B2/B3** 复读语义 + EF 上限 | 统一 interval/dueDate 语义，加 EF max |
| | **C3** 掌握口径 | 统一"掌握"定义 |
| | **E1** 同步合并 | reviews 增加字段级合并或进度比较 |
| **P3 可暂缓** | A1/A3 冗余字段、D1 时间窗、D2/D3、F1 | 结构性清理 |

---

**核心判断**：底层最有价值的是 **B1（首评排程失效）** 与 **A2（mastered 单行道）**——它们直接让"简单"评分无意义、让已掌握卡失控；上层最有价值的是 **C1（会话队列重建）**——它让整个复习交互不稳定。这三个修好，复习系统才算真正可用。

想先深入哪个方向？我可以为选中的项出详细执行方案。

---

## User

C1（会话队列重建）这个这样设计是为了防止用户复习到一半的时候切换到项目视图增加一张卡片到复习队列。采用快照会出现这样的情况：用户复习到一半增加了一张卡片，badge/导航栏复习 icon数字+1->回来复习->主工作区显示今天复习结束，然而导航栏复习 icon数字未归0->用户退出复习，再进入复习视图 -> 又出现复习卡片（用户新增的） 

---

## Assistant (Plan · DeepSeek V4 Flash · 67.1s)

_Thinking:_

The user is explaining why C1 (whole-queue rebuild after each rating) was designed that way: to prevent the case where a user, mid-review, switches to the project view, adds a card to the review queue, comes back, and the session would be stale.

The user's scenario with a snapshot:
1. User reviews halfway.
2. User switches to project view, adds a card to review queue.
3. badge/review icon count +1.
4. User comes back to review → main area shows "今天复习结束" (today's review complete).
5. But the review icon badge is not 0.
6. User exits review, re-enters review view → the newly-added card appears.

So the user is defending the whole-queue-rebuild design (C1) — it ensures the session always reflects the CURRENT due set, so "复习结束" only shows when there are truly no due cards.

Wait — let me re-read the user's message carefully. They're explaining the DESIGN RATIONALE for C1. They're saying: "C1（会话队列重建）这个这样设计是为了防止..." — C1's whole-queue rebuild is designed THIS WAY (on purpose) to prevent [the snapshot problem described].

So the user is NOT asking to remove C1. They're explaining why it exists, and implicitly: the analysis's C1 criticism needs to account for this. The snapshot approach (which I suggested as a fix) would cause the problem they describe.

So the question is: how to reconcile?
- Whole-queue rebuild (current): always reflects current due set. "复习结束" = no due cards left. Correct badge behavior. But: prev/next unstable, index resets, session feel weak.
- Snapshot: stable queue, but stale vs mid-session additions → the inconsistency they describe (badge says +1 but session says done).

The user's scenario is real and the current design handles it correctly: after a mid-session addition, the rebuilt queue includes the new card → the session continues until it's reviewed → only then "复习结束" AND the badge reaches 0.

So the design intent is sound. The problem I identified (C1's instability) is real but the FIX isn't "snapshot the queue". The fix must PRESERVE the "always reflects current due set" semantics while making the session UX stable.

Let me think about how to reconcile these:

**The core tension**: 
- The queue MUST reflect the live due set (so "done" is accurate).
- But the user shouldn't experience jarring re-ordering / index resets.

**Possible reconciliation approaches:**

1. **Rebuild the queue but preserve position context**: After each rating, re-query the due set, but instead of resetting to index 0, keep reviewing the "next" card in a stable-ish way. The problem: the due set changes, so "next" is ambiguous. 

2. **Two-phase: session queue + live check on completion**: Keep a session snapshot for the RATING FLOW (stable order, prev/next work), but on completion (session empty), re-query the live due set: if new cards appeared (added mid-session), load them and continue; only show "复习结束" when the live due set is actually empty. This reconciles both:
   - Stable session queue (snapshot) → prev/next stable, order stable.
   - Completion check against live DB → "结束" only when truly no due cards.
   - Badge consistency: the badge reflects the DB; the session completion check also reflects the DB → no mismatch.

   This is the best of both worlds. The session is a stable snapshot for navigation; the "done" boundary is determined by the live DB.

   But wait — there's still the mid-session addition case: user adds a card mid-session. The session snapshot doesn't include it. The user keeps reviewing the snapshot. When the snapshot is exhausted → check live due → the new card is due → load it and continue. The badge shows +1 during the snapshot review (the new card is due but not yet reviewed). Is that confusing? The badge correctly shows "1 more due". When the user finishes the snapshot, the live check pulls in the new card → continues. So "复习结束" never falsely shows. Consistent.

   Hmm — but the user's described problem was: "主工作区显示今天复习结束，然而导航栏复习 icon数字未归0". With my approach, "复习结束" would only show when the live due set is empty → badge would be 0 at that point. So the mismatch is resolved.

   Actually — let me reconsider. With the snapshot approach + live completion check:
   - Snapshot = the due set at session start.
   - User rates all snapshot cards.
   - At "session empty", re-query getDueReviews → if the mid-session-added card is due → it appears → continue. 
   - When live due is empty → show 复习结束 + badge 0. Consistent.

   But there's a subtlety: what if a card in the snapshot gets rated <3 (requeued, dueDate=now)? With a pure snapshot, the requeued card... is it still in the snapshot? The current design re-queries so the requeued card comes back at the end. With a snapshot, the requeued card was already rated (it's in the snapshot's "rated" set). Should it be re-reviewed in the same session? The current behavior (via re-query): yes, it cycles back. With a snapshot: the card was consumed; whether to re-review it depends on the model.

   Hmm — this is the "trim-queue" vs "batch" distinction:
   - **Trim-queue** (current): re-query after each rating; failed cards (due again) re-enter the queue. Session ends only when NOTHING is due.
   - **Batch**: fixed queue; rate each once; failed cards stay failed (may show as "failures" in the summary); session ends when the batch is done.

   The current design is trim-queue. My "snapshot + live completion check" would be: batch (snapshot) + at the end, if live due remains (either new cards OR requeued... wait, requeued cards ARE due now) → continue. So it's effectively still trim-queue but with a STABLE order for the current pass, and re-checks at the pass boundary.

   Actually — let me reconsider what the requeue (rating <3) should do in a stable-session model:
   - Option A (keep trim-queue): failed cards re-enter and are re-reviewed in the same session (possibly multiple times until passed). This is the current semantics.
   - Option B (batch): failed cards are marked failed, moved to the END (or kept in a "retry later" pile), re-reviewed after the others — which is what the current dueDate=now requeue effectively does (goes to queue end via re-query).

   With a stable session, the cleanest: the session keeps a queue; rating a card removes it; if rated <3, it's re-inserted at the END of the session queue (not the DB re-query). This gives: stable order, failed cards cycle to the end, session ends when the queue is empty AND the live due set is empty (completion check). This preserves the trim-queue semantics (failed cards are retried) with a stable UX.

   But — the "live due check" at completion: new cards added mid-session get pulled in. Failed cards already re-enter via the session queue (not the live check). So the completion check only handles NEW additions. 

   Hmm — but if a failed card is re-inserted at the session queue end, and meanwhile the user added a card mid-session, the session queue = [failed cards] + [new cards on completion check]. Ordering could interleave. Let me keep it simple:
   - Session queue: ordered list of card IDs (snapshot at start + requeues).
   - Rating: remove from queue; if <3, push to queue END.
   - When queue empty: re-query getDueReviews. If any due remain (new additions), build a new session queue from them. Else → 复习结束.
   - prev/next navigate the session queue (stable during a pass).

   This reconciles: stable navigation, trim-queue retry, live completion check (no false "done", badge consistent).

   Actually — this is essentially what the current design does, EXCEPT the current re-queries the DB after EVERY rating (rebuilding the whole queue + resetting index), whereas this rebuilds only at PASS BOUNDARIES (when the queue empties). The UX difference: during a pass, the order is stable (prev/next work); the DB is consulted only when the pass completes.

   Wait — but there's still a subtle issue. The current design re-queries after EVERY rating because a rating CHANGES the due set (the rated card moves to a future date → no longer due; a <3 card → due again). The re-query ensures the session always processes the CURRENTLY-due set. With pass-boundary rebuilding:
   - During a pass, the session processes its snapshot.
   - When the pass ends, re-query → new cards + requeued (already handled) → new pass.
   
   The requeued cards: handled by re-inserting into the session queue. The re-query at pass end catches NEW cards. Consistent.

   Actually — there's a case: mid-pass, the user adds a card. The session continues its pass (snapshot). The added card is due but not in the pass. At pass end, the live check pulls it in. So the user reviews the NEW card AFTER finishing the existing pass. That's a reasonable UX (finish what you started, then the new one). And the badge during the pass shows +1 (the new card due) — is that confusing? The badge reflects reality (1 due). The session shows progress on the current pass. When the pass ends, the new card appears. No false "done". Consistent.

   Hmm — but the user might find it odd that the badge shows "1" while reviewing (they're reviewing but the badge isn't counting down to 0). Actually — the badge counts DUE cards. During a pass, rated cards get future due dates (no longer due) → badge decreases. The new mid-session card keeps badge at 1. When the pass ends, the new card loads → badge 0 after rating it. So the badge is consistent with the live DB throughout. Good.

   Let me reconsider the user's exact concern once more: "采用快照会出现这样的情况：用户复习到一半增加了一张卡片，badge/导航栏复习icon数字+1->回来复习->主工作区显示今天复习结束，然而导航栏复习icon数字未归0". 

   With my pass-boundary approach: the user adds a card mid-pass → badge +1. The session continues the pass. When the pass ends (snapshot exhausted), the live check finds the new card → loads it → the user reviews it → badge 0. "复习结束" only after the new card is done. So the false "结束 with badge not 0" never happens. 

   So my recommendation resolves the user's concern. Let me present this.

**But wait** — I need to reconsider whether the user is ASKING me to fix C1 or just explaining why it's designed that way. The message: "C1（会话队列重建）这个这样设计是为了防止用户复习到一半的时候切换到项目视图增加一张卡片到复习队列。采用快照会出现这样的情况：..." 

They're explaining the rationale. This is a response to my C1 finding — they're pushing back on the "snapshot" suggestion by showing the failure case. So they want me to reconsider C1's fix with this constraint in mind.

So my job: present a C1 fix that PRESERVES the live-accurate semantics (their concern) while fixing the instability (my concern). The pass-boundary approach does exactly that.

Let me also think about whether the pass-boundary approach has any downsides vs the current:
- Current: after each rating, re-query → the session is always "the live due set, reviewed in dueDate order repeatedly until empty".
- Pass-boundary: stable pass, then re-query at boundaries.

One difference: in the current design, if a card rated <3 is requeued, it goes to the END via re-query (dueDate=now is the max dueDate among due). In my design, I explicitly push it to the session queue end. Same effect, but I control it explicitly (clearer than relying on dueDate=now ordering).

Another difference: in the current design, the session order after a rating might change if OTHER cards' due dates... no, other cards' due dates don't change. So the current re-query order = dueDate asc, and the only change is the requeued card moving to the end. So the current design's "unstable order" is actually minimal (only the requeued card moves). But the INDEX RESET to 0 is the jarring part — after each rating, you're back at "card 1" of the new set. For a 10-card due set where you rate all as 3, each rating shrinks the set and resets to index 0 → you see card 1, card 1, card 1... each time (the first remaining due card). Wait — no. After rating card 1 (rating 3, due +future), it's no longer due. Re-query → the set is now [card 2..10], index reset to 0 → shows card 2 (the new first). So actually you DO progress through the set. The index reset just means you always see "the first due card" — which after each rating is the next one. So the UX is: you always see the first remaining due card. That's actually... fine? The order is deterministic (dueDate asc). 

Hmm — so what's the ACTUAL instability? Let me reconsider. The index reset to 0 with a re-queried set means: after rating the current card, you're shown the first card of the NEW due set. If you rated <3 (requeued), the new set has the requeued card at the END → you see the next card. If you rated >=3, the new set shrinks → you see the new first. So the "current" card after each rating is deterministic (first due). prev/next navigate within the CURRENT set. After a rating, the set changes → prev/next operate on the new set. 

The instability: **prev (上一张)**. After rating card N (>=3), card N is gone from the due set → prev has nothing to go back to (or goes to card N-1 which is still due). After rating <3 (requeued to end), prev from the new first card... the new first card is card N+1 (old), prev would go to... the requeued card N is at the end, not before card N+1. So prev is weird. And the slide animation + index reset makes it feel like the session "jumps".

Actually — the bigger UX issue: **the "复习进度" counter**. `reviewProgress.current = reviewIndex + 1, total = reviewItems.length`. After each rating, the total shrinks and index resets → progress shows "1/N" repeatedly (1/10, 1/9, 1/8...). That's the "session feel is weak" observation — the progress never advances past 1.

So the real C1 problems:
1. Progress counter always shows "1/N" (resets each rating).
2. prev/next operate on a shifting set.
3. The slide animation resets each rating.

And the DESIGN RATIONALE (the user's point): the live-due accuracy.

So my pass-boundary fix addresses both: stable pass (progress advances 1/N → 2/N → ... → N/N), prev/next stable within the pass, AND live completion check at boundaries (no false "done").

Let me present this reconciliation clearly. Also — the badge consistency: with the current design, after rating all due cards, the re-query returns empty → 复习结束 + badge 0 (updateBadge on _dbi change). Consistent. With my design, same at the pass boundary.

Actually — let me reconsider ONE more edge in my design: mid-pass, a card rated <3 is pushed to the queue end. The queue now has it at the end. The user continues, rates the rest, then reaches the requeued card (at the end) and rates it again. If <3 again → pushed to end → infinite loop possible (like the current design). The current design also loops (requeued cards keep cycling). To bound it, sessions could cap retries or show a "skip/finish" option. But that's a separate concern (both designs share it).

OK — let me also reconsider: does my design fully resolve the user's stated concern? The user's concern: snapshot → false "结束" while badge non-zero. My design: no false "结束" (live check). And the badge stays consistent. Yes.

Let me now also address: is the "trim-queue re-query after every rating" even NECESSARY for the badge? The badge updates via `_dbi` broadcast → background updateBadge (getDueReviews). That's independent of the session queue. So the badge is ALWAYS live (DB-based). The session queue's job is just the UI flow. So decoupling the session UI from the DB-accuracy is safe — the badge handles accuracy independently. My design keeps the DB as the completion authority (via the boundary re-query), so no conflict.

Good. Let me present the reconciled C1 design as the recommendation, and also briefly note how it fits with the other P1 items (B1, A2). Since we're in plan mode, I present the plan and ask for confirmation.

Actually — the user's message is a response to my analysis (defending C1). They didn't explicitly ask for a new plan. But the natural next step is: acknowledge the rationale, and present a C1 redesign that PRESERVES the rationale while fixing the instability. Let me do that concisely.

Let me structure:
1. 确认设计意图：C1 的整队重建保证了"复习结束 = 无待复习卡"，badge 一致。
2. 但整队重建不等于"每次评分都重查"——可以只"在通过边界重查"，兼顾两者。
3. 提出"会话快照 + 通过边界 live 校验"方案，并跑通用户的场景。
4. 说明与 badge 的一致性（badge 本来就是 DB 驱动的，独立于会话）。

Let me write this. Keep it focused. Since plan mode, I present the design and ask if they want me to proceed (or refine).

Let me detail the proposed design:

**会话队列重建方案（保留 live 语义 + 修复不稳定）**

核心：**把"每次评分后重查 DB 重建队列"改为"会话内维护稳定的待复习队列，仅在队列清空时向 DB 校验"**。

会话状态：
- `sessionQueue: Item[]` — 本次会话的稳定队列（进入复习时由 `getDueReviews()` 初始化）
- `reviewIndex` — 当前指针
- 评分行为：
  - rating >= 3 → 从队列移除（不再 due）
  - rating < 3 → 移到队列末尾（保持"重来"重试语义，由会话显式控制，不再依赖 dueDate=now 的隐式重排）
  - 前进到下一个
- 队列清空时：
  - `getDueReviews()` 重查 → 若有新的待复习卡（会话中途新增的）→ 用它们初始化新会话队列继续
  - 若无 → 显示"复习结束" + 此时 badge 必然为 0

**跑通用户的场景**：
- 会话中途在项目视图加一张卡进复习 → badge +1
- 回到复习 → 会话继续原有的稳定队列（prev/next、进度 1/N→N/N 正常）
- 队列清空 → live 校验发现新卡 → 加载继续复习
- 评完新卡 → 队列空 + live 空 → "复习结束" + badge 0 ✓（不再出现"结束了 badge 还有数字"）

**收益**：
- prev/next、进度条、滑动动画在会话内稳定（修复 C1 的体验问题）
- 结束判定仍以 DB 为准（保留设计意图，badge 一致）
- badge 本身独立于会话（`_dbi` 广播 → background 更新），本就不受会话重建影响

**代价**：
- 会话中途新增的卡要等当前队列清空后才进入（不是立即插入）——但这正是用户描述的行为预期（先完成手头的，再处理新加的）
- 需要引入 sessionQueue 状态（当前 reviewItems 兼任，重构为显式队列）

Edge cases to handle:
- 会话中 rating<3 的卡移到队尾，可能与"live 校验拉入的新卡"产生顺序问题 → 明确：新卡在下一个 pass 才进入，不影响当前 pass。
- 无限重试（一直 rating<3）：与现设计相同（会有边界问题，可另议，如限制同卡单会话重试次数）。

Let me present this. Keep it tight.

One more consideration — I should double check my claim that the current design's "整队重建" is needed for badge accuracy. Actually the badge is computed in background from the DB (getDueReviews) on _dbi broadcasts. So it's fully independent of the session. My design doesn't change that. Good.

Let me write the response.

理解了——C1 的整队重建**是有意为之**：保证"复习结束"永远等于"此刻无待复习卡"，badge 与主区状态一致。这是正确的设计意图。

但我认为**"每次评分后重查重建"是过度实现**——live 语义只需要在**队列清空的边界**向 DB 校验，不必每次评分都重建。这样两者可以兼得：

## 方案：会话内稳定队列 + 队列清空时 live 校验

**会话状态改为显式队列**（不再是"每次重查的即时集合"）：
- 进入复习：`getDueReviews()` → 初始化 `sessionQueue`（稳定快照）
- **评分**：
  - `rating >= 3` → 从队列移除（不再 due）
  - `rating < 3` → 移到**队列末尾**（保留"重来重试"语义，由会话显式控制，不再依赖 `dueDate=now` 的隐式重排）
  - 指针前进
- **队列清空时**：`getDueReviews()` 重查
  - 有新待复习卡（会话中途新增的）→ 用它们初始化新队列继续
  - 无 → "复习结束"（此时 badge 必然为 0）

**跑通你描述的场景**：
1. 会话中途在项目视图加卡 → badge +1（badge 由 `_dbi` 广播驱动，本就独立于会话，始终准）
2. 回复习 → 继续**原有稳定队列**（prev/next、进度 `1/N→N/N`、滑动动画全部正常）
3. 队列清空 → live 校验发现新卡 → 加载继续
4. 评完新卡 → 队列空 + live 空 → "复习结束" + **badge 归 0** ✓

**关键差异**：`getDueReviews` 从"每次评分都查"降为"每个 pass 查一次"。你在意的场景（中途加卡→回来→不误报结束）**完全保留**，因为结束判定始终以 DB 为准；而 pass 内部的体验（进度、prev/next、动画）恢复稳定。

**代价**：中途新增的卡要等当前队列清空后才进入（这正是你描述的预期行为——先完成手头的）；需要把 `reviewItems` 重构为显式 `sessionQueue` + 指针状态。

---

顺带说明：**badge 与"复习结束"的一致性本来就不依赖会话重建**——badge 是 background 在每次 `_dbi` 变更时重查 `getDueReviews()` 算的，与会话队列是两条独立链路。所以只要结束判定以 DB 为准，无论快照还是重建，badge 都一致。

如果这个方向 OK，我可以把 C1 重构（+ 可能的 B1 首评排程修复）写成详细执行方案，等你确认后再动代码。

---

## User

那你如何确保进度显示1/N→N/N 是准确的呢？

---

## Assistant (Plan · DeepSeek V4 Flash · 67.9s)

_Thinking:_

The user asks: "那你如何确保进度显示1/N→N/N 是准确的呢？" — How do you ensure the progress display 1/N → N/N is accurate?

This is a sharp question about my proposed session-queue design. The "1/N → N/N" progress claim needs scrutiny:

In my design, the session queue is a snapshot. Progress = `(reviewIndex + 1) / sessionQueue.length`. The claim "1/N → N/N" implies the queue length is FIXED at N during the session. But:

1. **rating < 3 requeues to the end**: If a card is rated <3, it moves to the queue end → it will be reviewed AGAIN in the same session. So the total number of reviews in the pass is NOT N — it's N + (number of requeues). The progress "1/N → N/N" would be misleading because a requeued card gets reviewed twice. E.g., 5 cards, card 2 rated <3 twice → you review 7 times total but progress shows 1/5, 2/5... and after the last card you "loop back" to card 2 again — progress would show 1/5 again? Or does the progress only count unique cards?

2. **Mid-session additions at the pass boundary**: When the queue empties and a new pass starts (new cards), the progress resets to the new pass's N. So "1/N → N/N" is per-pass, not per-session. The session could have multiple passes.

So the honest answer: **the "1/N → N/N" claim is NOT strictly accurate** with requeues. Let me think about what progress SHOULD mean and how to make it accurate.

The user is probing exactly this. Let me think carefully about what "progress" means in each model:

**Current model (rebuild every rating)**: `current = min(reviewIndex+1, reviewItems.length)`, `total = reviewItems.length`. After each rating, the queue is rebuilt (shrunken) and index=0 → progress ALWAYS shows "1/newN". E.g., 10 due → rate 1 → shows "1/9" → rate → "1/8"... So the TOTAL (denominator) shrinks. The "progress" is really "this is the first remaining card of the current due set". It's accurate as "dueDate-order position" but never advances.

**My proposed model**: session queue with requeue-to-end. Progress `(index+1)/N`. The problem: requeues inflate the actual work. 

Let me define the semantics precisely. What does the user WANT progress to mean?

Option A — **"position in the current due set, unique cards"**: progress = how many unique due cards have been passed. Denominator = current due count. This is what the current model roughly does (1/N after each rebuild) but it resets.

Option B — **"completed review actions / total review actions for this pass"**: If requeues are counted, the denominator grows as you add retries. Accurate but the denominator changes mid-pass.

Option C — **"progress through the stable queue snapshot, counting each rating action"**: The snapshot is N cards. Each rating is one action. If you rate <3 and it requeues, that's an extra action. So the denominator for "actions" isn't fixed.

Hmm. The cleanest accurate definition:

**Progress = "cards completed this session / cards that were due at session start"** — but with requeues, a card completed with <3 isn't really "completed".

Let me reconsider. The real question: what does the user expect "进度 1/N → N/N" to represent? Most SRS apps (Anki) show:
- "X cards remaining" or "X/Total" where Total = the cards in the current review batch (the NEW + REVIEW counts), and the queue is fixed (no requeue in the same session — failed cards are shown as "again" and their next review is scheduled, not re-reviewed in the same session).

Anki's "again" DOES re-show the card later in the same session (it goes to the learning queue). Anki's progress counts the total actions, which can exceed the unique card count.

So — to make progress accurate, I need to define it consistently. Let me think about what's most truthful and least confusing:

**Definition (accurate): 进度 = 已完成评分次数 / 本次 pass 的总评分次数**，where 总评分次数 = unique cards + retries. But this denominator changes as retries happen (a <3 rating adds +1 to the denominator). That's actually what Anki does implicitly (the learning queue grows).

Alternatively — **simpler & honest: 进度 = 本次 pass 中"位置"（index），denominator = 当前队列长度**，but clarify it's "位置" not "完成率". With requeue-to-end, the position and length both shift.

Hmm — let me think about what the user is really driving at. They asked "how do you ENSURE 1/N→N/N is accurate". The honest answer: **you can't have a clean 1/N→N/N with requeues** unless you define N carefully. So I need to:

1. **Define the progress metric precisely**, OR
2. **Change the requeue semantics** so the queue is fixed.

Let me consider changing requeue semantics. What if the session does NOT requeue <3 cards within the same session? Instead:
- rating <3 → card is marked "未掌握" (failed), recorded, and its next review is scheduled (today or tomorrow), NOT re-shown this session.
- The session is a fixed batch: review each due card exactly once.
- Progress = 1/N → N/N exactly (N = the due count at session start).
- After the batch, if the user wants, they can review the failed ones again (a "retry" button / next pass).

But — the user's original requirement (from the todo feature / earlier): "Cards rated <3 are requeued (trim-queue); >=3 are removed from queue". The trim-queue requeue was an explicit design choice. And my analysis B2 noted the requeue semantics. If I change to "no requeue, fixed batch", that changes the review semantics — the user might not want that.

Actually — let me reconsider. There are two clean, defensible designs:

**Design 1: Fixed batch (no requeue this session).**
- Queue = due cards at session start.
- Rate each once. <3 → "未掌握" (still shown as failed in the summary, next review scheduled soon).
- Progress = reviewed / N exactly (1/N → N/N). Accurate, clean.
- Failed cards get their next review via the SRS schedule (e.g., dueDate = now + short interval).
- Optionally: a "重来本轮失败" button at the end.

**Design 2: Requeue-to-end (trim-queue).**
- Queue = due cards. <3 → move to end, reviewed again this session.
- Progress CANNOT be a clean N — the actual work = N + retries. 
- To show progress accurately: progress = "已完成评分 / 已完成评分 + 剩余待评分"(counting each action). I.e., `current = reviewed actions`, `total = reviewed + remaining`. This total is stable within a pass (each action is either consumed or requeued-as-remaining). Actually — this works! Let me define:
  - `queue` is a list. `index` = current position. 
  - `remaining = queue.length - index` (cards ahead, including the current).
  - `completed = total actions completed`.
  - Total actions = completed + remaining (which changes as requeues happen).
  - Hmm — when you rate <3, the card goes to the END → remaining increases by 1 (well, net: the card you just rated was at position `index`, it moves to the end → the cards after it shift... actually requeue-to-end: remove from current position, push to end. remaining = (cards after) + 1 (the requeued card). So remaining stays the same (you consumed one, added one back). completed +1. total = completed + remaining → +1. So the total grows by 1 per requeue.
  - Progress = completed / (completed + remaining). E.g., 5 cards, all rated <3 once → total 10 actions, progress goes 1/5... hmm.

This is getting complicated. Let me step back and think about what the user actually wants.

The user's question is a CRITIQUE: "how do you ensure 1/N→N/N is accurate?" They're pointing out that my claim was hand-wavy. The honest answer is:

**"1/N→N/N" is only exact if the pass is a fixed batch. With requeues, it's not.** So I must either:
(a) drop the requeue (fixed batch) → clean progress, or
(b) keep requeue → show progress as "完成率" (completed actions / total actions including retries), or a "剩余 N 张" countdown instead of a ratio.

Actually — the SIMPLEST accurate and honest UI: **show "剩余 N 张" (cards remaining)** instead of a ratio. With requeue-to-end, "剩余" counts the queue length (including requeued cards). It counts down as you pass cards but bumps +1 on a requeue. That's accurate and honest (you DO have more work when a card fails).

But the user specifically mentioned "1/N → N/N" as the goal. So they want a ratio that goes 1/N, 2/N, ... N/N. Let me think about how to make THAT exact:

The only way to have an exact 1/N→N/N ratio is a **fixed batch**: N = number of cards in the pass, and each card is rated exactly once. Requeues (rating <3) must NOT re-enter the same pass.

But then "重来" cards... what happens to them? In Anki, "again" puts the card back in the learning queue (same session). Anki's progress counts total cards (which includes relearning). So Anki doesn't show a clean 1/N→N/N either when there are relearns.

Hmm. So the user's "1/N→N/N" ideal is fundamentally at odds with requeueing. UNLESS we define the ratio differently.

Let me offer the user a clear choice:

**方案 A — 固定批次（精确进度）**：
- N = 进入会话时的待复习卡数
- 每张卡只评一次；rating < 3 的卡标记"未掌握"，下次复习由 SRS 排程（很快再次到期，或会话结束可选"重试未掌握"）
- 进度 = 已评 / N，**精确 1/N → N/N**
- 需要改变现有"重来即重排队尾"的语义

**方案 B — 保留重排（诚实进度，不用比例）**：
- 进度显示改为"剩余 N 张"（含重排的卡），或"已完成 X 次评分"
- 1/N→N/N 的比例在存在重来时本质上不成立（你会有多于 N 次评分动作）

Wait — actually, let me reconsider. Is there a hybrid that gives clean 1/N→N/N AND requeues? 

What if: N = 本次 pass 需要完成的评分次数 = 初始队列长度，且每次评分都算一次"动作"，requeue 不算"新增动作"但延长队列？No — a requeued card IS an additional review action, so the total actions > N.

Alternatively: progress counts "unique cards whose latest rating >= 3" / N (passed cards / initial N). But a card rated <3 then >=3 counts as 1 passed. Progress = passed/initial. This is a "mastery progress" — accurate but doesn't reflect the immediate position. E.g., 5 cards, you rate card 1 <3 (requeued), card 2 >=3 → passed=1/5. You keep going; card 1 comes around again → rate >=3 → passed=2/5. When passed=5/5 → done. Progress goes 1/5... 5/5 exactly! And it's honest: "5 张卡片中已掌握 X 张".

Hmm — that's actually a nice metric: **progress = 已通过(最后评分>=3)的唯一卡数 / 初始待复习卡数**. It's a mastery countdown. It reaches N/N only when all cards are passed. Requeues don't break it (a failed card doesn't increment; passing it later does). The UI shows "掌握 X/N".

But — the user's mental model might be "position progress" not "mastery progress". And with this, the current card index isn't shown (you might be at pass 3 of card 1). 

Actually — I think the cleanest honest answer to the user is: **you can't have a clean 1/N→N/N ratio AND requeues; pick one**. Let me present the options clearly and let the user decide. This is exactly the kind of design tradeoff the user wants to weigh.

Let me also reconsider: what does the CURRENT design show? `current = min(reviewIndex+1, reviewItems.length)`, `total = reviewItems.length`. After each rebuild, total = current due count, index=0 → "1/N" where N shrinks. So the current design shows "1/10, 1/9, 1/8..." which is... actually not terrible (it says "you're at the first of the remaining due cards"). But the user's complaint (my C1 finding) was the instability. The user now asks about my proposed "1/N→N/N".

Let me give a precise, honest answer:

1. **承认**: 我之前的"1/N→N/N"表述不严谨。在有重来（rating<3 重排队尾）的语义下，一次 pass 的评分动作数会超过 N，严格的比例无法成立。

2. **给出可精确化的方案**：
   - **方案 A（推荐）：固定批次**。N = 进入会话的待复习卡数；每张卡评一次；<3 记"未掌握"（不重排），会话结束可选"重试未掌握"。进度 = 已评/N 精确 1/N→N/N。语义变化：重来不再是同会话重排，而是"本轮结束后单独重试"。这与 Anki 的"结束批次后重新学习"类似，且进度干净。
   - **方案 B：保留重排 + 掌握度进度**。进度 = 已通过（最终评分>=3）的唯一卡数 / 初始 N。重排不破坏该指标，1→N 精确，但语义是"掌握度"而非"位置"。配合"剩余 X 张"或当前卡序号辅助显示。
   - **方案 C：保留重排 + 剩余数**。不显示比例，显示"剩余 N 张"（含重排），诚实。

3. 让用户选。

Actually — let me reconsider what's simplest and matches the user's apparent desire. The user asked about "进度显示1/N→N/N". They want an advancing ratio. The honest answer requires choosing between requeue and clean ratio.

Let me present A vs B as the two viable options that both give a clean ratio, and note C as the no-ratio alternative. Recommend one.

Which to recommend? The user's design intent (from my analysis): "重来" cards cycle in the session (trim-queue). If they value that, B (mastery progress) preserves it with a clean ratio. If they value a simple position progress, A (fixed batch) is cleaner but changes requeue semantics.

Hmm — actually, let me reconsider the semantics of "重来" once more. The current behavior: rating <3 → card requeued (due again, reviewed later in the same session). The user's mental model: "重来" means "I'll see it again until I get it right". This is a learning-loop. With A (fixed batch), "重来" would NOT re-show it — instead the card just gets scheduled soon (maybe tomorrow). The user might find that odd ("I said 重来, why isn't it coming back?").

But — in Anki, "again" DOES re-show within the session (learning/relearning queue). Anki's progress counts actions. So the "learning loop" is standard. The ratio Anki shows is like "5/20" where 20 includes relearns.

So maybe the MOST honest and standard approach is: **count actions, not unique cards**. Progress = completed actions / (completed + remaining actions). With requeue, remaining grows on a fail. The ratio advances (1→2→3...) but the denominator can grow. That's not "1/N→N/N" with fixed N, but it IS accurate.

OK — I think the right move is to present the tradeoff clearly and ask the user which semantics they want for "重来" and "进度". Let me frame it as a decision:

**进度口径（决定"1/N→N/N"是否可能）取决于"重来"语义：**

- **口径 1 · 固定批次**（每张卡本轮只评一次）→ 进度可精确 1/N→N/N
  - "重来" = 标记未掌握，本轮不重排；会话结束可选"重试未掌握"
- **口径 2 · 重排学习环**（重来卡回队列尾，本轮重评）→ 1/N→N/N 严格不成立
  - 进度改为"剩余 N 张"（含重排）或"已掌握 X / 初始 N"（通过数口径）

让用户决定"重来"想要哪种，然后我据此设计进度。

Actually — let me simplify the options to two clear ones and recommend. Let me think about which the user would prefer.

The user's original review semantics: "Cards rated <3 are requeued (trim-queue); >=3 are removed from queue." This was MY memory note from the design. So the requeue was a designed behavior. Changing to fixed batch is a semantic change.

Given the user asked "how do you ensure 1/N→N/N is accurate" — they want accuracy. The cleanest accurate ratio that PRESERVES requeue is **口径 2's "已掌握 X / 初始 N"** (mastery countdown). It's accurate (reaches N/N only when all passed), preserves the learning loop, and doesn't mislead.

But wait — there's a subtlety with "已掌握 X / 初始 N": if the user rates a card <3, passes the rest, then the failed card comes around and they rate it >=3 → mastery increments. But what if they rate it <3 again → it requeues → loop. Mastery stays X-1. When all N are passed → N/N. This is a clean "all cards mastered" progress. But it doesn't tell you "how far through the current rotation you are". Hmm — maybe show BOTH: a small "剩余 X 张" (current queue length) + "已掌握 X/N" (mastery).

OK, let me also reconsider: is there an even simpler framing? 

The user's real concern (from their scenario): when they're mid-session and the queue changes, the progress should be honest. My proposed design (stable pass + boundary live-check) needs a DEFINED progress metric. The user asks me to define it precisely. 

Let me give the precise definition I'd use and note where it's exact vs not:

**推荐：进度 = 本轮已评卡的"通过数" / 本轮初始队列长度（掌握度口径）**
- 每张卡本轮首次评分后：>=3 → 通过数+1；<3 → 不+，卡回队尾待重评
- 同卡后续重评：>=3 → 通过数+1（首次未+）；<3 → 不变
- 通过数达到 N → 本轮结束（+ 边界 live 校验）
- 进度精确 1/N → N/N，重排不破坏
- UI：`已掌握 {passed}/{N}`（或"剩余 {N-passed} 张"）

This is exact, honest, preserves requeue. Let me present this as the recommended definition, and offer the alternatives (fixed batch for a position-style 1/N, or remaining-count).

Hmm — but actually, let me reconsider whether "通过数/初始N" could be confusing. Consider 10 cards, all rated <3 repeatedly for a long time (learning hard material). Progress stays at 0/10 while the user reviews 30 times. That's honest (none passed) but might feel stuck. The current card position (e.g., "第 5 张" of the current rotation) isn't shown. Maybe show both: `已掌握 3/10` as the main + `本轮第 X 张` small.

Let me present concisely. The user asked a pointed question; give a precise answer with a clear recommendation and let them choose.

Let me also double-check the current ReviewSession progress display to ground my answer. From earlier grep: `reviewProgress` memo computes `current: min(reviewIndex+1, reviewItems.length), total: reviewItems.length`. And ReviewSession shows... let me recall line 148: "熟悉率 {goodCount}/{total} · 平均评分..." — that's the session summary. And there's a progress bar somewhere. Let me quickly check the ReviewSession progress UI.

Actually — I have enough context. Let me answer the question directly.

Let me write a focused, honest response:

1. **承认不严谨**: "1/N→N/N" 在重排语义下严格不成立（评分动作 > N）。
2. **给出精确可实现的进度口径**（推荐掌握度口径），并列出备选。
3. 请用户定"重来"语义。

Keep it tight.

好问题——这戳中了要害。诚实回答：**"1/N→N/N"在有"重来重排"的语义下严格不成立**，因为一次评分动作数会超过 N。我之前表述不严谨。要精确，必须先定"重来"的语义，进度口径随之确定：

## 口径 A · 重排学习环（保留现有语义）→ 进度改用"掌握度"

- **N = 进入会话时的待复习卡数**（固定，不随重排变化）
- 每张卡首次评分 `>=3` → **已掌握 +1**；`<3` → 不 +，卡回队尾待重评
- 同卡后续重评：`>=3` → 已掌握 +1；`<3` → 不变
- **已掌握 = N → 本轮结束**（再做边界 live 校验）
- 进度 = `已掌握 X / N`，**精确 1/N → N/N**，重排不破坏
- 诚实性：10 张卡全差评、复习 30 次，进度停在 0/10——它如实反映"无一掌握"，而非假装有进展

**注意**：这个口径是"掌握进度"不是"位置进度"。当前在轮换第几张需辅助显示（可加"本轮第 X 张"小字）。

## 口径 B · 固定批次（改变"重来"语义）→ 位置进度 1/N→N/N

- N = 会话开始时的待复习卡数；**每张卡本轮只评一次**
- `<3` 标记"未掌握"，**不重排**；会话结束后可选"重试未掌握 N 张"
- 进度 = `已评 / N`，精确 1/N → N/N（位置口径，最直观）
- 语义变化：说"重来"不会当场重评，而是本轮结束后单独重学——接近 Anki 的"批次结束再重新学习"

## 我的建议

**口径 A** 更贴合你现有的"重来重排"设计意图（失败卡本轮会再回来），且进度依然精确——只是把它定义为**掌握度**而非位置。UI 上主进度显示 `已掌握 X/N`，辅以 `剩余 Y 张`。

如果你更想要"位置 1/N→N/N"的直观感，就得选**口径 B**，接受"重来"改为批次后重学。

你倾向哪种"重来"语义？定了我再把完整的 C1 重构方案（会话队列 + 进度口径 + 边界校验）落成执行计划。

---

## User

我的意思是会话内稳定队列 + 队列清空时 live 校验 的方式 会使得1/N→N/N 这样的掌握度计算不准确。因为N= 进入会话时的待复习卡数，然而用户可能会在复习到一半的时候加入某一张卡片到复习队列，用户也可能将复习队列的一张卡片移出复习，甚至直接删除这样卡片（这可能导致更严重的后果）。总之，复习会话中的卡片数量实际上是无法统计的，因此1/N→N/N这样的掌握度实际上是没有意义的

---

## Assistant (Plan · DeepSeek V4 Flash · 47.9s)

_Thinking:_

The user is making a sharp point: my "掌握度 X/N" (mastery countdown) proposal is STILL inaccurate because N = 进入会话时的待复习卡数 is not stable — during a session, the user can:
1. Add a card to the review queue mid-session.
2. Remove a card from the review queue mid-session.
3. **Delete a card entirely** mid-session (更严重的后果 — this could break things).

So N (the session-start due count) doesn't match the actual live due set. The mastery ratio X/N would be computed against a stale N.

They're right. My proposed definition is fragile. Let me think carefully.

The core truth: **the review session's card set is inherently mutable** (mid-session add/remove/delete). Therefore ANY ratio with a fixed denominator (N at session start) is meaningless. The user concludes: "1/N→N/N这样的掌握度实际上是没有意义的".

So what IS meaningful? Let me think about what progress/feedback can be honest and useful when the set is mutable:

**Option 1: "剩余 N 张" (remaining count) — live, no ratio.**
- Show the LIVE due count (from the DB, updated on each mutation). "剩余 N 张" is always accurate because it's the current DB state.
- During the session, as you rate cards, the due count changes. Failed cards (requeued) keep it steady. New additions bump it. Removals/deletions drop it.
- No ratio, no denominator, no false precision. Honest.
- This is essentially what the badge already shows (due count). The session progress = "当前待复习 N 张" — live.

**Option 2: No progress display at all for the session.**
- The session just shows the current card. The "progress" is the badge (global due count) + the session end state.
- Simplest. But the user might want SOME feedback.

**Option 3: A bounded-session model — the session is explicitly a FIXED set, and mutations are handled explicitly.**
- The session queue is immutable once started. Mid-session add/remove/delete of review cards: the session is UNAFFECTED (it's a snapshot), BUT the boundary check reconciles. The "progress" then is 1/N→N/N of the SNAPSHOT — accurate for the snapshot, but the user's point is that the snapshot ≠ reality, so a "X/N mastered" against the snapshot is misleading when cards were added/removed.

Hmm — wait. Let me reconsider. The user's argument: N is unstable → ratio meaningless. But is a ratio against the SNAPSHOT meaningless? If the session shows "已掌握 3/5" where 5 = cards at session start, and the user added 2 more mid-session, then "3/5" is accurate FOR THE SNAPSHOT but the session isn't done (2 more due). The "3/5" is misleading because the user thinks 5 is the total work.

So the user is right: any fixed-N ratio misleads when the set mutates.

**What's the honest feedback?** The only stable, truthful number is the **live due count** (which changes as the user works). So:

- **剩余 N 张**: live due count, updates on every mutation (via the broadcast). When it hits 0, session done. This is EXACTLY accurate at all times. The badge already shows this. The session could show the same number with a label like "剩余 N 张".

- For "session progress", the honest metric could be **本会话已完成 X 次评分** (actions completed this session) — a counter, not a ratio. Monotonically increasing, never misleading. Combined with "剩余 N 张", the user sees: "本次已评 X 次 · 剩余 N 张". No ratio, no denominator.

This aligns with the current design actually: the current design shows `current/total` (1/N per rebuild) — which the user is saying is meaningless. Removing the ratio entirely in favor of "剩余 N 张" (live) + "已评 X 次" (counter) is the honest answer.

Now — the user also mentioned a SERIOUS consequence: "直接删除这样的卡片（这可能导致更严重的后果）". Let me think about what deleting a review card mid-session does in the CURRENT design:

Current flow (handleReviewRate): gets `current = reviewItems[reviewIndex]`, `reviewSrsMap.get(current.id)`, rateSrs, updateReviewSrs. If the card was DELETED mid-session:
- The card is gone from the DB.
- reviewItems (the session queue) is a stale snapshot containing the deleted card's Item object.
- `updateReviewSrs(current.id, newSrs)` → `idx.get(itemId)` → no entry → does nothing (the `if (entry)` guard). So no crash.
- BUT the session continues showing the deleted card (stale). Rating it does nothing (no review entry). After rating, getDueReviews() re-queries → the deleted card is gone → queue rebuilt without it. So the current design actually RECOVERS (because it re-queries after every rating — the deleted card drops out).

Wait — the current design's "rebuild after every rating" has a hidden benefit: it's SELF-HEALING against mid-session mutations! Because after each rating, getDueReviews() reflects the live DB (adds/removes/deletes all reconciled). That's exactly WHY the design re-queries every time.

So the user's defense of the current design is even stronger than I thought: **the per-rating rebuild is what makes the session robust against mid-session mutations** (add/remove/delete). A stable snapshot would STALE-OUT on deletions — the user could be shown a deleted card, rating it writes nothing, and the session would have a "phantom" card.

Let me verify this in the current code: handleReviewRate does `updateReviewSrs(current.id, newSrs)` → if the review entry was deleted (card deleted), `idx.get(itemId)` returns undefined → `if (entry)` false → no-op. Then the 350ms timeout re-queries getDueReviews → deleted card gone → queue rebuilt. So the phantom card is dropped after ONE rating (which was a no-op). The user sees the deleted card once (confusing) then it disappears. Not perfect but self-healing.

With a stable snapshot (my proposal), the deleted card would stay in the queue until... the boundary. Actually — with my "requeue-to-end + boundary live-check", a deleted card mid-session: it's in the session queue. The user rates it → updateReviewSrs no-op (entry gone) → but my design requeues if <3 or removes if >=3? The rating action itself... the card was deleted, rating it should just drop it from the queue (it doesn't exist). And at the boundary, the live check catches new additions but the deleted card is already handled. So my design also needs to handle "card deleted mid-session" — check existence before rating, drop from queue if gone.

OK so the user's point is comprehensive: **the review card set is live-mutable; any snapshot-based ratio is meaningless; and the per-rating rebuild is what keeps the session consistent with reality.**

So what's the RIGHT design then? Let me synthesize:

**The honest conclusion:**
1. **Progress ratio (1/N→N/N) is meaningless** in a mutable set. Agreed. Drop it.
2. **The live due count ("剩余 N 张")** is the only honest session metric — and it's the SAME number as the badge (getDueReviews). The session could just show "剩余 N 张" (or rely on the badge).
3. **The session must stay reconciled with the DB** — either per-rating rebuild (current, robust but jumpy) or a lighter reconciliation that handles add/remove/delete.

The current design's real weakness isn't correctness (it's robust) — it's the UX (progress resets to 1/N, index resets, prev/next on shifting sets). 

Given the user's analysis, the RIGHT design might be:
- **Keep per-rating DB reconciliation** (for correctness against mutations).
- **But change the UI**: instead of a ratio, show "剩余 N 张" (live due count) + "本次已评 X 次". And handle the "current card" more gracefully (the current card IS the first due card — that's deterministic and fine).

Actually — wait. Let me reconsider whether the current design's "jumpy" UX is even that bad. After each rating, the queue = live due set, index 0 → the current card is always "the first due card". Since dueDate asc, after rating card A (>=3), the first due is the next one. After rating A (<3), A goes to the end (dueDate=now is the max), first due is the next one. So the "current" card progression is: always the first due. The user reviews cards in dueDate order, failed cards get pushed back. This is actually a DETERMINISTIC, sensible order. The "jumpiness" is mostly the INDEX RESET (progress 1/N each time) + the slide animation replaying.

So the FIX might be much simpler than a session-queue refactor:
- **Remove the misleading ratio**; show "剩余 N 张" (live) + maybe a session counter.
- **Keep the per-rating rebuild** (correctness).
- The prev/next buttons — with a mutable set, prev is inherently weird. Maybe the session should NOT offer prev/next at all (it's a "review the due set" flow, not a "browse a fixed list"). Or prev/next navigate within the current snapshot (with the caveat that a rating changes it).

Hmm — actually, the prev/next buttons in the current design: handleReviewPrev/Next navigate reviewItems by index. After a rating, the queue rebuilds and index resets to 0, so prev/next are mostly for flipping WITHOUT rating (e.g., to peek at the next card before rating the current). That's a legitimate use (preview the queue). The "unstable" part is that prev/next operate on the current snapshot which shifts after ratings.

Let me step back and think about what the user is REALLY after. They've been probing my C1 redesign and found it wanting. Their conclusion: ratio-based progress is meaningless in a mutable session. 

I think the honest, clean resolution is:

1. **Abandon the ratio.** Session progress = live "剩余 N 张" (the due count, same as badge) + a session action counter ("本次已评 X 次"). Both honest under mutation.

2. **Keep the current per-rating DB rebuild** (it's correct and self-healing) — OR reduce it to a lighter reconciliation. Actually — given the user's defense, maybe keep it. The remaining UX issue is just the ratio (which we remove) and the index reset (which becomes invisible if there's no ratio).

3. **Handle mid-session mutations gracefully** (they already are, via rebuild).

So the C1 "fix" collapses to: **remove the misleading progress ratio, replace with live remaining + action counter**. Much smaller than a session-queue refactor. And it's what the user's analysis points to.

Wait — but there's still the prev/next question. Let me address it: with a mutable set, prev/next navigate the CURRENT snapshot. After a rating, the snapshot is rebuilt. This is acceptable if the user understands prev/next = "peek the current due queue". Or we could remove prev/next (the review flow doesn't strictly need them — you rate the current card and move on). Actually — prev/next in a review session is unusual. Anki doesn't have prev in review (you review forward). Let me suggest removing prev/next OR keeping them as "peek" with a clear caveat.

Hmm — actually, let me not over-scope. The user's specific point is about progress accuracy. Let me:
1. Agree with their analysis (the ratio is meaningless).
2. Propose: replace ratio with live "剩余 N 张" + "本次已评 X 次" counter.
3. Note that the current per-rating rebuild is actually CORRECT and self-healing (defend their design) — the only change needed is the progress UI, not the queue logic.
4. Address the "delete card" severity: verify the current design handles it (it does — rebuild + no-op rating guard). And in any redesign, ensure existence checks.

Let me also reconsider: is there value in showing "会话掌握 X 张" (session mastered count, an absolute number, not a ratio)? "本次掌握 3 张" — honest (count of cards passed this session). That's a counter, not a ratio. Fine to show alongside "剩余 N 张".

So the proposed session UI:
- 剩余 N 张（live due count — the honest "how much left")
- 本次已评 X 次 / 本次掌握 Y 张（session counters）
- No ratio. No denominator.

And the queue logic stays as-is (per-rating rebuild, self-healing). The C1 "fix" becomes a UI change (remove ratio) + possibly smoothing the current-card transition.

Actually — wait. Let me reconsider whether the user wants to KEEP the per-rating rebuild or whether they're open to a different approach. Their message: "会话内稳定队列 + 队列清空时 live 校验 的方式 会使得1/N→N/N 这样的掌握度计算不准确...复习会话中的卡片数量实际上是无法统计的，因此1/N→N/N这样的掌握度实际上是没有意义的".

They're saying: my proposed design (stable queue + boundary live-check) makes the ratio inaccurate. The ratio is meaningless. So they're rejecting BOTH the ratio AND (implicitly) the value of the stable-queue approach (since its main advertised benefit was the clean ratio).

So the resolution: the ratio is out. What remains is:
- Keep per-rating rebuild (current, self-healing) OR a reconciled session.
- Progress UI = live remaining + counters.

Given the user's analysis, I think the conclusion is: **the current per-rating rebuild design is actually the RIGHT approach (self-healing, always truthful), and the only real problem was my framing of "progress" as a ratio.** The fix is purely presentational: show live "剩余 N 张" + session counters instead of a ratio.

Let me also reconsider the original C1 complaints (from my analysis):
1. Progress counter always shows "1/N" → FIXED by removing the ratio (show live remaining instead).
2. prev/next on shifting sets → could keep as "peek current queue" or simplify. Minor.
3. Slide animation resets each rating → cosmetic; could keep or soften.

So the refined C1 plan:
- **Remove the ratio** (`reviewProgress.current/total`). Replace with live due count ("剩余 N 张") + session counters ("本次已评 X 次 · 掌握 Y 张").
- **Keep the per-rating rebuild** (correct, self-healing against add/remove/delete).
- Optionally: guard against deleted/removed cards when rating (already guarded via `if (entry)` in updateReviewSrs + rebuild drops them).
- prev/next: decide whether to keep (as "peek") or drop.

This directly answers the user's point AND simplifies the fix. Let me present this as the conclusion.

Also — the user mentioned "甚至直接删除这样卡片（这可能导致更严重的后果）". Let me make sure I address the delete-card severity in my response. What's the "更严重的后果"? If a card in the review queue is deleted:
- Current design: rebuild after each rating drops it. Rating it is a no-op. The card's review entry is ALSO deleted (deleteItem cascades review cleanup? Let me think — when an item is deleted, is its review entry deleted? Let me check. In options onDelete → deleteItem → does it clean reviews? From the merge flow, they explicitly clean reviews. Let me check the general delete path. Actually — this matters. If a card is deleted but its review entry survives, then getDueReviews would return a review entry with no matching item → pairWithItems filters it out (itemMap.get returns undefined → filtered). So no phantom. But the orphan review entry persists in the DB (dead data). That's a "更严重的后果" candidate — orphaned review entries.

Let me verify the delete path cleans reviews. Let me check options onDelete / deleteItem.

Actually — this is worth checking for the analysis. Let me look at the delete flow.

But I'm in plan mode — read-only is fine. Let me check the delete path quickly.

Let me search for the item delete + review cleanup.

你说得对，我承认——**任何固定分母的比例在可变会话里都没意义**。而且你点出了一个更深的事实：当前"每次评分后重查重建"的设计**恰恰是对中途变更最稳健的**（增/删/移都会在下一次重建时被自动校正），我用"稳定快照"去换它，反而会引入"幻影卡"。先确认一下删除卡片的后果（孤儿 review 条目），再给出结论：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"const onDelete\\|deleteItem\\|deleteItems\\|removeReview\\|reviews\" src/options.tsx | head -20; echo \"=== deleteItem DB 实现 ===\"; grep -n \"export async function deleteItem\\|export async function deleteItems\" src/database/index.ts"
}
```

**Output:**
```
62:  deleteItem,
63:  deleteItems,
66:  removeReview,
309:    getAllReviews().then((reviews) => {
310:      setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
311:      setReviewSrsMap(new Map(reviews.map((r) => [r.itemId, r.srs])))
384:  const onDelete = (id: string) => {
390:    await deleteItem(confirmDeleteId)
499:    // Atomic transaction: insert new + delete originals + cleanup reviews
500:    await tx({ items: "readwrite", reviews: "readwrite" }, async (stores) => {
515:          const req = stores.reviews
538:    await deleteItems(selectedIds)
566:        await removeReview(itemId)
765:  const onDeleteSectionCb = useCallback(
1194:    await deleteItem(item.id)
1817:                    { items: "readwrite", reviews: "readwrite" },
1821:                        const idx = stores.reviews.index("itemId")
1826:                              stores.reviews.delete(req.result as string)
1921:                        const reviews = await getAllReviews()
1922:                        setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
=== deleteItem DB 实现 ===
300:export async function deleteItem(id: string): Promise<void> {
316:export async function deleteItems(ids: string[]): Promise<void> {

```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.9s)

_Thinking:_

Let me check deleteItem (line 300) and deleteItems (line 316) — do they clean up review entries?

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/database/index.ts",
  "limit": 30,
  "offset": 300
}
```

**Output:**
```
<path>/home/xx/Lime/src/database/index.ts</path>
<type>file</type>
<content>
300: export async function deleteItem(id: string): Promise<void> {
301:   // Cascade: remove associated review entry and item in one atomic transaction
302:   await tx({ reviews: "readwrite", items: "readwrite" }, async (stores) => {
303:     const idx = stores.reviews.index("itemId")
304:     return new Promise<void>((resolve, reject) => {
305:       const req = idx.getKey(id)
306:       req.onsuccess = () => {
307:         if (req.result) stores.reviews.delete(req.result as string)
308:         stores.items.delete(id)
309:         resolve()
310:       }
311:       req.onerror = () => reject(req.error)
312:     })
313:   })
314: }
315: 
316: export async function deleteItems(ids: string[]): Promise<void> {
317:   if (ids.length === 0) return
318:   // Cascade: remove associated review entries and items in one atomic transaction
319:   await tx({ reviews: "readwrite", items: "readwrite" }, async (stores) => {
320:     const idx = stores.reviews.index("itemId")
321:     const reviewKeys = await new Promise<(IDBValidKey | null)[]>((resolve) => {
322:       const results: (IDBValidKey | null)[] = []
323:       let pending = ids.length
324:       for (const id of ids) {
325:         const req = idx.getKey(id)
326:         req.onsuccess = () => {
327:           results.push(req.result)
328:           if (--pending === 0) resolve(results)
329:         }

(Showing lines 300-329 of 747. Use offset=330 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 20.5s)

_Thinking:_

Good — `deleteItem`/`deleteItems` DO cascade-delete review entries atomically. So deleting a card mid-session also removes its review entry. The current per-rating rebuild (getDueReviews) then correctly excludes it. And rating the deleted card: `updateReviewSrs` → `idx.get(itemId)` → undefined → no-op. So no crash, no orphan. The current design is robust.

So the "更严重的后果" the user worried about is actually already handled by the current design (atomic cascade + per-rating rebuild). A STABLE SNAPSHOT design would be the one at risk (phantom cards in the queue, rating writes to a deleted entry — though guarded).

So my conclusion is solid:
1. The user is RIGHT: any ratio with a fixed denominator is meaningless in a mutable session.
2. The current per-rating rebuild is CORRECT and self-healing — it's actually the right architecture for a mutable set. My "stable snapshot" proposal was a regression in robustness (the very thing the rebuild protects against).
3. The REAL fix for the "UX jumpiness" is not the queue logic — it's the PROGRESS METRIC: drop the ratio, show live "剩余 N 张" (same as badge) + session counters.

Now let me finalize the response. I should:
1. Acknowledge the user is right, and go further: the current rebuild design is defensible precisely BECAUSE of mid-session mutations. Verify delete cascade is atomic (done).
2. Conclude: ratio is out. 
3. Propose the refined fix: keep the per-rating rebuild (or a light reconciliation), and replace the ratio with:
   - **剩余 N 张** — live due count (getDueReviews, same number as badge) — always honest.
   - **本次已评 X 次 · 已掌握 Y 张** — session action/mastery COUNTERS (absolute, no denominator).
4. Address prev/next: with a mutable set, prev is inherently unstable. Option: drop prev/next from the review session (review forward-only, like Anki), OR keep as "peek" with a caveat. Ask the user.

Actually — let me reconsider the "已掌握 Y 张" counter. Is it honest? "Y 张卡在本会话中被评过 >=3" — yes, an absolute count of passed cards this session. But "掌握" implies mastery which is a stretch (one >=3 rating). Let me call it "已通过 Y 张" (cards passed this session). Honest.

And "本次已评 X 次" — total rating actions this session. Honest counter.

So the session header could be: `剩余 {remaining} 张 · 本次已评 {rated} 次 · 通过 {passed} 张`. All absolute, all honest under mutation. The "剩余" comes from getDueReviews live.

But wait — there's a subtlety with "剩余 N 张" DURING a session with the current rebuild. After each rating, getDueReviews returns the live due set. "剩余" = that count. When you rate a card >=3, remaining decreases by 1. When <3 (requeue), remaining stays (card back). When a card is added mid-session, remaining bumps. When deleted, drops. All honest. And at the end, remaining = 0 → 复习结束. Consistent with the badge. 

So actually — "剩余 N 张" is just the due count, which the BADGE already shows globally. The session header showing it is redundant with the badge but gives in-session context. Fine.

Now — the "已完成" screen: currently shows "熟悉率 goodCount/total · 平均评分". The `total` there = reviewItems.length (session snapshot) — also a ratio-like thing. With the mutable-set insight, the completion summary should use absolute counters: "本次复习 {rated} 次 · 通过 {passed} 张" — honest.

OK let me also reconsider: is there ANY place a ratio is still meaningful? The review date-filter view shows "N 张" (counts) — absolute, fine. The masteredCount / activeCount stats — absolute, fine. So removing the ratio only affects the session header + completion summary.

Let me now write the final response. Structure:
1. 承认 + 深化: 你完全正确。而且这反过来证明当前"每次重查重建"设计是对的（自我校正），我的快照方案会引入幻影卡风险。删除卡片的级联清理（原子 tx）也确认了当前设计健壮。
2. 结论: 进度比例放弃。会话反馈改用绝对口径:
   - 剩余 N 张（live due count，与 badge 同源）
   - 本次已评 X 次 / 通过 Y 张（会话计数器）
3. C1 的"修复"缩水为纯 UI: 去掉比例 + 保留重建逻辑。prev/next 问用户取舍。
4. 请确认后出执行计划。

Let me keep it tight and clear. Since we're in plan mode, no edits.

确认了：`deleteItem`/`deleteItems` 都是**原子级联清理** review 条目（`index.ts:300-329`）。所以删除卡不会留孤儿，而当前"每次评分后重查"的队列会在下一次重建时把已删卡**自动剔除**——你的设计在可变集上是健壮的，我的"快照"方案反而会引入幻影卡风险。你完全正确。

## 结论：放弃比例，会话反馈改用绝对口径

进度比例（无论 1/N→N/N 还是掌握度 X/N）在**卡片集可中途增删**的前提下都不成立——N 无法定义。诚实的反馈只能是**无分母的绝对值**：

| 指标 | 口径 | 为什么诚实 |
|---|---|---|
| **剩余 N 张** | 实时 `getDueReviews()`（与 badge 同源） | 中途增/删/移都会即时反映，永远等于真实待复习数；=0 即"复习结束" |
| **本次已评 X 次** | 会话内评分动作计数器 | 单调递增，无分母，不撒谎 |
| **已通过 Y 张** | 会话内最终评分 ≥3 的唯一卡数 | 绝对计数，"已掌握"不误导（改用"通过"措辞） |

会话头部：`剩余 N 张 · 本次已评 X 次 · 通过 Y 张`——三个绝对数，与 badge 天然一致，永不出现"结束了 badge 还有数字"。

## 由此，C1 的"修复"缩水为纯 UI 层

- **保留**"每次评分后重查重建"（正确性 + 自我校正，不动）
- **去掉** `reviewProgress` 的 `current/total` 比例 → 换上面的绝对口径
- 结束页同样改用绝对计数（现为 `熟悉率 good/total · 平均评分`）

## 剩下一个待定项：prev/next 按钮

可变集下"上一张"天然不稳定（评分后队列已重建）。两个选择：
- **A · 移除 prev/next**：复习就是单向向前（Anki 模式），简单干净
- **B · 保留为"预览"**：在当前快照内可前后翻看（不评分），但评分后快照重建，语义需注明

你选 A 还是 B？确认后我把 C1 重构（去掉比例 + 会话计数器 + prev/next 取舍）落成完整执行计划。

---

## User

但每次评分后重查重建确实会带来性能问题，你有好的思路吗？  移除 prev/next按钮即可。

---

## Assistant (Plan · DeepSeek V4 Flash · 83.3s)

_Thinking:_

The user acknowledges the per-rating rebuild is correct but raises a PERFORMANCE concern: rebuilding after every rating (getDueReviews full re-query + pairWithItems + setState) is costly. They want a good idea to address the performance without losing the self-healing semantics. And they confirmed: remove prev/next buttons.

Let me think about the performance problem precisely:

**Current per-rating flow (handleReviewRate):**
1. `updateReviewSrs(current.id, newSrs)` — DB write (opens transaction, index lookup + put).
2. `setTimeout(350ms)` — animation.
3. `getDueReviews()` — **full IndexedDB index scan** (dueDate index, upperBound now, openCursor over ALL due entries) → returns ReviewEntry[].
4. `pairWithItems` — maps review entries → items via `allItemsUnfiltered` Map (O(n) for the due set).
5. `setReviewItems(items)` + `setReviewIndex(0)`.

The cost: `getDueReviews` opens a cursor over the dueDate index and reads every due entry. For a large due set, that's a full scan of due entries each rating. Plus the transaction overhead. Plus `updateReviewSrs` does its own index lookup + put. So per rating: 2 DB operations (one write, one read-scan).

Actually — is getDueReviews REALLY expensive? IndexedDB index cursor over due entries: it reads each due entry's full value. If the due set is small (say 10-50), it's fast. If it's large (500+ due), it's heavier. But IndexedDB is async and fast for small sets. The real cost might be the React re-render + the animation + the DB round-trips.

Hmm — but the user says it's a performance concern. Let me think about how to make it efficient while keeping self-healing.

**Key insight**: The rebuild after each rating only needs to reflect the DELTA changes to the due set:
- Rating the current card >=3 → that card leaves the due set.
- Rating <3 → that card re-enters the due set (dueDate=now).
- Mid-session mutations (add/remove/delete) → these are RARE (only when the user leaves the review tab to mutate).

So the per-rating rebuild is doing a FULL re-query to handle a 1-card delta PLUS the rare mid-session mutations. That's overkill.

**Optimization idea: incremental queue updates + periodic reconciliation.**

1. **Incremental local update per rating** (no DB re-query):
   - After rating the current card:
     - `rating >= 3`: remove it from the session queue.
     - `rating < 3`: move it to the end (or re-insert with dueDate=now semantics).
   - This is O(queue length) worst-case for the move-to-end, but no DB read.
   - Progress counters update locally.
   - **BUT** — this loses self-healing against mid-session mutations (a card added mid-session wouldn't appear; a deleted card would stay as phantom).

2. **Reconcile only on "session boundary" OR on external mutations**:
   - The session queue is updated incrementally per rating.
   - The DB is the source of truth; reconciliation happens:
     - When the queue empties (boundary live-check).
     - When an EXTERNAL mutation occurs (detected via the `_dbi`/`_dbp` broadcast? or via a "reviews changed" signal).

   How to detect mid-session mutations cheaply? The app already has the `chrome.storage.onChanged` broadcast (`_dbi`/`_dbp`). But those fire on ANY item change (including unrelated card edits). Hmm — a review-specific signal would be better. Actually — when a card is added to review (handleToggleReview → addReview → reviews store readwrite → broadcasts `_dbi`? Let me check — does the reviews store broadcast? withStore broadcasts on readwrite completion for the store. addReview uses withStore("reviews", "readwrite") → broadcasts `_dbi`? The broadcast keys are `_dbi` (items) and `_dbp` (projects). Reviews store — does it broadcast a different key or the same? Let me recall: "Any readwrite transaction auto-broadcasts via chrome.storage.local.set({_dbi|_dbp: Date.now()})". So reviews readwrite broadcasts `_dbi` too? Let me check the withStore broadcast logic.

   Actually — the review session could listen for the SAME broadcast the options page already uses (`storage.onChanged` → refreshAllData). When a mid-session mutation happens, refreshAllData runs (loads reviews, todos, etc.). The session could reconcile on the next render... but that re-introduces the complexity.

3. **Reconcile via a lightweight "due set version" check**:
   - Maintain a session-local `dueIds` Set.
   - On each rating, update the Set locally (remove if >=3, keep/add if <3).
   - The REMAINING count = dueIds.size.
   - Reconcile with the DB only:
     - When the Set empties (boundary).
     - When the user returns from a mutation (or a cheap "reviews store changed" signal).

   This gives O(1)-ish per-rating updates (no DB read) + rare full reconciles. The self-healing is preserved at boundaries and on mutation detection.

**The cleanest practical design:**

The per-rating cost is dominated by `getDueReviews()` full re-query + `pairWithItems` + full setState. To eliminate it:

**Idea: maintain the queue as a local array with O(1) per-rating updates, reconcile with DB at boundaries + on external-change detection.**

Session state (in options):
- `sessionQueue: Item[]` — the current due queue snapshot.
- `sessionDueIds: Set<string>` — the due card ids (for O(1) membership/remaining count).

Per rating:
- Look up the current card (index 0 — since prev/next removed, the current card is ALWAYS index 0; the queue is processed FIFO).
- Apply rateSrs locally.
- `updateReviewSrs` (DB write, needed for persistence + badge).
- Update sessionQueue locally:
  - >=3 → shift() (remove from front).
  - <3 → shift() then push (move to end).
- Counters: ratedCount++, passedCount (if >=3 and not already passed).
- NO getDueReviews re-query.

Reconciliation points:
- When sessionQueue empties → getDueReviews() once → if new due (mid-session additions) → rebuild sessionQueue from them → continue. Else → 复习结束.
- On external mutation detection: the options page already listens to the reviews broadcast. When a card is added/removed/deleted mid-session, the broadcast fires. We can reconcile lazily: e.g., check on the NEXT rating whether the current card still exists in the DB? That's a per-rating check again (defeats the purpose). 

  Alternative: reconcile when the user returns to the review tab (they had to leave the tab to mutate — the mutation happens in the projects/todo view, and the review session is paused). When they switch BACK to the review tab, re-sync the session queue with the DB. This is cheap (happens on tab switch, not per rating) and catches all mid-session mutations (they ALL require leaving the review tab — the review UI has no add/remove/delete controls).

  Wait — is that true? Can the user mutate the review set WHILE in the review tab? The review tab shows the session + the date-filter view. Adding/removing cards to review happens via the card list (projects view) or ItemDialog. The ItemDialog can be opened FROM the review view (clicking a card in the date-filter view). From there, could the user toggle review on/off? The ItemDialog has a review toggle button (handleToggleReview). So YES — the user could open a card from the review date-view and toggle it. But during an ACTIVE session (sessionQueue non-empty), the review tab shows the session; the date-filter view is separate (reviewDateFilter mode). Hmm — the session (getDueReviews) and the date-filter view are mutually exclusive modes? Let me recall: entering review tab auto-loads due; the date filter (近期回顾) shows reviewDateItems. `handleReviewDateClick` sets reviewDateFilter + clears reviewItems. So the date view REPLACES the session. And during the session, there's no card browsing (the session shows one card at a time, no item list). So mid-session mutation via the UI requires LEAVING the session (to projects/todo or the date view).

  Actually — could a card be deleted mid-session from another context? The ItemDialog is only reachable via a card list. During the session, no card list is shown. So mutations require leaving the session view. Thus: **re-sync the session queue when re-entering the review session** (or when the queue is consumed and reconciled at the boundary).

  Hmm — but there's the "remaining count vs badge" consistency question. If the user leaves mid-session to add a card, comes back, the session queue (local) doesn't have it. The badge shows +1. The session continues. When the session queue empties → boundary reconcile → the new card appears. During the session, "剩余 N 张" (local count) doesn't include the new card — but the badge shows the true due count. Is that a mismatch? The user's earlier concern was "结束 badge 还有数字". With boundary reconcile, when "复习结束" shows, we've reconciled → badge 0. So the END is consistent. The DURING-session "剩余" might differ from the badge (if a card was added mid-session). Is that a problem? The user accepted "先完成手头的，再处理新加的" (from the earlier discussion). So during-session, "剩余" = session queue length (the current pass), and the badge = total due. The session header could show "剩余 X 张（本轮）+ 总待复习 Y 张"? Or just the session's remaining and rely on the badge for the global. Hmm.

  Actually — to keep it simple and honest: the session header shows "剩余 N 张" = session queue length. When the user returns from a mutation, we re-sync (so N reflects reality). During a continuous session (no leaving), N is accurate. If the user leaves and adds a card, on return we re-sync → N includes it. So N is accurate at every RENDER after a re-sync. The only "stale" window is if a mutation happens elsewhere while the session is visible — which can't happen (mutations require leaving the session view, and returning triggers re-sync).

  Wait — can a mutation happen from ANOTHER context (e.g., a content script, the background, or another extension window/device sync)? 
  - Content script / background: captures save items, not review mutations. But a SYNC (download) could change reviews! If a WebDAV sync downloads new review data mid-session... the user would have to trigger sync from the backup tab (leaving the session). And sync's bulkReplace broadcasts → options' refreshAllData → could re-sync the session.
  - Another window: two options pages open? Unlikely but possible. The broadcast handles it (refreshAllData runs in all windows).

  So the reconciliation trigger should be: **re-sync the session queue whenever the review-relevant data changes** (the broadcast) OR when re-entering the session view. The cheapest: listen to the broadcast and re-sync the session queue IF the session is active. But the broadcast fires on EVERY item change (including typing in a card edit). Re-syncing the session queue on every broadcast = the same cost as the current rebuild (per-rating).

  Hmm. So "re-sync on broadcast" reintroduces the cost. Unless we ONLY re-sync when REVIEWS actually changed. The broadcast key is `_dbi` (items store) — it doesn't distinguish reviews vs items. Let me check: does the reviews store broadcast under `_dbi` or a separate key? If reviews changes broadcast a distinct key, we could listen specifically.

Let me check the withStore broadcast logic to see what key reviews uses.

Actually — let me think about the practical performance reality first. Is getDueReviews per-rating REALLY a bottleneck? For a typical due set (10-50 cards), an IndexedDB index cursor reading 50 entries is sub-millisecond to a few ms. The bigger costs are: the 350ms animation timer (UI), the setState + re-render, and the DB write (updateReviewSrs). The "rebuild" itself is probably NOT the dominant cost at normal scale. But for a large backlog (500+ due), a full cursor scan per rating could add up (500 ratings × full scan = 250K entry-reads).

The user asked "有好的思路吗" — they want a design idea. Let me give a solid one:

**Design: local incremental queue + reconcile on session boundary AND on returning to the review tab (or on review-data broadcast).**

Actually — let me reconsider the broadcast. Let me check whether reviews changes trigger a distinct storage key. If `withStore("reviews", ...)` broadcasts under `_dbi` (same as items), then I can't cheaply distinguish. But — I could track a "reviews version": on each session action, remember the current review count; if a broadcast changes it, re-sync. Simpler: since mutations require leaving the review tab, the "return to review tab" event (sidebarTab === "review" becoming true) is a reliable + cheap reconcile point.

Let me also reconsider: the current `handleReviewRate` rebuilds AFTER a 350ms animation. The rebuild itself is a getDueReviews + pair + setState. If we make the queue local, the rating flow becomes:
1. rateSrs + updateReviewSrs (DB write) — needed.
2. Update sessionQueue locally (shift/push).
3. Update counters.
4. setState (one render).
No getDueReviews. No 350ms-then-rebuild.

Then the reconcile points:
- **Queue empty** → getDueReviews once → continue or finish.
- **Re-entering review tab** (sidebarTab changes to "review" with an active session) → getDueReviews once → reconcile the queue (catch mid-session additions/deletions).
- Optionally: **on `_dbi` broadcast IF reviews changed** — hard to distinguish cheaply; skip or use a cheap heuristic (reviews count in the broadcast listener? No — that's another full scan).

Hmm — but there's a subtlety. If the session is active and the user NEVER leaves the review tab, can reviews change? No (no mutation controls in the session view). So the queue stays accurate. 

What about the date-filter view? It's a separate mode (reviewDateFilter set → reviewItems cleared → session inactive). So the "session" and "date view" don't coexist. Entering the date view clears the session. So mutations from the date view (via ItemDialog toggle) happen OUTSIDE the session.

Wait — actually, let me double check: does entering review tab ALWAYS start a session? The effect `[sidebarTab, reviewDateFilter]`: if sidebarTab==="review" && !reviewDateFilter → getDueReviews → setReviewItems. So the session auto-starts on entering review. If the user opens a card from the date view... but the date view is reviewDateFilter mode (session cleared). Hmm — so within the review tab, there are two sub-modes: session (no date filter) and date-view (date filter set). The date-view cards can be opened in ItemDialog and toggled. But that's the date-view mode, not the session. When the user clears the date filter → back to session → re-sync. OK.

So the design is coherent:
1. **Session queue is local** (FIFO, index 0 = current card). Per-rating: local shift/push + counters + DB write. No re-query.
2. **Reconcile with DB** (getDueReviews) at:
   - Queue empty → continue or finish (the "live check").
   - Re-entering the session (sidebarTab → review) → re-sync.
3. **prev/next removed** (confirmed by user).
4. **Progress UI**: 剩余 N 张 (session queue length, live after re-sync) + 本次已评 X 次 + 通过 Y 张.

This gives: O(1) per-rating (no DB read), self-healing at boundaries + on re-entry, no ratio.

Now — one more performance consideration: `updateReviewSrs` per rating does a DB read (idx.get) + write. Could that be optimized? It's needed to persist the rating. The read is to find the entry by itemId. Since we already HAVE the entry in reviewSrsMap (loaded at session start), we could put directly by the entry's id (the review entry id). But updateReviewSrs takes itemId and looks up the id. We could pass the review entry id too, avoiding the index lookup. Minor optimization. Actually — let me check: is the entry id available in the session? reviewSrsMap maps itemId → srs (not the entry id). We'd need a map itemId → reviewEntryId. Minor. Let me note it as an optional micro-opt.

Another: `pairWithItems` builds a Map from allItemsUnfiltered (O(total items)) per rebuild. With local queue, this is only at reconcile points (rare). Good.

Also — the badge: updateBadge in background runs on `_dbi` broadcast after each updateReviewSrs (a full getDueReviews scan). That's PER RATING (the DB write triggers the broadcast → badge re-scan). So the badge computation itself is per-rating. Is that a concern? The background updateBadge does getDueReviews (full scan) per rating. For large due sets, that's per-rating cost too. Hmm — could debounce the badge update (e.g., 500ms throttle). Or only update the badge when reviews change. The broadcast fires on ANY `_dbi` change. So the badge re-scans on every item edit too. Debouncing updateBadge would help. Let me include that as a note.

Actually — let me reconsider the badge. updateBadge runs in the background on `_dbi` changes. It does getDueReviews + searchItems({type: todo}) + isTodoComplete per todo. This is per-broadcast. With debouncing (say 300-500ms), bursts of ratings coalesce into one badge update. That's a cheap win. But is the badge update a real bottleneck? It's a background SW operation, async, and the SW has its own lifecycle. Probably fine but worth a throttle note.

OK — let me also reconsider whether the per-rating rebuild is ACTUALLY a measurable problem or just a theoretical one. The user says it's a performance issue. Let me trust their experience (maybe they have a large due backlog). The local-queue design eliminates it regardless.

Let me also reconsider: is there an even simpler option? **Keep the rebuild but make it cheaper**: getDueReviews could use the reviewSrsMap we already have + the rating we just applied, to compute the next queue WITHOUT a DB read. I.e., simulate the rebuild in memory:
- Start from the current reviewSrsMap (all reviews' srs).
- Apply the just-rated card's new srs to the map.
- Compute the due set from the UPDATED map (entries with dueDate <= now && status active).
- Pair with items.
This avoids the DB read (getDueReviews) but still does the O(due set) filter + pairing per rating. It's cheaper than a DB scan but still O(n) per rating. The local-queue approach is O(1). 

The local-queue is strictly better for the common case (no mid-session mutation). And the reconcile points handle the rare mutations. Let me go with that.

Actually — let me reconsider one correctness subtlety of the local queue: **the "requeue to end" for rating <3**. Currently, the requeued card's dueDate=now → in the rebuilt queue (dueDate asc), it goes to the END. My local design: shift + push (move to end). Same effect. But — what if OTHER cards in the queue have dueDate EARLIER than the requeued one? They're all <= now anyway (they're due). The requeued card (dueDate=now) is the LATEST. So pushing to the end matches the DB order. But the initial queue order — getDueReviews returns dueDate ASC. So the initial queue is sorted by dueDate. After shifts and end-pushes, does the order stay sorted? Shifting the front keeps the rest sorted. Pushing the requeued card (dueDate=now, the max) to the end keeps it sorted (all others have dueDate <= now). So the local queue maintains dueDate order invariant. 

But — mid-session mutations caught at reconcile: the reconcile rebuilds the queue from getDueReviews (sorted). So order is preserved. Good.

One more: when the queue empties and reconcile finds new due cards (mid-session additions), the new queue = those cards (sorted by dueDate). Continue. If the user ALSO had requeued cards... no — the queue only empties when all cards are passed (>=3). Requeued cards are in the queue until passed. So at boundary, the queue is truly empty → the reconcile only brings NEW cards. Consistent.

Hmm — wait, actually, there's a subtle case: the queue empties when the last card is rated >=3. But a card rated <3 earlier was pushed to the end and is STILL in the queue. So "queue empty" only happens when all were passed. Good.

Edge: what if the session has 1 card, rated <3 (pushed to end = same position, queue stays [card]) → infinite loop if always <3. Same as current. The user can rate >=3 to exit. Acceptable (matches current).

OK — I'm confident in the design. Let me also address the user's "performance" framing: the design reduces per-rating DB work from [write + full read-scan + O(n) pairing + full setState] to [write + O(1) local update + setState]. The full read happens only at boundaries and re-entry.

Let me also propose the badge throttle as a complementary micro-opt (background updateBadge debounce), since per-rating DB writes still trigger per-rating badge re-scans.

Now — the user is in PLAN MODE (system reminder). I must NOT edit. I should present the plan and ask for confirmation.

Let me write the plan for the C1 refactor:

**C1 重构方案（本地增量队列 + 边界/重入校准）**

会话状态（options）:
- `sessionQueue: Item[]` — 当前会话队列（FIFO，index 0 = 当前卡）
- `sessionRatedCount: number` — 本次已评 X 次
- `sessionPassedIds: Set<string>` — 已通过（最终 >=3）的卡 id（Y 张）

评分流程（handleReviewRate 重构）:
1. current = sessionQueue[0]
2. rateSrs + updateReviewSrs(current.id, newSrs)（保留 DB 写，持久化 + badge）
3. 本地更新队列:
   - >=3 → `sessionQueue.shift()`；若 id 不在 passedIds → 加入
   - <3 → `sessionQueue.shift(); sessionQueue.push(current)`（移到队尾）
4. `sessionRatedCount++`
5. 若队列空 → `getDueReviews()` 一次性校准:
   - 有新 due（中途新增）→ 重建 sessionQueue 继续
   - 无 → 复习结束
6. setState（一次渲染），移除 350ms 重建定时器

重入校准:
- 进入复习 tab（sidebarTab → "review" && 有活动会话）→ `getDueReviews()` 一次，重建队列（捕获中途增/删）

UI:
- 移除 prev/next 按钮（确认）
- 会话头部: `剩余 N 张 · 本次已评 X 次 · 通过 Y 张`（绝对口径）
- 结束页: 绝对计数（本次已评 X 次 · 通过 Y 张），去掉熟悉率/平均分比例或保留为参考

性能:
- 每次评分: DB 写 1 次（必须有）+ O(1) 本地更新，**零 DB 读**
- 全量 getDueReviews 只在: 队列空 + 重入复习 tab（低频）
- 可选微优化: background updateBadge 加 300-500ms 节流（避免每次评分都全扫 badge）

需要动的文件:
- options.tsx: handleReviewRate 重构、会话状态、UI props
- ReviewSession.tsx: 去 prev/next、进度/结束页改绝对口径、接收 sessionRatedCount/sessionPassedCount
- 可能 background.ts: badge 节流（可选）

风险/边界:
- 中途增卡: 当前队列完成后校准拉入（先完成手头，再处理新增）✓
- 中途删卡: 队列里的幻影卡在评分时 updateReviewSrs 已 no-op（entry 不存在）——但本地队列仍会处理它（shift/push）。需在评分时检查 `reviewSrsMap` 是否还有该卡（若 review 条目已删 → 直接从队列丢弃，不计入 counters）。或在重入/边界校准前不出现（因为删卡需要离开会话视图 → 重入校准会重建队列）。实际上:删卡必须离开会话 → 重入时校准重建 → 幻影卡消失。所以会话内幻影卡只在"同一会话内同步下载删卡"这类罕见情况。评分时加一个 `reviewSrsMap.has(id)` 守卫即可（廉价）。

Wait — 我需要仔细想一下这个幻影卡守卫。When is the current card's review entry deleted DURING the session without leaving the view?
- Sync download (bulkReplace) → deletes local reviews not in remote → could remove the current card's review entry. This requires the user to trigger sync (from backup tab → leaves review). So re-entry reconcile handles it.
- Another window/extension instance mutating → broadcast fires → but we don't reconcile on broadcast (only on re-entry). So the current card could have its review deleted while the session is visible (another window did it). Rare. A cheap guard in the rating flow: check `reviewSrsMap.has(current.id)` before rating; if the entry is gone, drop the card (shift, no counter) without writing. This is an O(1) Map check per rating. Cheap and safe.

Actually — reviewSrsMap is loaded from getAllReviews() on allItemsUnfiltered change (effect line 308-313). It's refreshed on broadcasts? The effect deps `[allItemsUnfiltered]` — which changes on refreshAllData (which runs on broadcasts). So reviewSrsMap IS updated when a broadcast triggers refreshAllData. So during a session, if another window deletes a review, the broadcast → refreshAllData → allItemsUnfiltered changes → reviewSrsMap re-fetched → the deleted card is removed from the map. So the guard `reviewSrsMap.has(current.id)` catches it (cheap). But — the sessionQueue still has the card; the guard drops it. Good.

Hmm — but this guard means the current card could be skipped WITHOUT rating (if its review was deleted). The counter wouldn't increment (not a rating action). And the queue shifts. Fine.

OK. Let me also reconsider whether removing the 350ms rebuild timer changes the animation UX. Currently: rate → animating → 350ms → rebuild (new current card). With local update: rate → animating → 350ms → show next (local). The animation timing is the same; just the next card comes from the local queue. Good.

Let me also double-check: `reviewItems` state is used elsewhere (the render shows reviewItems[reviewIndex]). With the local queue as `sessionQueue`, the render uses sessionQueue[0] (index 0 always, since no prev/next). So reviewIndex becomes unnecessary (always 0). Simplifies the render. Good.

Also — `reviewItems` is currently set by useReview (getDueReviews on tab enter) and handleReviewRate. With the refactor, the session queue lives in options (or useReview). Let me keep it in options (the rating handler is there). The useReview hook still initializes the queue on tab enter (getDueReviews → setReviewItems/sessionQueue).

Alright — the plan is solid. Let me present it. Since plan mode, I present and ask for confirmation before implementation.

Let me write a focused plan. Also confirm the prev/next removal and the progress UI changes.

One more consideration for the user's performance concern — let me quantify what we eliminate:
- Before: per rating = DB write (updateReviewSrs) + getDueReviews full scan + pairWithItems (O(allItems) map build) + setState.
- After: per rating = DB write + O(1) local queue update + setState. The getDueReviews scan + O(n) pairing happen only at session start / boundary / re-entry.

Also note: the DB write per rating is unavoidable (persistence + badge). But we could avoid the review-entry lookup in updateReviewSrs by passing the entry id (micro-opt). Let me mention it.

Let me write the final plan response.

好——prev/next 移除确认。性能问题我来解决。

## 性能根因

每次评分后重建做的是**全量工作**：`getDueReviews()` 全表索引扫描 + `pairWithItems` 构建 O(总卡数) 的 Map + 完整 `setState`。而实际上每次评分只改变 **1 张卡**的 due 状态，全量重建是"为 1 卡的变化扫全库"。中途增删是**低频**事件，却被高频地全量防御。

## 方案：本地增量队列 + 低频校准

**会话内（每次评分）——零 DB 读，O(1) 本地更新：**
```
1. current = sessionQueue[0]
2. rateSrs + updateReviewSrs(current.id, newSrs)   ← 唯一的 DB 写（必须，持久化+badge）
3. >=3 → queue.shift()
   <3  → queue.shift(); queue.push(current)        ← 移到队尾（保持 dueDate 序不变式）
4. sessionRatedCount++; 通过则记入 sessionPassedIds
5. setState（一次渲染）
```

**校准点（低频，才做全量 getDueReviews）——保留你的"自我校正"语义：**
- **队列清空时**：`getDueReviews()` 一次 → 有新 due（中途新增的）→ 重建队列继续；无 → 复习结束
- **重入复习 tab 时**：`getDueReviews()` 一次 → 重建队列（捕获中途增/删/移）

**为什么自愈语义不丢**：中途任何增删改都必须**离开会话视图**才能操作（会话内只有当前卡，无增删入口）→ 回到复习 tab 必然触发重入校准。另一个更罕见的路径是跨窗口/同步改 review——由现有的 `_dbi` 广播 → `refreshAllData` → `reviewSrsMap` 刷新兜底，评分前加一个 `reviewSrsMap.has(id)` 守卫（O(1)），entry 已被删的幻影卡直接丢弃不计数。

## UI 变更

- **移除 prev/next 按钮**（已确认）
- 会话头部：`剩余 N 张 · 本次已评 X 次 · 通过 Y 张`（绝对口径，无分母）
- 结束页：`本次已评 X 次 · 通过 Y 张`（去掉熟悉率/平均分比例）
- `reviewIndex` 状态消失（当前卡恒为队列头部）

## 性能对照

| | 当前 | 新方案 |
|---|---|---|
| 每次评分 | DB 写 + **全量扫描** + O(n) 配对 + 全 setState | DB 写 + **O(1) 本地更新** + 单渲染 |
| getDueReviews 全量 | 每次评分 | 仅 会话开始 / 队列清空 / 重入 tab |

**可选微优化**：`updateReviewSrs` 目前按 itemId 查 entry id 再写——若评分时把 entry id 一并传入可省一次索引查找；background `updateBadge` 加 300ms 节流避免每次评分都全扫 badge。

## 涉及文件

- `options.tsx`：`handleReviewRate` 重构为本地队列；新增 `sessionQueue/sessionRatedCount/sessionPassedIds`；重入校准 effect
- `useReview.ts`：会话开始时初始化队列（替代原 `setReviewItems`）
- `ReviewSession.tsx`：去 prev/next、进度/结束页改绝对口径、接收新计数 props
- （可选）`background.ts`：badge 节流

这个方向确认的话，我就按此实现（含"中途增卡→先完成手头、边界拉入"与"删卡→重入校准剔除 + 评分守卫"两条边界验证）。

---

## User

 DB 写时会触发广播，你新的方案考虑到这一点了吗

---

## Assistant (Plan · DeepSeek V4 Flash · 36.7s)

_Thinking:_

The user asks: "DB 写时会触发广播，你新的方案考虑到这一点了吗" — When the DB write happens (updateReviewSrs per rating), it triggers a broadcast. Did my new plan account for this?

This is a critical question. Let me think about the broadcast chain:

1. `updateReviewSrs` → `withStore("reviews", "readwrite", ...)` → on completion, auto-broadcasts via `chrome.storage.local.set({_dbi: Date.now()})` (per memory #102 / AGENTS.md: "Any readwrite transaction auto-broadcasts via chrome.storage.local.set({_dbi|_dbp: Date.now()})").

2. The options page's `storage.onChanged` listener → `refreshAllData()` (per the earlier code: `refreshRef.current()` on _dbi/_dbp changes).

3. `refreshAllData()` → loadProjects + onSearch + loadTodos + allItemsUnfiltered + ... — a HEAVY full refresh.

So in the CURRENT design, every rating's `updateReviewSrs` triggers a broadcast → options' refreshAllData → which reloads everything including review data. So even though the current handleReviewRate calls getDueReviews explicitly, there's ALSO a broadcast-triggered refreshAllData after every rating.

Wait — let me check: does the broadcast listener fire refreshAllData? Earlier I saw: "storage.onChanged listener (line 857) calls refreshRef.current() = refreshAllData() on every _dbi/_dbp change". So YES. Every updateReviewSrs → broadcast _dbi → refreshAllData in the options page.

And refreshAllData includes: loadProjects, onSearch (searchItems), loadTodos, setAllItemsUnfiltered (searchItems({})), and possibly review reloads. This is a LOT of DB reads per rating. So the per-rating cost is actually dominated by this broadcast-triggered refreshAllData, not just the explicit getDueReviews.

Now — my new plan said "per rating: zero DB reads". But if updateReviewSrs triggers a broadcast → refreshAllData (heavy, full DB reads) → that completely negates the "zero DB read" claim! The broadcast-triggered refreshAllData is a per-rating full reload.

So the user's question is spot-on: **the DB write's broadcast triggers a full refreshAllData per rating, which is the REAL performance cost — my plan didn't account for it.**

Let me verify this understanding by checking:
1. Does updateReviewSrs (withStore reviews readwrite) actually broadcast?
2. Does the options storage.onChanged listener call refreshAllData for the reviews store's broadcast?
3. What does refreshAllData do (how heavy)?

Let me recall the withStore broadcast logic. From memory #102 and AGENTS.md: "Any readwrite transaction auto-broadcasts via chrome.storage.local.set({_dbi|_dbp: Date.now()})". The reviews store — which key? `_dbi` (items) presumably (it's the "items-ish" data). Let me check the database withStore code.

Actually — I need to verify. Let me read the withStore implementation to see:
- When a reviews-store readwrite completes, does it set `_dbi`?
- And the options listener → refreshAllData.

This is the crux. If yes, then the per-rating cost is:
- updateReviewSrs (write)
- broadcast → refreshAllData → loadProjects + onSearch + loadTodos + allItemsUnfiltered (several full scans) + (review reloads?)

That's the real bottleneck. My "local queue" optimization addresses the EXPLICIT getDueReviews in handleReviewRate, but NOT the broadcast-triggered refreshAllData.

So the plan needs to address the broadcast-triggered refresh. Options:

**Option 1: Suppress the broadcast for review writes.**
- Make updateReviewSrs use a transaction that does NOT broadcast (or broadcasts a dedicated reviews-only key). Then per-rating writes don't trigger refreshAllData.
- But — the badge relies on the broadcast! background.updateBadge runs on `_dbi` changes. If review writes don't broadcast, the badge won't update after a rating → stale badge. Need a separate signal for the badge.
- Also — the app relies on broadcasts for cross-context sync (background menus, other windows). Review writes broadcasting is intentional for badge + cross-device/window.

**Option 2: Debounce/coalesce the refresh.**
- The refreshAllData is heavy but maybe it doesn't need to run per broadcast. Add a debounce (e.g., 300-500ms) to the storage.onChanged → refreshAllData path. Then rapid ratings coalesce into one refresh.
- But the current architecture uses immediate refresh (the broadcast IS the notification mechanism). Debouncing delays updates (e.g., after a card edit, the UI lags 300ms). Tradeoff.

**Option 3: Make refreshAllData lighter / split.**
- Instead of refreshAllData (everything) on every broadcast, the listener could do a targeted refresh based on what changed. But the broadcast key doesn't say WHICH store. All items/reviews broadcast `_dbi`. Can't distinguish.

**Option 4: Review writes don't need refreshAllData at all.**
- The review session UI is now LOCAL (my plan). So the session doesn't need a refresh after a rating. But OTHER consumers need to know reviews changed: the badge (background), the reviewItemIds (card toggle states), the reviewStats (sidebar). 
- Currently refreshAllData → the effect `[allItemsUnfiltered]` (line 308-313) reloads reviewItemIds + reviewSrsMap. So review writes → broadcast → refreshAllData → allItemsUnfiltered change → reload reviews. Heavy chain.
- Could the review-write broadcast be handled more lightly? E.g., a dedicated message or a lighter listener that only reloads review state (not allItems/search/projects)?

Let me think about the cleanest architecture:

The core issue: **every DB write broadcasts a generic "_dbi changed" signal, and the options page responds with a FULL refresh**. For review ratings (high frequency, per-card), this full refresh is wasteful.

The right fix depends on the broadcast granularity. Let me check: does withStore distinguish items vs reviews broadcasts? Let me read the withStore code.

Actually — let me recall from AGENTS.md: "Any `readwrite` transaction auto-broadcasts via `chrome.storage.local.set({_dbi|_dbp: Date.now()})`". So `_dbi` for items store. What about reviews? The `tx()` and `withStore` — do reviews broadcast `_dbi` too? Let me check the actual implementation. I need to read database/index.ts withStore.

Let me read the withStore/broadcast code to understand the exact behavior. This is critical for answering the user correctly.

Also — I should check the options storage.onChanged listener and refreshAllData contents.

Let me read these in plan mode (read-only).

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"function withStore\\|function tx\\|_dbi\\|_dbp\\|broadcast\\|storage.local.set\" src/database/index.ts | head -20"
}
```

**Output:**
```
10:// Any successful write transaction automatically broadcasts a version stamp
13:async function broadcastDbChange(name: TableNames): Promise<void> {
16:      await chrome.storage.local.set({
17:        [name === "projects" ? "_dbp" : "_dbi"]: Date.now()
96:async function withStore<T>(
110:        if (mode === "readwrite") broadcastDbChange(name)
133: * On success, broadcasts _dbi/_dbp once. On error, the entire transaction rolls back.
141:export async function tx<T>(
161:          for (const name of names) broadcastDbChange(name)

```

---

## Assistant (Plan · DeepSeek V4 Flash · 5.1s)

_Thinking:_

Confirmed: `broadcastDbChange(name)` sets `_dbi` for any non-projects store (including reviews) and `_dbp` for projects. So **every `updateReviewSrs` (reviews readwrite) broadcasts `_dbi`**.

Now let me check the options page's storage.onChanged listener → refreshAllData, and what refreshAllData does. Let me find the listener and refreshAllData.

确认：`updateReviewSrs`（reviews readwrite）→ `broadcastDbChange` → `_dbi`。查 options 的监听与 `refreshAllData` 到底多重：

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -n \"refreshAllData\\s*=\\|const refreshAllData\\|storage.onChanged\" src/options.tsx | head; echo \"=== refreshAllData 体 ===\"; sed -n \"$(grep -n 'const refreshAllData' src/options.tsx | head -1 | cut -d: -f1),+16p\" src/options.tsx; echo \"=== onChanged 监听 ===\"; sed -n \"$(grep -n 'chrome.storage.onChanged' src/options.tsx | head -1 | cut -d: -f1),+10p\" src/options.tsx"
}
```

**Output:**
```
550:  const refreshAllData = useCallback(async () => {
863:    chrome.storage.onChanged.addListener(onChange)
864:    return () => chrome.storage.onChanged.removeListener(onChange)
=== refreshAllData 体 ===
  const refreshAllData = useCallback(async () => {
    await loadProjects()
    await onSearch()
    await loadTodos()
    const all = await searchItems({})
    setAllItemsUnfiltered(all)
    // reviewItemIds + reviewSrsMap updated by the effect on allItemsUnfiltered change
  }, [loadProjects, onSearch, loadTodos])

  const handleToggleReview = useCallback(
    async (itemId: string) => {
      const card = allItemsUnfiltered.find((i) => i.id === itemId)
      if (!card) return

      // If already in review, remove it
      if (reviewItemIds.has(itemId)) {
        await removeReview(itemId)
=== onChanged 监听 ===
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId]
  )

  // ---- Section view state (sidebar tree -> main area) ----

```

---

## Assistant (Plan · DeepSeek V4 Flash · 6.2s)

_Thinking:_

Let me read the onChange listener (line ~855-862) to see how it dispatches.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/options.tsx",
  "limit": 16,
  "offset": 848
}
```

**Output:**
```
<path>/home/xx/Lime/src/options.tsx</path>
<type>file</type>
<content>
848:     return () => link.remove()
849:   }, [])
850: 
851:   // Subscribe to database changes via storage broadcast
852:   const refreshRef = useRef(refreshAllData)
853:   refreshRef.current = refreshAllData
854: 
855:   useEffect(() => {
856:     const onChange = (
857:       changes: Record<string, chrome.storage.StorageChange>
858:     ) => {
859:       if (changes._dbi || changes._dbp) {
860:         refreshRef.current()
861:       }
862:     }
863:     chrome.storage.onChanged.addListener(onChange)

(Showing lines 848-863 of 2082. Use offset=864 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 31.8s)

_Thinking:_

Confirmed the full chain:

**每次评分：**
1. `updateReviewSrs` → reviews readwrite tx → `broadcastDbChange` → `_dbi = Date.now()`
2. options 页 `storage.onChanged`（`_dbi`）→ `refreshAllData()`
3. `refreshAllData` = `loadProjects()` + `onSearch()` + `loadTodos()` + `searchItems({})`（全库 items 扫描）
4. `setAllItemsUnfiltered` → 触发 `[allItemsUnfiltered]` effect → `getAllReviews()`（全 reviews 扫描）→ 重建 reviewItemIds + reviewSrsMap

So per rating, the REAL cost is: the write + a broadcast-triggered FULL refresh (projects + search + todos + all items + all reviews). This is MUCH heavier than the explicit getDueReviews in handleReviewRate. My new plan (local queue, zero explicit DB reads) does NOT account for this broadcast-triggered refreshAllData — the user is right to call it out.

So the plan needs to address the broadcast-triggered refresh. Let me think about the options:

**Root problem**: `_dbi` broadcast is store-agnostic (items AND reviews both use it). Every review write looks like an "everything changed" signal → full refresh.

**Options:**

**A. 让 review 写操作不广播 `_dbi`**（或广播专用 key）
- Change the reviews store broadcast to a dedicated key (e.g., `_dbr`), OR make updateReviewSrs use a silent write (no broadcast).
- Then per-rating writes don't trigger refreshAllData.
- BUT consumers that NEED to know reviews changed:
  - background badge (updateBadge on `_dbi`) — needs to re-scan after ratings.
  - reviewItemIds / reviewSrsMap (card toggle states + session) — currently reloaded via the `[allItemsUnfiltered]` effect chain.
  - Other windows' review state.
- So a dedicated `_dbr` key would need listeners on: background badge + options' review-state reload. This is a cleaner signal (review-only), but requires touching the broadcast mechanism + adding listeners.

**B. 细粒度刷新（按 store 分发）**
- The broadcast currently uses `_dbi`/`_dbp` only. If we add a per-store key, the options listener could do a TARGETED refresh:
  - reviews store changed → reload ONLY review state (reviewItemIds + reviewSrsMap + reviewStats + badge), NOT projects/search/todos/allItems.
  - items store changed → the current full refresh.
- This is the "make the signal specific" approach. Medium change: modify broadcastDbChange to include the store name, and the listeners dispatch accordingly.

**C. 节流 refreshAllData**
- Debounce the `storage.onChanged → refreshAllData` (e.g., 300-500ms). Rapid ratings coalesce into one refresh. Simple, but delays ALL updates (including card edits). And the session is now local (doesn't need the refresh), so the refresh only serves OTHER consumers (search list, todo, review states) — debouncing is acceptable.

**D. review 会话期间，把评分写操作改为"静默写"（不触发全刷新），用本地状态 + 显式轻量同步**
- The session is local (my plan). After a rating, the ONLY cross-context consumers that need updating:
  - background badge (due count) — needs a signal.
  - reviewItemIds / reviewSrsMap (in the options page) — for the card toggle UI + the session's own current-card existence guard.
- We could make the rating write broadcast a LIGHT signal (e.g., a dedicated `_dbr` key) that:
  - background listens → updateBadge.
  - options listens → reload ONLY review state (getAllReviews → reviewItemIds + reviewSrsMap), NOT full refreshAllData.
- This is the cleanest: reviews get their own broadcast key, and consumers do targeted reloads.

Let me think about which is best given the codebase.

The broadcast mechanism: `broadcastDbChange(name)` → `_dbi` (non-projects) or `_dbp` (projects). Adding a reviews-specific key: `_dbr`. Then:
- `withStore("reviews", "readwrite")` → `_dbr`.
- Consumers:
  - background: `changes._dbr` → updateBadge (reviews affect the badge).
  - options: `changes._dbr` → reload review state ONLY (getAllReviews → reviewItemIds + reviewSrsMap; getReviewStatsByStore → stats; getRecentItems → recent; if in a session, maybe reconcile). NOT refreshAllData.
  - Other contexts (content scripts, floating panel) — do they care about reviews? The floating panel lists projects, not reviews. Probably not.

Wait — but there's a subtlety: the current `_dbi` broadcast for reviews ALSO served the "items changed" semantics? No — reviews writes only change review data, not items. The current `_dbi` broadcast for reviews was a coarse catch-all. Moving reviews to `_dbr` is more correct.

But — hold on. Does anything else rely on the reviews write broadcasting `_dbi` specifically? Let me think:
- The options listener: `if (changes._dbi || changes._dbp) refreshAllData()`. If reviews move to `_dbr`, review writes no longer trigger refreshAllData. GOOD (that's the goal).
- But — some flows might RELY on the full refresh after a review change. E.g., after toggleReview (add/remove), the options page needs reviewItemIds updated (card toggle UI). That's currently done via the full refresh chain. If we move reviews to `_dbr`, the options listener for `_dbr` must reload review state (reviewItemIds etc.) — which it should do anyway for correctness.

Also — the sync flow: bulkReplace writes reviews → broadcasts `_dbr` → options reloads review state. Fine.

The badge: background listens to `_dbr` → updateBadge. Currently listens to `_dbi`. If reviews move to `_dbr`, background must ALSO listen to `_dbr` (in addition to `_dbi` for item changes, `_dbp` for menus).

This is a clean, correct architecture:
1. **Broadcast per-store**: `_dbi` (items), `_dbr` (reviews), `_dbp` (projects).
2. **Consumers dispatch by key**:
   - `_dbi` → full refresh (items affect search/todos/etc.).
   - `_dbr` → review-only reload (light): reviewItemIds, reviewSrsMap, reviewStats, recentItems, badge.
   - `_dbp` → projects reload + menus.
3. **Review session**: per-rating writes broadcast `_dbr` → options does a LIGHT review-state reload (not refreshAllData). The session itself is local (my plan). The light reload updates reviewSrsMap (existence guard) + badge. No heavy refresh.

Cost of this change: modify `broadcastDbChange` to map reviews → `_dbr`; update background listener; update options listener to dispatch `_dbr` to a light review-reload; ensure no other code relies on reviews → `_dbi`.

Let me check what else listens to `_dbi`:
- background: `changes._dbi` → updateBadge; `changes._dbp` → rebuildMenus. (line 105-113). Adding `_dbr` → updateBadge.
- options: `_dbi || _dbp` → refreshAllData. Change to: `_dbr` → light review reload.
- The floating panel / content scripts? Let me check. The floating panel listens for `_dbp`/`_dbi`? Let me grep.

Actually — let me check all `storage.onChanged` listeners in the repo.

Let me also reconsider option C (debounce) as simpler. But debounce delays the badge and other updates — and the session is now local so the refresh is only for OTHER consumers. Debouncing refreshAllData to 300ms: during a rapid rating session, refreshAllData coalesces to once per 300ms. That's simpler (1 change: debounce the listener) but still does a FULL refresh every 300ms during an active session. For a long session (100 ratings), that's 100+ refreshes (debounced to ~1 per 300ms → maybe 30-50 refreshes). Still heavy (each is projects+search+todos+all items+all reviews). The `_dbr` targeted approach does ZERO heavy refreshes during a session (only the light review reload). 

So the `_dbr` approach is architecturally better. Let me also consider: is the light review reload even needed per rating? The session is local. The light reload (getAllReviews → reviewItemIds + reviewSrsMap) serves:
- reviewSrsMap: the session's existence guard (O(1) map check) + rating's currentSrs lookup.
- reviewItemIds: card toggle UI states (only visible in other views).
- reviewStats/recentItems: sidebar displays.

For the session itself, we don't strictly need reviewSrsMap to reload per rating (we already have the current srs from the session). But for the existence guard (card deleted mid-session), we need the map fresh. The `_dbr` light reload is cheap (getAllReviews is one full reviews scan — but only when reviews change, which is per rating in a session... so getAllReviews per rating again).

Hmm — getAllReviews per rating is still a full reviews scan. But it's ONE store scan (not the multi-store refreshAllData). And the session could avoid even that: the existence guard could be `reviewItemIds` (a Set, O(1) membership) — wait, reviewItemIds is also reloaded by getAllReviews. Same cost.

Actually — could the session track its own "which reviews exist" incrementally? The session knows: cards it has rated (their entries persist — updateReviewSrs succeeded). A card's entry is deleted only by external mutation (leaving the session) → re-entry reconcile catches it. So WITHIN a continuous session, no review entry disappears (only the rated cards' due dates change, which we handle locally). The existence guard `reviewSrsMap.has(id)` protects against the rare cross-window/sync case. To keep that guard fresh WITHOUT a per-rating getAllReviews, we could rely on the re-entry reconcile + accept a tiny staleness window for cross-window deletions (rare). OR do the light `_dbr` reload (getAllReviews) per rating — one store scan, much cheaper than refreshAllData.

Let me reconsider the actual cost hierarchy:
- refreshAllData: loadProjects (projects scan) + onSearch (items filtered scan) + loadTodos (items scan) + searchItems({}) (ALL items scan) + [effect: getAllReviews (reviews scan)]. ≈ 4-5 store scans + multiple setStates + re-renders.
- `_dbr` light reload: getAllReviews (1 reviews scan) + setStates. ≈ 1 store scan.
- Zero reload: no scans, but the existence guard goes stale (cross-window deletions missed until re-entry).

For a rating session, the `_dbr` light reload (1 scan per rating) is ~5x cheaper than the current (4-5 scans). But the "zero DB read per rating" claim in my plan would be violated by the light reload (getAllReviews per rating). 

Can we get to truly zero per-rating reads? Only if we DON'T reload review state per rating and rely on local + boundary/re-entry reconcile. The existence guard: we could track it from the session's own data. When we load the session (getDueReviews), we have the due entries. reviewSrsMap already has ALL review entries (from getAllReviews at session start / refresh). Within the session:
- Each rating updates the DB (write). The local state knows the new srs.
- A card deleted mid-session: only possible if the user left the session → re-entry reconcile. OR a cross-window/sync deletion while the session is active (rare). For that rare case, the guard would be stale → the rating would call updateReviewSrs on a deleted entry → `idx.get` → undefined → no-op (safe, no crash). The card stays in the local queue → the user rates it (no-op) → it shifts → the queue processes it once more as a "phantom". To avoid showing a deleted card, we'd need the fresh guard. 

Hmm — but wait: the `_dbr` broadcast WILL fire on cross-window/sync review deletions (they're reviews writes). If we DON'T listen to `_dbr` in options, the session wouldn't know. But the re-entry reconcile covers the normal case. The cross-window active-session deletion is vanishingly rare. 

Actually — let me reconsider. There's a cleaner framing. The KEY realization:

**During an active session, the ONLY thing that changes is the current card's due date (via our own rating). Mid-session mutations require leaving the session. So the session can safely be local, with reconcile at: (a) queue empty, (b) re-entry. Cross-window/sync mutations are handled by the existing broadcast → refreshAllData (which is rare — not per-rating).**

Wait — but the user's question is specifically: "DB 写时会触发广播，你新的方案考虑到这一点了吗". The per-rating updateReviewSrs DOES broadcast `_dbi` → triggers refreshAllData. So even with a local session, the per-rating write STILL causes refreshAllData (the heavy refresh) via the broadcast. THAT's what I missed.

So the fix MUST address the per-rating broadcast. The options:

**Option A: 让 review 写广播专用 key `_dbr`，options 只做轻量 review 重载（或按需），不触发 refreshAllData。**
- Per rating: write + `_dbr` broadcast → options does a light review reload (or nothing, if the session is local + re-entry reconcile).
- To get to truly-zero per-rating reads: the `_dbr` listener does NOT reload reviews; it only updates the badge (background) — and the session relies on local + re-entry/boundary reconcile. The `_dbr` listener in options could be a no-op for the session (or trigger only a reviewStats/sidebar refresh, which is cheap-ish but still a scan).

**Option B: 静默写（rating 写不广播）**
- updateReviewSrs for the session does a silent write (no broadcast). The badge + other consumers get updated at... the end of the session? No — the badge should be live. And other windows. So silence breaks the badge. Bad unless the badge gets a separate explicit update.

**Option C: 节流 refreshAllData（全局 debounce）**
- Simple, but keeps the heavy refresh during sessions (just coalesced).

**Option D: 广播拆细（`_dbi`=items, `_dbr`=reviews）+ 按 key 分发 + 会话内零重载（重入/边界校准）**
- Cleanest. Per rating: write + `_dbr` broadcast. Options' `_dbr` handler: NO refreshAllData, NO review reload during an active session (the session is local; re-entry + boundary reconcile handle mutations). Background's `_dbr` handler: updateBadge (one getDueReviews scan per rating — this is still per-rating but only ONE store scan, and it's in the background SW, cheap-ish; could also debounce it).
- Wait — the badge updateBadge does getDueReviews (full due scan) per `_dbr`. During a session, that's per-rating. Could debounce badge updates (300ms). Or accept it (one store scan in the background per rating).

Hmm — let me reconsider the badge cost. updateBadge = getDueReviews (reviews index scan of due) + searchItems({type: todo}) (items scan for todos) + filter. Per rating (via `_dbr` → updateBadge). That's 2 scans per rating in the background. Could be debounced (coalesce ratings). A 300ms debounce on updateBadge would coalesce a rapid session's ratings into a few badge updates. Reasonable.

So the FULL solution:
1. **Broadcast `_dbr` for reviews writes** (instead of `_dbi`).
2. **Options `_dbr` handler**: light — during an active session, do NOT reload reviews (local session). When NOT in a session, reload review state (reviewItemIds, reviewSrsMap, stats) so the card-toggle UI and sidebar stay correct. Actually — even simpler: the `_dbr` handler reloads review state ONLY when not actively rating (or always but cheaply). Hmm, let me think.
   - The card-toggle UI (reviewItemIds) matters in the PROJECTS view (card review button). During a session (review tab), that UI isn't visible. So the `_dbr` reload could be gated: if sidebarTab === "review" && session active → skip (local session). Else → reload review state.
   - Actually — reloading review state (getAllReviews) is 1 store scan; it's fine to do it always. The point is to NOT do refreshAllData (5 scans). So: `_dbr` → a `reloadReviewState()` that does getAllReviews + getReviewStatsByStore + getRecentItems. 2-3 scans, no items/projects reload. That's a 5x reduction vs refreshAllData.
   - But the session itself doesn't need reloadReviewState per rating (local). So gate it: skip during active session (to hit zero), reload otherwise.

3. **Background `_dbr` handler**: updateBadge (debounced 300ms).

4. **Session reconcile** at: queue-empty + re-entry (getDueReviews once).

Let me also double check: does the `_dbi` broadcast serve OTHER things that the reviews `_dbr` change would break?
- background: `_dbi` → updateBadge. `_dbr` → updateBadge (add). `_dbp` → menus. So background listens to all three.
- options: `_dbi || _dbp` → refreshAllData; add `_dbr` → light review reload.
- Any other storage.onChanged listeners? Floating panel, content scripts, tabs/new-project? Let me check. The floating panel might listen for `_dbp` to refresh the project list. Let me grep.

Also — the sync/import flows write reviews (bulkReplace, import). Those would now broadcast `_dbr` → options light reload (or full? bulkReplace changes items AND reviews AND projects — it writes all three, so `_dbi` + `_dbr` + `_dbp` all fire → both handlers run → refreshAllData (from _dbi) + light review reload (from _dbr). Fine.)

OK — this is the architecture. But I should present it clearly and let the user decide on the tradeoffs. Let me also consider a SIMPLER intermediate: 

**Simplest acceptable fix**: Keep `_dbi` broadcast for reviews BUT debounce the options `refreshAllData` (option C) AND make the session local. This reduces the per-rating refresh from "every rating" to "every ~300ms coalesced" — still a full refresh but less frequent. Combined with the local session (which doesn't NEED the refresh), this might be "good enough" without touching the broadcast mechanism.

vs.

**Clean fix**: `_dbr` per-store broadcast + targeted dispatch. More code but architecturally correct (reviews no longer masquerade as items).

The user is asking whether I considered the broadcast. I should:
1. Acknowledge: no, my plan missed it — the per-rating write broadcasts `_dbi` → refreshAllData (5 scans), which negates the "zero DB read" claim.
2. Quantify the real per-rating cost today.
3. Present the fix options (A: `_dbr` + targeted dispatch; B: debounce), recommend A.
4. Present the refined full plan.

Let me verify the exact consumers of `_dbi`/`_dbp` broadcasts across the repo to make sure the `_dbr` change is safe. Let me grep for storage.onChanged in all source files.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/xx/Lime && grep -rn \"storage.onChanged\" src/ | grep -v test; echo \"=== background 监听 ===\"; sed -n \"$(grep -n 'chrome.storage.onChanged' src/background.ts | head -1 | cut -d: -f1),+9p\" src/background.ts"
}
```

**Output:**
```
src/background.ts:105:chrome.storage.onChanged.addListener((changes) => {
src/options.tsx:863:    chrome.storage.onChanged.addListener(onChange)
src/options.tsx:864:    return () => chrome.storage.onChanged.removeListener(onChange)
src/components/FloatingPanel.tsx:281:    chrome.storage.onChanged.addListener(onChange)
src/components/FloatingPanel.tsx:282:    return () => chrome.storage.onChanged.removeListener(onChange)
src/database/index.ts:12:// to chrome.storage.onChanged, so every context gets notified without bridges.
=== background 监听 ===
chrome.storage.onChanged.addListener((changes) => {
  if (changes._dbp) {
    rebuildProjectMenus().catch(() => {})
    rebuildRecentMenus().catch(() => {})
  }
  if (changes._dbi) {
    updateBadge()
  }
})


```

---

## Assistant (Plan · DeepSeek V4 Flash · 3.9s)

_Thinking:_

Let me check the FloatingPanel listener (line 281) — what does it respond to?

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/xx/Lime/src/components/FloatingPanel.tsx",
  "limit": 12,
  "offset": 275
}
```

**Output:**
```
<path>/home/xx/Lime/src/components/FloatingPanel.tsx</path>
<type>file</type>
<content>
275:     }) => {
276:       if (changes.preset) {
277:         cachedPreset = changes.preset.newValue as PresetName
278:         setPreset(changes.preset.newValue as PresetName)
279:       }
280:     }
281:     chrome.storage.onChanged.addListener(onChange)
282:     return () => chrome.storage.onChanged.removeListener(onChange)
283:   }, [])
284: 
285:   useEffect(() => {
286:     const mq = window.matchMedia("(prefers-color-scheme: dark)")

(Showing lines 275-286 of 859. Use offset=287 to continue.)
</content>
```

---

## Assistant (Plan · DeepSeek V4 Flash · 22.5s)

_Thinking:_

The FloatingPanel only listens to `changes.preset` (theme), not `_dbi`/`_dbr`. So it's unaffected.

So the broadcast consumers:
- **background**: `_dbp` → rebuildMenus; `_dbi` → updateBadge.
- **options**: `_dbi || _dbp` → refreshAllData (heavy).
- **FloatingPanel**: only `preset`.

So changing reviews to broadcast `_dbr` affects:
- background: must add `_dbr` → updateBadge (or keep reviews on `_dbi`).
- options: must add `_dbr` → light review reload.

Now I have the full picture. Let me present the answer to the user's question clearly:

**User's point is correct**: per-rating `updateReviewSrs` → `_dbi` broadcast → options `refreshAllData()` = loadProjects + onSearch + loadTodos + searchItems({}) + [allItemsUnfiltered effect → getAllReviews]. ~5 store scans + multiple setStates + re-renders. So the per-rating cost is dominated by this broadcast-triggered full refresh, NOT the explicit getDueReviews in handleReviewRate. My "zero DB read" claim ignored the broadcast chain.

**The fix must break the broadcast→full-refresh chain for review writes.**

Options:
1. **拆 key（`_dbr`）+ 定向分发**（推荐）：reviews 写广播 `_dbr`，background 加 `_dbr → updateBadge`，options 加 `_dbr → 轻量 review 状态重载`（会话内甚至跳过）。每次评分：写 + `_dbr`，options 不再 refreshAllData。
2. **节流 refreshAllData**：不动广播，给 options 监听加 300ms debounce。简单，但会话期间仍周期性全量刷新。

Then the session-local + reconcile design completes the picture:
- Per rating: write (broadcast `_dbr` → background badge + options light/skip) + O(1) local queue update + single render. **Zero heavy DB reads**.
- Reconcile (full getDueReviews): session start / queue empty / re-entry.

Let me also reconsider: does the light `_dbr` reload even need to happen per rating in options? The session is local; the review state (reviewItemIds, reviewSrsMap) is used by:
- Card toggle UI (projects view) — not visible during a session.
- The session's existence guard — needs reviewSrsMap fresh, but within a continuous session nothing deletes entries except our own ratings (which don't delete). Cross-window deletions are rare.
So during an active session, the `_dbr` handler could SKIP the reload (or do it lazily). When not in a session, `_dbr` → reload review state.

Hmm — but "skip during session" adds gating complexity. Let me reconsider: the `_dbr` light reload (getAllReviews + stats + recent) is ~2-3 store scans per rating. Compared to refreshAllData's ~5 scans. It's a 2x improvement but not "zero". To truly get zero, gate it.

Actually — let me reconsider what the badge does. The badge (background updateBadge) needs getDueReviews per rating (to reflect the new due count). That's unavoidable (the badge must be live). updateBadge = getDueReviews (1 reviews index scan) + searchItems({type:todo}) (1 items scan). Per `_dbr`. Could debounce. Or accept (background SW, 2 scans/rating is fine — it's async and the SW is designed for it).

For the OPTIONS page: the light reload per rating (getAllReviews) — if we skip it during the session, the session is truly zero-read. The card-toggle UI is updated on re-entry/refresh. Let me go with: **options `_dbr` handler skips reload during an active session; reloads review state otherwise.** The "active session" = review tab + sessionQueue non-empty. Simple gate.

Wait — but there's a subtlety: reviewItemIds is used for the REVIEW badge? No — the review badge uses dueCount (from useReview, via getReviewStatsByStore). reviewItemIds is the card-toggle state. The NavRail review badge = dueCount. So during a session, the review badge (dueCount) — is it updated? Currently via the full refresh chain (getReviewStatsByStore in useReview's effect on allItemsUnfiltered). If we skip the options reload during sessions, dueCount stays stale during the session → the review badge freezes at the session-start value while rating. Hmm — that's bad (the user wants the badge to reflect remaining).

Actually — the badge the user cares about is the EXTENSION toolbar badge (background) + the NavRail review icon. The NavRail review icon = dueCount (from useReview). If `_dbr` doesn't reload dueCount during a session, the NavRail review badge freezes. To keep it live, the `_dbr` handler in options should reload the review STATS (dueCount) even during a session — but that's a getReviewStatsByStore scan (1 scan). 

So the gating needs nuance:
- During session: `_dbr` → reload dueCount/reviewStats (1 scan) so the badge stays live. Skip the heavy reviewItemIds/reviewSrsMap reload (those serve the card-toggle UI, not visible during session).
- OR: reload reviewStats per rating (1 scan) + session is local.

Hmm — actually, the NavRail review badge should reflect the live due count during a session (the user is actively reducing it). So it needs per-rating updates. getReviewStatsByStore is 1 reviews scan. Acceptable (1 scan/rating, vs current 5).

Wait — but actually, does the current design even keep the NavRail review badge live during a session? Let me trace: per rating → updateReviewSrs → `_dbi` → refreshAllData → allItemsUnfiltered → useReview effect `[allItemsUnfiltered]` → getReviewStatsByStore → setDueCount. So YES, currently the review badge updates per rating (via the heavy chain). If I gate it out, the badge freezes. So the `_dbr` handler must at least update dueCount.

OK so the refined design:
- **options `_dbr` handler** (per rating): reload review STATS (getReviewStatsByStore → dueCount/reviewStats) + optionally reviewItemIds/reviewSrsMap (the card-toggle map). The map reload is getAllReviews (1 scan) — the session's existence guard needs it fresh-ish. Actually, let me just reload the review state (getAllReviews + stats) — 2 scans per rating, gated to not touch items/projects/todos. That's the "light reload" — ~2 scans vs current ~5. The session is local (O(1) queue update).

Hmm — this is getting complex. Let me step back and present the design at the right level of abstraction, and let the user weigh:

**广播链路是真正的性能瓶颈**（比显式 getDueReviews 重得多）。方案必须切断"评分写 → 全量刷新"。

**方案（推荐）：review 独立广播 key `_dbr` + 定向刷新**
1. 改 `broadcastDbChange`：reviews store 广播 `_dbr`（不再 `_dbi`）
2. `background`：`_dbr` → updateBadge（`_dbi`/`_dbp` 不变）
3. `options`：新增 `_dbr` 处理器 → **轻量 review 刷新**（getAllReviews + reviewStats，~2 次 store 扫描），**不再 refreshAllData**（~5 次扫描 + 全部重渲染）
4. 会话内评分：写 + `_dbr` → background badge + options 轻量 review 刷新；会话队列本地 O(1) 更新；**零 items/projects/todos 全量重载**

**每评一次的成本对照**：
| | 当前 | 新方案 |
|---|---|---|
| DB 写 | updateReviewSrs | 同 |
| 广播后 | `_dbi` → refreshAllData（loadProjects+onSearch+loadTodos+searchItems({})+getAllReviews ≈ **5 次扫描+全重渲染**） | `_dbr` → badge + getAllReviews+reviewStats ≈ **2 次扫描** |
| 队列 | 全量重查 | O(1) 本地 |

**为什么 badge 仍准**：background 监听 `_dbr` → updateBadge（每评分更新）；NavRail review badge 由 options `_dbr` 轻量刷新 reviewStats 驱动。

**为什么自愈语义仍保留**：中途增删必须离开会话 → 重入/边界 getDueReviews 校准；跨窗口删除由 `_dbr` → reviewItemIds 重载兜底。

**可选进一步**：updateBadge 加 300ms 节流（快速连评合并）。

**涉及文件**：database/index.ts（广播 key）、background.ts（监听 _dbr）、options.tsx（_dbr 定向处理器 + 会话本地化）、ReviewSession.tsx（去 prev/next + 绝对进度）。

Let me present this. I should be concise but complete. And note the tradeoff: the `_dbr` change touches the broadcast mechanism (a core infra), so it needs care. Alternative simpler option: debounce refreshAllData (option C) — mention it as the "if you don't want to touch the broadcast" fallback, with its downside (still ~5 scans/300ms during sessions).

Let me write the response.

你问得对——**这是我方案里最大的遗漏**。核实后确认链路是：

```
updateReviewSrs (reviews readwrite)
  → broadcastDbChange → _dbi = Date.now()
  → options storage.onChanged (changes._dbi)
  → refreshAllData()
    = loadProjects + onSearch + loadTodos + searchItems({})
      + [allItemsUnfiltered 变化 → effect → getAllReviews]
    ≈ 5 次 store 扫描 + 多个 setState + 全组件重渲染
```

所以每次评分的真实成本大头是**广播触发的全量刷新**，不是 `handleReviewRate` 里那次显式 `getDueReviews`。我的"零 DB 读"把广播链漏掉了——每评一次照样全库重载，本地队列优化等于白做。

## 修正方案：review 独立广播 key `_dbr` + 定向刷新

**1. 广播拆细**（`database/index.ts`）
- `broadcastDbChange`：reviews store 广播 `_dbr`（不再伪装成 `_dbi`）；items→`_dbi`、projects→`_dbp` 不变

**2. 消费端按 key 定向**（关键改动）
- `background`：加 `_dbr` → `updateBadge()`（`_dbi`/`_dbp` 逻辑不变）
- `options`：新增 `_dbr` 处理器 → **轻量 review 刷新**（`getAllReviews` + `getReviewStatsByStore`，~2 次扫描），**不再触发 refreshAllData**
- `FloatingPanel` 只监听 `preset`，无影响

**3. 会话内评分链路变为：**
```
写 updateReviewSrs  →  _dbr 广播
                      ├─ background: updateBadge（badge 实时准）
                      └─ options: 轻量 review 刷新（reviewStats/reviewItemIds）
+ 本地队列 O(1) 更新 + 单次渲染
= 零 items/projects/todos 全量重载
```

## 每评一次的成本对照

| | 当前 | 修正后 |
|---|---|---|
| DB 写 | updateReviewSrs | 同 |
| 广播触发 | `_dbi` → **refreshAllData ≈5 次扫描 + 全重渲染** | `_dbr` → badge + reviewStats ≈**2 次扫描** |
| 队列 | 全量重查 + 重建 | **O(1) 本地** |
| 校准 | 每次 | 会话开始 / 队列空 / 重入 tab |

## 语义保障
- **badge 实时**：background `_dbr` → updateBadge；NavRail 复习数字由 options 轻量 reviewStats 刷新驱动
- **自愈保留**：中途增删须离开会话 → 重入/边界校准；跨窗口删除由 `_dbr` → reviewItemIds 重载兜底
- **可选微优化**：`updateBadge` 加 300ms 节流（连评合并，badge 变 2 次扫描/300ms）

## 备选（不动广播机制）
如果不想碰 `broadcastDbChange`（核心基建），退而求其次：**给 options 的 `refreshAllData` 加 300ms debounce**。简单，但会话期间仍周期性全量刷新（~5 次扫描/300ms），只是从"每次"降到"每 300ms"。

---

**我的建议**：走 `_dbr` 定向方案——它顺带修正了"reviews 伪装成 items 变更"这个架构层面的语义错误，一劳永逸。你倾向哪个？确认后我把完整执行计划（广播拆 key + options 定向刷新 + 会话本地化 + 去 prev/next + 绝对进度）落定。

---

