# 重构后代码审查报告

## 1. 审查背景

本报告基于当前仓库代码状态，对最近几次围绕复习系统、浮动画板、事务和文档沉淀的提交进行复查，重点判断此前 code review 中提到的问题是否已经被修复，以及重构后仍然存在的功能正确性、实现隐患和代码质量问题。

当前最近提交记录显示，最新提交是文档提交 `5077567 Add detailed project analysis and code review documents`，在其之前有多次代码相关提交，包括复习功能修复、浮动画板功能和复习系统重构。

本次重点检查文件：

| 模块                | 文件                                                      |
| ------------------- | --------------------------------------------------------- |
| 数据层              | `src/database/index.ts`                                   |
| 导入逻辑            | `src/import/jsonImport.ts`                                |
| 同步逻辑            | `src/utils/sync.ts`、`src/hooks/useBackupSync.ts`         |
| 消息系统            | `src/types/messages.ts`、`src/background.ts`              |
| 内容脚本 / 浮动画板 | `src/contents/floating-panel.tsx`                         |
| Options 主页面      | `src/options.tsx`                                         |
| 复习系统            | `src/hooks/useSrs.ts`、`src/components/ReviewSession.tsx` |

---

## 2. 总体结论

重构后的代码有一些明确进步：

1. 数据库层已经引入独立的 `reviews` store。
2. 已提供 `tx()` 多 store 事务工具。
3. 删除卡片时已经级联删除 review。
4. 编辑卡片并清空摘要时会同步移除复习记录。
5. WebDAV 请求仍然通过后台 Service Worker 代理，方向正确。
6. 浮动画板已引入 Shadow DOM、固定、拖拽和项目选择等能力。

但从当前代码看，此前 code review 中的几个关键问题仍未完全修复：

1. `importFromZip()` 仍未根据 `addItem()` 返回值统计导入结果，重复卡片会被计为成功导入。
2. WebDAV 同步 payload 仍只包含 `items` 和 `projects`，没有同步 `reviews`。
3. 下载同步仍通过 `bulkReplace()` 只替换 `items/projects`，可能留下 orphan reviews。
4. `bulkReplace()` 仍是分 store 两个事务，不是跨 store 原子替换。
5. `floating-panel.tsx` 仍直接调用 `chrome.runtime.sendMessage`，没有使用统一 `sendMessage()`。
6. `SearchQuery.dueBefore` 仍存在于类型中，但 `searchItems()` 没有实现该筛选条件。
7. `options.tsx` 仍承担较多业务逻辑，拆分还不充分。
8. `ReviewSession` 中复习评分后可能继续使用父组件传入的旧 `reviewSrsMap` 快照。

因此，当前重构属于“局部改善”，但数据一致性和协议一致性问题仍建议继续优先处理。

---

## 3. 与此前 code review 的问题对照

| 此前问题                        | 当前状态 | 结论                                                          |
| ------------------------------- | -------- | ------------------------------------------------------------- |
| 导入重复条目统计错误            | 仍存在   | `addItem()` 返回 `false` 时仍会 `imported++`                  |
| 下载同步未处理 reviews          | 仍存在   | `SyncPayload` 没有 `reviews` 字段                             |
| `bulkReplace()` 非原子          | 仍存在   | 仍分别写 `items` 和 `projects`                                |
| 浮动画板绕过统一消息封装        | 仍存在   | 仍有 `cli()` / `cli2()` 直接调用 `chrome.runtime.sendMessage` |
| `SearchQuery.dueBefore` 未实现  | 仍存在   | 类型字段存在，但查询逻辑未使用                                |
| Options 页面过重                | 部分改善 | 已抽部分 Hook，但主页面仍有大量业务逻辑                       |
| 删除 item 后 orphan review      | 已改善   | 单删 / 批删通过 `tx()` 级联删除 review                        |
| 编辑卡片清空摘要后仍保留 review | 已改善   | 保存时通过 `tx()` 删除 review                                 |
| WebDAV Basic Auth 前台弹窗风险  | 已规避   | WebDAV 请求经后台代理                                         |

---

## 4. 已改善的部分

### 4.1 reviews store 独立化

当前数据库包含 `items`、`projects`、`reviews` 三个 store，`reviews` store 使用 `itemId` 唯一索引，并包含 `projectId`、`status`、`dueDate` 等索引。

这是正确的重构方向。相比把 SRS 数据挂在 `Item` 上，独立 review 表更适合支持：

- 暂停复习
- 掌握状态
- 到期查询
- 复习统计
- 后续多设备同步

### 4.2 多 store 事务工具已经建立

`tx()` 已经支持多个 object store 的原子事务。删除卡片和编辑卡片同步 review 状态时已经使用该工具。

这说明代码已经具备继续修复同步一致性问题的基础。后续 `bulkReplace()`、导入批处理和 review 清理都可以迁移到 `tx()`。

### 4.3 删除卡片级联 review

单张删除和批量删除会先通过 `reviews.itemId` 查找对应 review key，再删除 review 和 item。该实现能避免常规删除场景下产生 orphan review。

### 4.4 编辑卡片清空摘要会移出复习

Options 页面在保存卡片时，如果更新后的卡片没有 title，会在同一事务中删除对应 review。这符合“复习卡片必须有摘要”的业务约束。

---

## 5. 仍未修复的高优先级问题

### 5.1 导入统计仍不正确

#### 当前实现

`importFromZip()` 中，写入每个 item 时仍然是：

```ts
await addItem(item)
result.imported++
```

但 `addItem()` 在重复内容时会返回 `false`，并不会写入数据库。

#### 影响

导入结果中的成功数量可能大于实际新增数量，用户会看到错误反馈。

#### 建议

改为：

```ts
const saved = await addItem(item)
if (saved) {
  result.imported++
} else {
  result.skipped++
}
```

并增加重复导入测试。

---

### 5.2 同步仍未覆盖 reviews

#### 当前实现

`SyncPayload` 当前只有：

- `projects`
- `items`

没有 `reviews`。

下载同步时，`useBackupSync()` 只把远端的 items/projects 传给 `bulkReplace()`。

#### 影响

复习数据不会被同步，具体表现包括：

1. A 设备完成复习后，B 设备无法得到最新 dueDate、reviewCount、reviewHistory。
2. 云端恢复数据时，本地旧 reviews 可能继续存在。
3. 远端删除卡片后，本地可能保留指向旧 item 的 review。
4. due badge 和复习统计可能与实际可展示卡片不一致。

#### 建议

同步 payload 增加：

```ts
reviews: ReviewEntry[]
```

同时：

- 上传时序列化 reviews。
- 下载时原子替换 projects/items/reviews。
- 对旧版本 sync payload 做兼容迁移。
- 增加 orphan review 清理逻辑。

---

### 5.3 `bulkReplace()` 仍不是跨 store 原子操作

#### 当前实现

`bulkReplace()` 先开启 `items` 写事务，再开启 `projects` 写事务。

#### 影响

如果中途失败，可能出现：

- items 已更新，projects 未更新。
- projects 已更新，reviews 仍是旧数据。
- UI 刷新后看到不一致状态。

#### 建议

改为：

```ts
await tx(
  { projects: "readwrite", items: "readwrite", reviews: "readwrite" },
  async (stores) => {
    // upsert remote projects/items/reviews
    // delete local-not-in-remote projects/items/reviews
  }
)
```

如果暂时不处理 reviews，也至少要用 `tx({ items: "readwrite", projects: "readwrite" }, ...)` 保证 items/projects 同步替换原子性。

---

### 5.4 浮动画板仍绕过统一消息封装

#### 当前实现

`floating-panel.tsx` 中仍有：

```ts
function cli(msg: string): Promise<any> {
  return chrome.runtime.sendMessage({ kind: msg })
}

function cli2(msg: string, payload: any): Promise<any> {
  return chrome.runtime.sendMessage({ ...payload, kind: msg })
}
```

保存摘录和创建项目也使用 `cli2()`。

#### 影响

- 消息没有 `ExtensionMessage` 类型保护。
- 运行时错误处理不统一。
- 与项目约定不一致。
- 后续新增或调整消息协议时容易遗漏。

#### 建议

删除 `cli()` / `cli2()`，统一使用：

```ts
import { sendMessage } from "../types/messages"
```

并让 `list-projects`、`add-project`、`capture` 都走类型化消息。

---

### 5.5 `SearchQuery.dueBefore` 仍未实现

#### 当前实现

`SearchQuery` 类型里仍有：

```ts
dueBefore?: number
```

但 `searchItems()` 的过滤条件没有使用它。

#### 影响

这是类型层对外承诺了能力，但实现层静默忽略。后续调用者如果传入 `dueBefore`，不会得到预期结果。

#### 建议

当前复习数据已经独立到 `reviews` store，建议不要继续把 due 查询塞进 `searchItems()`。

可以选择：

1. 删除 `SearchQuery.dueBefore`。
2. 新增专门的 review 查询函数，例如 `searchReviewItems()` 或 `getDueReviewItems()`。

---

## 6. 新发现或仍需关注的问题

### 6.1 `ReviewSession` 可能使用过期 SRS 快照

评分时，`ReviewSession` 从父组件传入的 `reviewSrsMap` 读取当前 SRS，然后调用 `rateSrs()` 和 `updateReviewSrs()`。

如果评分为 1 或 2，当前卡片会被重新放回队尾。之后再次评分同一张卡片时，如果父组件没有刷新并重新传入最新 `reviewSrsMap`，本组件可能继续基于旧 SRS 计算。

#### 风险

- `reviewCount` 可能不准确。
- `reviewHistory` 可能丢失本轮前一次评分。
- 重来卡片在同一 session 内多次评分时 SRS 状态不稳定。

#### 建议

在 `ReviewSession` 内维护一份 local SRS map：

1. 初始值来自 props。
2. 每次评分后立即更新 local map。
3. 后续评分优先读取 local map。

---

### 6.2 同步 hash 对数组顺序敏感

`buildPayload()` 使用 `JSON.stringify({ items, projects })` 计算 contentHash。如果数组顺序不同但内容等价，hash 会不同。

#### 建议

计算 hash 前做稳定排序：

- projects 按 `id` 排序。
- items 按 `id` 排序。
- reviews 按 `id` 或 `itemId` 排序。

并确保只对需要同步的稳定字段计算 hash。

---

### 6.3 上传同步仍是覆盖式策略

当本地和远端 hash 不一致时，`runSync()` 会直接上传本地 payload 覆盖远端。

#### 风险

多设备同时修改时，后上传的一端覆盖先上传的一端。

#### 建议

至少在 hash 不一致时提示用户选择：

- 上传本地
- 下载远端

更完整的方案是基于 `updatedAt` 做 item/project/review 级合并。

---

### 6.4 Options 页面仍需继续拆分

虽然项目已经有 `useProjects`、`useReview`、`useBackupSync`、`useNewCard`，但 `options.tsx` 仍然直接实现了很多业务流程：

- 搜索分页
- 加入 / 移出复习
- 导入备份
- 移动 / 复制卡片
- 批量操作
- 卡片编辑保存事务

建议继续拆分：

- `useItemSearch()`
- `useCardSelection()`
- `useCardTransfer()`
- `useReviewMembership()`
- `useBackupImport()`

---

### 6.5 格式化状态仍不理想

`options.tsx` 中仍有明显缩进问题，例如批量移动逻辑中 `const hash` 缩进不正确。

建议执行一次全仓库 Prettier，或至少先格式化当前高频维护文件。

---

## 7. 测试状态

本次运行了现有测试：

```text
npm test -- --runInBand
```

结果：

- 2 个测试套件通过。
- 37 个测试通过。

当前测试主要覆盖数据库和工具函数。建议继续补充以下测试：

1. `importFromZip()` 重复导入统计。
2. `bulkReplace()` 的原子替换和删除行为。
3. 下载同步时 reviews 的同步 / 清理行为。
4. `rateSrs()` 多次评分和 reviewHistory 追加。
5. `ReviewSession` 同一张卡片重来后再次评分。
6. `SearchQuery` 字段与实际过滤逻辑一致性。
7. 浮动画板保存和创建项目消息类型。

---

## 8. 建议修复路线

### 阶段一：修复明确功能错误

1. 修复 `importFromZip()` 导入统计。
2. 移除或实现 `SearchQuery.dueBefore`。
3. 修复 `floating-panel.tsx` 直接调用 `chrome.runtime.sendMessage` 的问题。
4. 为后台消息增加 default 错误响应。

### 阶段二：修复同步和数据一致性

1. `SyncPayload` 增加 reviews。
2. 上传 / 下载同步纳入 reviews。
3. `bulkReplace()` 改为多 store 原子事务。
4. 下载同步后清理 orphan reviews。
5. 同步 hash 使用稳定排序后的 payload。

### 阶段三：降低维护成本

1. 继续拆分 `options.tsx`。
2. 拆分 `floating-panel.tsx`。
3. 增加导入、同步、复习和消息流测试。
4. 执行全仓库格式化或制定逐步格式化策略。

---

## 9. 最终判断

重构后的代码相较早期版本已经在复习数据建模和事务能力上有明显进步，尤其是 `reviews` store 和 `tx()` 的引入，为后续修复数据一致性问题打下了基础。

但目前重构尚未闭环。影响用户感知和数据可靠性的几个问题仍然存在，优先级最高的是导入统计、reviews 同步、`bulkReplace()` 原子性和浮动画板消息封装。建议下一轮优先修复这些明确问题，再继续做 Options 页面和浮动画板的结构拆分。
