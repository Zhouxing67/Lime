# 复习队列竞态条件分析报告

## 背景

Lime 的复习系统使用 SM-2 间隔重复算法。用户在复习会话中逐张评分卡片，系统根据评分调整下次复习时间（dueDate），并实时维护当前会话的复习队列。

## 问题现象

### Bug 1 — 状态矛盾

复习最后一张卡片评分后，session 显示"复习完成"，但浏览器 badge 仍然显示数字。退出再进入复习 tab，才正确显示剩余卡片。

### Bug 2 — 统计数字错位

完成页面显示：

```
0% 准确率
0 复习卡片
3 已掌握
熟悉率 3/0 · 平均评分 4.0
```

复习卡片数为 0，准确率为 0%，但"已掌握"和"平均评分"正确。

## 架构根源：Storage-based Cross-Context Broadcast

Chrome 扩展有三个隔离上下文：**Service Worker（背景页）**、**Options Page（设置页）**、**Content Script（内容脚本）**。它们无法直接共享内存或互相调用 DOM API。Lime 使用 `chrome.storage` 作为跨上下文通信总线：

```
数据写入
  -> withStore / tx 事务提交
    -> tx.oncomplete 回调
      -> broadcastDbChange(name)
        -> chrome.storage.local.set({ _dbi / _dbp: Date.now() })
          -> chrome.storage.onChanged 事件
            -> 所有上下文各自响应
```

所有 `readwrite` 事务都在提交后广播变更。广播 key 取决于 store 名称：`projects` 以外的所有 store（`items`、`reviews`）使用 `_dbi`。

各上下文监听的 key 及响应：

| 上下文         | 监听 key         | 响应                                              |
| -------------- | ---------------- | ------------------------------------------------- |
| background SW  | `_dbi`           | `updateBadge()` — 刷新 badge 数字                 |
|                | `_dbp`           | 重建右键菜单                                      |
| options page   | `_dbi` 或 `_dbp` | `refreshAllData()` — 重查 DB 刷新全部 React state |
| floating panel | `_dbp`           | 刷新项目列表                                      |

这种模式可以称作 **Storage-based Cross-Context Broadcast**。它不是某种标准库或框架，而是 Chrome 扩展生态中利用 `chrome.storage.onChanged` 自然形成的跨上下文同步模式。后端通常不会这样实现（后端用消息队列或数据库 LISTEN/NOTIFY），但在 Chrome 扩展中这是最简洁的方案。

## 根因分析

### 手动维护的队列 vs DB 真实源

复习队列（`reviewItems`）的维护采用了**双源架构**：

1. **进入复习 tab 时**：从 DB 读取待复习卡片 -> `setReviewItems(items)`
2. **每次评分后**：写 DB（`updateReviewSrs`）+ 350ms 后手动裁切 `reviewItems`

问题在于评分写 DB 触发了广播：

```
updateReviewSrs
  -> broadcastDbChange("reviews")
    -> chrome.storage.local.set({_dbi: now})
      -> options page onChanged
        -> refreshAllData()
          -> setAllItemsUnfiltered(all)   数组引用改变
            -> React 重渲染
              -> auto-load 重触发
                -> getDueReviews() 返回更新后结果
                  -> setReviewItems(newItems)
```

`reviewItems` 在 350ms 窗口期内被覆盖，setTimeout 的闭包用旧数据执行裁切，操作了错误的索引。

### 具体时序

以 `reviewItems = [A, B, C]`，评分 A ≥ 3 为例：

```
handleReviewRate
  |-- 1. await updateReviewSrs(A)    写 DB，A 的 dueDate -> 未来
  |      `-- broadcastDbChange("reviews")
  |            `-- chrome.storage.local.set({_dbi: now})
  |                  `-- options page onChanged
  |                        `-- refreshAllData()
  |                              `-- setAllItemsUnfiltered(all)
  |                                    `-- React 重渲染
  |                                          `-- auto-load 重触发
  |                                                `-- getDueReviews() -> [B, C]
  |                                                      `-- setReviewItems([B, C])
  |                                                            队列被覆盖！
  |
  |-- 2. setAnimating(true)
  |
  `-- 3. setTimeout(350ms) {
            // 闭包捕获: reviewItems=[A,B,C], reviewIndex=0
            prev.filter((_, i) => i !== 0)
            // prev 是最新 state = [B, C]
            // 删掉的是 B，不是 A！
          }
```

**关键**：闭包中的 `reviewItems` 是旧值（`[A, B, C]`），但 `prev`（React 函数式更新 `setReviewItems((prev) => ...)`）是最新的 state（`[B, C]`）。`filter((_, i) => i !== 0)` 删的不是已评分的 A，而是从未评分的 B。

### 连锁反应

每次评分 >=3 都会误删下一张未评分的卡：

```
评分 A >=3 -> reviewItems = [C]     B 丢了
评分 C >=3 -> reviewItems = []      空
             reviewCompleted = true  (闭包 isLast = true)
```

B 在 DB 中仍然是"待复习"状态（badge 仍然显示），但 React state 里已经空了。用户看到"复习完成"但 badge 有数字。

### 统计数字错误的原因

完成页面用 `total = reviewItems.length` 显示"复习卡片"数量。最后一张卡被 trim 后 `reviewItems` 为空，`total = 0`。`accuracy = goodCount / total = 3 / 0 = 0%`。

## 修复

### 修复 1 — 切断 auto-load 与 allItemsUnfiltered 的依赖链

**文件**: `src/hooks/useReview.ts`

`allItemsUnfiltered` 从 auto-load effect 的 deps 中移除，改用 `useRef` 在回调中读最新值。这样 `refreshAllData()` 更新 `allItemsUnfiltered` 时**不会**在 350ms 窗口内触发 auto-load 覆盖 `reviewItems`。

```typescript
// 前: allItemsUnfiltered 在 deps 中
useEffect(() => {
  if (sidebarTab !== "review" || reviewDateFilter || previewCount) return
  getDueReviews().then((due) => {
    const items = pairWithItems(due, allItemsUnfiltered)
    setReviewItems(items)
  })
}, [sidebarTab, reviewDateFilter, previewCount, allItemsUnfiltered])

// 后: 改用 useRef
const allItemsRef = useRef(allItemsUnfiltered)
allItemsRef.current = allItemsUnfiltered

useEffect(() => {
  if (sidebarTab !== "review" || reviewDateFilter || previewCount) return
  getDueReviews().then((due) => {
    const items = pairWithItems(due, allItemsRef.current)
    setReviewItems(items)
  })
}, [sidebarTab, reviewDateFilter, previewCount])
```

### 修复 2 — DB-driven 替换手动 trim

**文件**: `src/options.tsx`

删除了所有手动队列裁切逻辑（`isLast` 判断、`prev.filter`、手动 requeue），改为评分写 DB 后，动画完成时**重新从 DB 读取**当前待复习列表。DB 成为唯一的真实源。

```typescript
// 后: 重新从 DB 读取
setTimeout(async () => {
  const due = await getDueReviews()
  const itemMap = new Map(allItemsUnfiltered.map((i) => [i.id, i]))
  const items = due
    .map((r) => itemMap.get(r.itemId))
    .filter((i): i is Item => i !== undefined)
  setReviewFlipped(false)
  if (items.length === 0) {
    setReviewCompleted(true)
    setReviewItems([])
  } else {
    setReviewItems(items)
    setReviewIndex(0)
  }
  setAnimating(false)
}, 350)
```

评分 <3 的卡片 dueDate 仍为 `now`，重新读取后自动出现在队列末尾（IDB 的 `dueDate` 索引顺序）。评分 >=3 的卡片 dueDate 在未来，自然被排除。

### 修复 3 — 完成页面 Total

`total` 从 `reviewItems.length`（始终为 0）改为 `sessionRatings.size`（每张卡恰好记录一次首评，等于会话总卡片数）。

## 历史

手动 trim（`prev.filter` + requeue）逻辑最初于 commit `9f1d19a`（"feat: 深化学习"）引入 `ReviewSession.tsx`，目的是实现 **Anki 风格的当轮 requeue**：评分 <3 的卡片移到队列末尾，在当前会话中再次出现。当时 SRS 数据嵌入在 `Item.srs` 中，写 DB 不触发广播，没有竞态问题。

后来引入 `withStore` 自动广播和独立的 `reviews` store 后，每次写 DB 都触发 `_dbi` 广播，导致了 350ms 窗口期的竞态。上述修复将队列管理从手动 trim 改为 DB-driven 读取，消除了双源竞争。

## 教训

手动维护的 React state + DB 自动广播 -> 双源竞争。任何同时写入 DB 和手动裁切 state 的路径都需要确保两者在时间窗口内不会互相覆盖。最根本的解法是让 DB 永远作为唯一真实源，React state 只是 DB 的缓存。
