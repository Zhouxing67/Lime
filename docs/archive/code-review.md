# lime 代码审查报告

## 1. 审查范围

本次 code review 重点关注现有代码中的：

- 功能实现是否符合预期
- 数据一致性与边界场景
- Chrome 扩展上下文限制
- IndexedDB 事务与同步逻辑
- UI 状态管理复杂度
- 类型安全、可维护性与测试覆盖

审查的主要模块包括：

| 模块               | 重点文件                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 扩展入口与后台逻辑 | `src/background.ts`、`src/background/menus.ts`                                                    |
| 内容脚本           | `src/contents/capture.ts`、`src/contents/floating-panel.tsx`                                      |
| Options 主界面     | `src/options.tsx`                                                                                 |
| 数据层             | `src/database/index.ts`                                                                           |
| 复习系统           | `src/hooks/useSrs.ts`、`src/hooks/useReview.ts`、`src/components/ReviewSession.tsx`               |
| 备份 / 导入 / 同步 | `src/import/jsonImport.ts`、`src/utils/zip.ts`、`src/utils/sync.ts`、`src/hooks/useBackupSync.ts` |
| 类型与消息         | `src/types/index.ts`、`src/types/messages.ts`                                                     |

---

## 2. 总体结论

项目整体功能闭环较完整，核心能力包括网页摘录、项目化整理、卡片检索、复习、备份导入和 WebDAV 同步。代码分层大体清晰：后台负责扩展能力，内容脚本负责页面交互，Options 页面负责主 UI，数据库层集中封装 IndexedDB。

但当前实现中存在一些需要优先关注的问题：

1. **导入统计存在明确功能错误**：重复条目会被计入成功导入。
2. **云端下载同步存在数据完整性隐患**：`bulkReplace()` 只替换 items/projects，没有替换 reviews，可能导致复习数据与卡片数据不一致。
3. **浮动画板违反项目消息约定**：直接使用 `chrome.runtime.sendMessage`，绕过统一 `sendMessage()`。
4. **`SearchQuery.dueBefore` 类型字段未实现**：类型暴露了能力但数据库查询未处理，容易造成调用方误判。
5. **Options 页面职责偏重**：页面组件同时承担 UI 编排和大量业务逻辑，后续维护成本较高。
6. **同步冲突策略偏粗糙**：当前上传流程在 hash 不一致时直接覆盖远端，缺少冲突确认或合并策略。

---

## 3. 主要问题与风险等级

### P0 / P1：建议优先修复

| 优先级 | 问题                                          | 影响                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------ |
| P1     | 导入重复条目统计错误                          | 用户看到“成功导入”数量不可信，可能误以为重复数据已写入 |
| P1     | 下载同步未处理 reviews                        | 云端恢复后复习记录可能残留、丢失或指向不存在卡片       |
| P1     | 浮动画板直接调用 `chrome.runtime.sendMessage` | 违反项目约定，类型安全和错误处理不一致                 |
| P2     | `dueBefore` 字段未实现                        | API 语义不完整，后续调用会出现静默失效                 |
| P2     | Options 页面职责过重                          | 维护和测试成本高，容易引入状态联动 bug                 |
| P2     | 上传同步覆盖策略缺少冲突保护                  | 多端同时修改时可能覆盖远端数据                         |

---

## 4. 功能正确性审查

### 4.1 导入统计错误

#### 现象

`importFromZip()` 在写入条目时调用 `addItem(item)`，但没有读取其返回值。`addItem()` 在检测到重复卡片时会返回 `false`，而当前导入逻辑依然执行 `result.imported++`。

#### 代码路径

```ts
await addItem(item)
result.imported++
```

#### 风险

这会导致导入结果提示不准确。例如导入 10 条，其中 5 条重复，用户仍可能看到“成功 10 条”。实际数据库只新增 5 条。

#### 建议修复

```ts
const saved = await addItem(item)
if (saved) {
  result.imported++
} else {
  result.skipped++
}
```

同时建议补充测试：

- 导入重复 item 时 `imported` 不增加。
- 导入重复 item 时 `skipped` 增加。
- 导入结果提示与数据库实际新增数量一致。

---

### 4.2 下载同步没有同步 reviews store

#### 现象

当前 `bulkReplace()` 只接收并替换：

- `remoteItems`
- `remoteProjects`
- `localItems`
- `localProjects`

它没有处理 `reviews` store。

#### 风险

当前数据库已经存在独立 `reviews` store。如果云端同步文件只包含 items/projects，或下载同步只替换 items/projects，会出现以下问题：

1. 云端恢复后，本地旧 reviews 可能继续存在，指向已经被删除的 item。
2. 云端其他设备上的复习进度无法恢复到当前设备。
3. 卡片被云端删除后，对应 review 记录不会被清理。
4. `getDueReviews()` 查询到 orphan review，再通过 item 映射时丢失，导致统计和实际展示可能不一致。

#### 建议修复

同步 payload 应包含 reviews，并在下载同步时以事务方式同时替换三类数据：

- projects
- items
- reviews

如果暂时不计划同步 reviews，也应在下载替换 items 时清理 orphan reviews，至少保证本地数据一致性。

建议优先改造为：

```ts
interface SyncPayload {
  version: number
  syncedAt: number
  contentHash: string
  deviceInfo: { version: string }
  projects: Project[]
  items: Item[]
  reviews: ReviewEntry[]
}
```

并补充测试：

- 下载同步删除 item 后，对应 review 被删除。
- 下载同步可以恢复远端 review 进度。
- `getDueReviews()` 不返回 orphan review。

---

### 4.3 浮动画板绕过统一消息封装

#### 现象

项目规范要求始终使用 `sendMessage()`，但 `src/contents/floating-panel.tsx` 定义了 `cli()` 和 `cli2()`，直接调用 `chrome.runtime.sendMessage`。

#### 风险

1. 绕过统一 Promise 包装和 `chrome.runtime.lastError` 处理。
2. 消息 payload 使用 `string` 和 `any`，没有被 `ExtensionMessage` 类型约束。
3. 后续如果调整消息协议，浮动画板容易遗漏。
4. 与其他模块编码风格不一致，降低维护性。

#### 建议修复

将 `cli()` / `cli2()` 替换为统一的 `sendMessage()`，并让调用点使用明确的消息类型：

```ts
await sendMessage({
  kind: "capture",
  payload: {
    type: "text",
    content: content.trim(),
    title: title.trim() || undefined,
    source: {
      title: document.title,
      url: window.location.href,
      site: window.location.hostname
    },
    projectId: projId || undefined
  }
})
```

如需支持浮动画板特有消息，应该扩展 `ExtensionMessage` union，而不是使用 `any`。

---

### 4.4 `SearchQuery.dueBefore` 未实现

#### 现象

`SearchQuery` 类型暴露了 `dueBefore?: number`，但 `searchItems()` 的过滤条件没有使用该字段。

#### 风险

这是一个典型的“类型承诺与实现不一致”问题。后续调用者可能认为传入 `dueBefore` 能筛选待复习卡片，但实际查询会静默忽略该条件。

#### 建议修复

有两种选择：

1. 如果不再需要：删除 `dueBefore` 字段。
2. 如果需要：明确它查询的是 item 内嵌 SRS 还是 reviews store，并补充对应实现。

考虑当前复习数据已经迁移到 `reviews` store，推荐不要在 `searchItems()` 内继续扩展 `dueBefore`，而是新增专门的 review 查询函数，避免 items 查询与 reviews 查询职责混杂。

---

### 4.5 项目导入时 project 字段缺少完整校验

#### 现象

导入 items 时有 `validateItem()`，但导入 projects 时直接把 `obj.projects` 断言为 `Project[]`，随后读取 `p.name`、`p.id` 等字段。

#### 风险

如果 `export.json` 中的 projects 数据结构损坏或来自非可信来源，可能出现：

- `p.name` 不是字符串，导致 `getProjectByName(p.name)` 语义异常。
- `p.id` 缺失或重复，导致 projectIdMap 异常。
- `createdAt` 缺失，导致项目排序异常。

#### 建议修复

增加 `validateProject()`：

- `name` 必须是非空字符串。
- `id` 缺失时生成新 ID。
- `createdAt` 缺失时使用 `Date.now()`。
- `note` 仅接受字符串。

---

## 5. 实现方式隐患

### 5.1 同步 hash 对 JSON 顺序敏感

同步 payload 的 hash 基于 `JSON.stringify({ items, projects })`。如果 items/projects 数组顺序不同但内容等价，hash 仍会不同。

#### 风险

- 不必要的上传或下载。
- 多端数据顺序差异导致频繁判断为变更。

#### 建议

构建同步 payload 前对 projects/items 做稳定排序，例如：

- projects 按 `id` 排序。
- items 按 `id` 排序。
- reviews 未来也按 `id` 或 `itemId` 排序。

并确保只参与同步的字段进入 hash，避免运行时派生字段引发误判。

---

### 5.2 上传同步缺少真正的冲突处理

当前上传同步在发现本地和远端 hash 不一致时直接上传本地 payload。虽然逻辑简单，但多设备同时修改时会覆盖远端。

#### 风险

设备 A 和设备 B 同时离线修改，随后先后上传，后上传的一方会覆盖先上传的数据。

#### 建议

可以分阶段改进：

1. 最小改进：远端 hash 不一致时提示用户选择上传或下载。
2. 进一步改进：记录 `syncedAt` 和本地 `lastSyncTime`，判断是否为真正冲突。
3. 最终方案：按 item/project/review 的 `updatedAt` 做三方合并。

---

### 5.3 `bulkReplace()` 分 store 执行，跨 store 不完全原子

`bulkReplace()` 先替换 items，再替换 projects。两个 store 是两个独立事务。

#### 风险

如果 items 替换成功但 projects 替换失败，本地会出现半更新状态。

#### 建议

将 `bulkReplace()` 改为使用多 store `tx()`，在一个事务内同时处理 projects、items，以及未来的 reviews。

---

### 5.4 Options 页面状态和业务逻辑耦合较重

`src/options.tsx` 同时维护大量状态，并直接实现导入、批量移动、批量复制、加入复习、卡片保存事务等业务逻辑。

#### 风险

- 单文件修改冲突概率高。
- UI 状态和业务状态相互影响，不易测试。
- 复习、备份、项目、卡片操作之间的副作用难以追踪。

#### 建议

拆分为更细的 hooks：

- `useItemSearch()`：搜索、分页、懒加载。
- `useCardSelection()`：选择模式、选中集合、全选。
- `useCardTransfer()`：移动、复制、批量移动复制。
- `useReviewMembership()`：加入 / 移出复习、摘要补齐。
- `useBackupImport()`：导入文件处理和结果提示。

---

### 5.5 后台 `onMessage` 的默认分支不返回错误

后台消息分发中，如果收到未知 `kind`，当前逻辑不会显式返回错误响应。

#### 风险

调用方可能一直拿到 `undefined`，难以区分：

- 消息未被识别
- 后台异常
- 正常但无返回值

#### 建议

在 switch 末尾增加默认响应：

```ts
sendResponse({ ok: false, error: `Unknown message kind: ${msg.kind}` })
return false
```

如果要保持部分消息 fire-and-forget，也建议在类型层明确区分 request/response 消息。

---

## 6. Chrome 扩展上下文与安全审查

### 6.1 后台 DOM API 使用情况

后台主要使用 Chrome APIs、IndexedDB、fetch、notifications、contextMenus，没有明显直接使用 `window`、`document`、`alert`、`confirm` 等 DOM API 的问题。这符合 MV3 Service Worker 限制。

### 6.2 WebDAV Basic Auth 代理方式合理

WebDAV 请求通过 `kind: "webdav"` 消息发送到后台，由后台执行 `fetch()` 并携带 `Authorization` header。该设计可以避免 Chrome 原生 Basic Auth 弹窗，是合理的。

### 6.3 内容脚本样式隔离

`floating-panel.tsx` 使用 Shadow DOM 挂载浮动画板，有利于降低页面样式污染风险。但该文件中存在大量 inline style 和手写 DOM 操作，后续维护成本高，建议至少统一消息封装和错误处理。

---

## 7. 代码质量分析

### 7.1 类型安全

优点：

- `Item`、`Project`、`ReviewEntry`、`ExtensionMessage` 等核心类型集中定义。
- 主流程大多使用 TypeScript 类型进行约束。

问题：

- `background.ts` 的 `onMessage(raw: any)` 仍依赖运行时转换。
- `floating-panel.tsx` 的 `cli()` / `cli2()` 使用 `string` 和 `any`。
- 导入 projects 时缺少结构校验。

建议：

- 为后台消息处理增加运行时校验或类型守卫。
- 删除浮动画板中的 `any` 消息调用。
- 为 import/export payload 定义正式 schema。

---

### 7.2 事务一致性

优点：

- 已经提供 `tx()` 支持多 store 原子事务。
- 删除 item 时会级联删除 review。

问题：

- `bulkReplace()` 没有使用多 store 事务。
- 同步下载没有处理 reviews。
- 导入项目和导入卡片是多次独立写入，中途失败会留下部分导入状态。

建议：

- 同步替换类操作优先使用 `tx()`。
- 导入可以先校验完整 payload，再执行写入，减少半导入状态。

---

### 7.3 可测试性

当前数据库和工具函数已有测试基础，但以下高风险路径缺少测试：

- ZIP 导入统计
- WebDAV 同步 hash 比较
- `bulkReplace()` 删除和 upsert 行为
- review 与 item 的级联一致性
- `rateSrs()` 的边界评分
- `SearchQuery` 的组合过滤
- 浮动画板保存流程

建议优先补齐与数据一致性相关的单元测试。

---

### 7.4 可维护性

项目整体目录清晰，但存在两个维护压力点：

1. `options.tsx` 过重。
2. `floating-panel.tsx` 中混合了 DOM 挂载、CSS、React 组件、消息调用、拖拽逻辑和业务保存逻辑。

建议优先把业务逻辑从 UI 组件中抽离，尤其是数据写入、同步、导入、复习加入等部分。

---

## 8. 建议修复顺序

### 第一阶段：修复明确 bug

1. 修复 `importFromZip()` 的重复导入统计。
2. 修复或移除 `SearchQuery.dueBefore`。
3. 将 `floating-panel.tsx` 改为使用统一 `sendMessage()`。

### 第二阶段：修复数据一致性风险

1. 同步 payload 增加 reviews。
2. `bulkReplace()` 改为单事务替换 projects/items/reviews。
3. 下载同步后清理 orphan reviews。
4. 同步 hash 改为稳定排序后计算。

### 第三阶段：改进架构和测试

1. 拆分 `options.tsx` 的业务 hooks。
2. 拆分 `floating-panel.tsx`。
3. 增加导入、同步、复习和搜索测试。
4. 更新 AGENTS.md 中与当前数据库版本和 stores 不一致的说明。

---

## 9. 结论

当前项目的核心功能实现方向是正确的，Chrome 扩展上下文划分也基本合理。最主要的问题集中在数据一致性和工程维护性：导入统计、同步 reviews、消息封装一致性和 Options 页面复杂度。

建议优先修复会直接影响用户数据可信度的问题，再逐步推进同步模型和 UI 业务逻辑拆分。这样可以在不大幅重构的前提下，先降低实际使用风险，再提升长期可维护性。
