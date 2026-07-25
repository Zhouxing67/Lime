# lime 项目功能与代码架构分析

## 1. 项目概览

`lime` 是一款 Chrome Manifest V3 浏览器扩展，用于在浏览网页时收藏文本、图片或链接，并在扩展的 Options 页面中按“项目”整理、检索、复习、备份和同步这些卡片。

项目技术栈如下：

- **扩展框架**：Plasmo `0.90.5`
- **语言与 UI**：TypeScript、React 18、MUI v7、Emotion
- **数据存储**：IndexedDB
- **测试环境**：Jest、ts-jest、jsdom、fake-indexeddb
- **同步与备份**：JSZip、本地 ZIP 备份、坚果云 WebDAV 同步

主要入口包括：

| 文件                       | 职责                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `src/options.tsx`          | Options 页面，项目的主 UI 与组合根                                          |
| `src/background.ts`        | Manifest V3 Service Worker，负责右键菜单、消息分发、通知、徽标、WebDAV 代理 |
| `src/contents/capture.ts`  | 内容脚本，负责快捷键捕获和网页内 toast                                      |
| `src/tabs/new-project.tsx` | 自定义 popup 页面，用于新建项目并保存待捕获内容                             |

---

## 2. 核心功能分析

### 2.1 网页内容捕获

项目支持两种主要捕获方式。

#### 右键菜单捕获

后台 Service Worker 注册 Chrome 右键菜单，菜单结构包括：

- 根菜单 `lime`
- 最近项目
- 新建项目并加入
- 加入已有项目

右键菜单支持以下上下文：

- 选中文本
- 图片
- 链接
- 页面

用户触发菜单后，后台根据 `selectionText`、`srcUrl`、`linkUrl` 或当前标签页 URL 判断捕获内容类型，并保存为 `text`、`image` 或 `link` 卡片。

如果用户选择“新建项目并加入”，后台会把待保存内容写入 `chrome.storage.session`，然后打开 `tabs/new-project.html` 弹窗，由用户创建项目或选择已有项目。

#### 快捷键捕获

内容脚本注入所有 HTTP/HTTPS 页面，并监听 `Alt+S`。当用户选中文本后按下快捷键，内容脚本会读取当前选择内容，并携带页面标题、URL、hostname 发送 `capture` 消息给后台。

内容脚本还负责接收后台发来的 `toast` 消息，在网页右上角显示保存成功或重复跳过提示。

---

### 2.2 项目管理

项目是卡片的一级组织单位，数据结构包括：

- `id`
- `name`
- `createdAt`
- `note`
- `lastOpened`

项目 CRUD 逻辑主要封装在 `useProjects` Hook 中，包括：

- 加载项目列表
- 新建项目
- 重命名项目
- 更新项目备注
- 删除项目
- 激活 / 取消激活当前项目

项目名称唯一性同时在两层保证：

1. UI / Hook 层创建或重命名前检查同名项目。
2. IndexedDB 的 `projects` store 通过 `name` 唯一索引约束项目名。

---

### 2.3 卡片管理

卡片类型包括：

- `text`：文本摘录
- `image`：图片
- `link`：链接

核心卡片模型 `Item` 包含：

- 类型、标题、正文内容
- 来源页面信息
- 所属项目 ID
- 链接已读状态
- hash 去重字段
- 手动排序字段
- 更新时间

卡片新增统一走 `addItem()`，该函数会补充：

- `updatedAt`
- `sourceSite`
- `hash`

卡片去重规则是：同一项目内，如果 `hash` 相同且 `source.url` 相同，则视为重复并跳过插入。

主页面支持以下卡片操作：

- 单张删除
- 批量删除
- 移动到其他项目
- 复制到其他项目
- 批量移动 / 批量复制
- 链接卡片标记已读 / 未读
- 编辑卡片标题和内容
- 加入或移出复习

---

### 2.4 搜索、筛选与分页

搜索入口位于 Options 页面，查询条件通过 `SearchQuery` 表示，支持：

- 关键词
- 类型
- 站点
- 项目 ID
- 日期范围
- `dueBefore` 预留字段

数据库查询逻辑位于 `searchItems()`：

- 如果传入 `projectId`，优先使用 `projectId` 索引。
- 否则使用 `createdAt` 索引，按创建时间倒序遍历。
- 在游标遍历过程中执行类型、站点、日期、项目和关键词过滤。

Options 页面每次查询后会对结果按 `order` 和 `createdAt` 排序，并使用每页 20 条的懒加载策略。页面底部通过 `IntersectionObserver` 触发加载更多。

关键词搜索做了 300ms debounce，避免每次键入都立即查询 IndexedDB。

---

### 2.5 复习 / SRS

项目内置间隔重复复习功能，复习数据从卡片本体中拆出，单独存储在 `reviews` store 中。

复习相关数据结构包括：

- `SrsData`
  - `dueDate`
  - `interval`
  - `easeFactor`
  - `reviewCount`
  - `lastReviewDate`
  - `reviewHistory`
- `ReviewEntry`
  - `itemId`
  - `projectId`
  - `srs`
  - `status`
  - `dueDate`
  - `addedAt`

复习算法类似 SM-2：

- 初始 easeFactor 为 `2.5`
- 评分小于 3 时，间隔重置为 1 天，easeFactor 降低
- 评分为 3 时，按当前间隔和 easeFactor 增长
- 评分为 4 时，间隔额外乘以 `1.3`，easeFactor 增加
- 最大间隔限制为 365 天
- 复习历史最多保留 200 条

复习列表由 `getDueReviews()` 生成：查询 `dueDate <= Date.now()` 且状态为 `active` 的复习记录。

如果卡片没有摘要，加入复习时会先弹出摘要输入框；保存摘要后，再创建对应的 `ReviewEntry`。

---

### 2.6 备份、导入与同步

#### ZIP 备份

备份使用 JSZip 生成 `lime-backup.zip`，内部包含：

- `export.json`
- 可选的 `images/` 目录

`export.json` 中保存 items 和 projects。对于内容为 data URL 的图片卡片，导出时会额外将图片写入 ZIP 的 `images/` 目录。

#### ZIP 导入

导入逻辑会读取 ZIP 中的 `export.json`，并支持两种格式：

1. 旧格式：纯 items 数组
2. 新格式：`{ items, projects }`

导入时会校验：

- item 必须是对象
- type 必须是 `text`、`image` 或 `link`
- content 必须是非空字符串
- source 必须存在
- source.url 必须是非空字符串

导入项目时，会优先根据项目名复用已有项目；不存在则创建新项目，并建立项目 ID 映射。

#### WebDAV 同步

云同步目标是坚果云 WebDAV：

```text
https://dav.jianguoyun.com/dav/Apps/lime/lime-sync.json
```

同步请求通过后台 Service Worker 代理，以避免 Chrome 原生 Basic Auth 弹窗。

上传同步流程：

1. 检查上次同步后是否有本地变更。
2. 构建本地 payload。
3. 下载远端同步文件。
4. 比较本地和远端 contentHash。
5. 首次同步或 hash 不一致时上传本地数据。

下载同步流程：

1. 下载远端 payload。
2. 构建本地 payload。
3. 比较 contentHash。
4. 如果不同，返回远端数据给上层。
5. 上层通过 `bulkReplace()` 应用远端数据。

`bulkReplace()` 使用差异替换策略：写入远端存在的数据，删除本地存在但远端不存在的数据。

---

## 3. 代码架构分析

### 3.1 目录职责

当前源码目录职责比较清晰：

```text
src/
  components/       # MUI UI 组件
  hooks/            # 业务 Hook
  database/         # IndexedDB 数据访问层
  types/            # 领域类型和消息类型
  contents/         # 内容脚本
  background/       # Service Worker 相关逻辑
  tabs/             # Plasmo 自定义页面
  import/           # ZIP / JSON 导入逻辑
  utils/            # hash、URL、同步、ZIP 等工具
  theme/            # MUI 主题
  test/             # 测试 setup 与 mock
```

整体架构可以理解为：

```text
Chrome Extension Runtime
├─ background.ts
│  ├─ contextMenus
│  ├─ runtime.onMessage
│  ├─ notifications
│  ├─ action badge
│  └─ WebDAV fetch proxy
│
├─ contents/capture.ts
│  ├─ Alt+S text capture
│  └─ webpage toast
│
├─ tabs/new-project.tsx
│  ├─ pendingCapture reader
│  ├─ project creation
│  └─ save captured item
│
└─ options.tsx
   ├─ project management
   ├─ card grid
   ├─ search / filters
   ├─ review session
   ├─ import / export
   └─ settings
```

---

### 3.2 数据层架构

数据库层集中在 `src/database/index.ts`。

当前数据库名称为 `pickquote-db`，版本为 `8`，包含三个 store：

- `items`
- `projects`
- `reviews`

索引设计：

| Store      | 索引                                                   |
| ---------- | ------------------------------------------------------ |
| `items`    | `type`、`createdAt`、`sourceSite`、`projectId`、`hash` |
| `projects` | `name`，唯一索引                                       |
| `reviews`  | `itemId`，唯一索引；`projectId`、`status`、`dueDate`   |

数据库访问主要通过两个封装完成：

#### `withStore()`

用于单 store 操作，职责包括：

- 打开数据库
- 创建事务
- 执行业务回调
- 等待事务完成
- 写事务完成后广播数据库变更
- 关闭数据库

#### `tx()`

用于多 store 原子事务。例如删除卡片时，需要同时删除卡片和对应复习记录，就可以通过 `tx({ reviews: "readwrite", items: "readwrite" }, ...)` 保证一致性。

---

### 3.3 跨上下文数据刷新机制

项目没有引入全局状态管理器，而是使用 `chrome.storage.local` 作为轻量级广播机制。

写事务成功后：

- `projects` 变化广播 `_dbp`
- `items` 或 `reviews` 变化广播 `_dbi`

各上下文监听 `chrome.storage.onChanged`：

- Options 页面收到变化后调用 `refreshAllData()` 重新加载项目和卡片。
- Background 收到项目变化后重建右键菜单。
- Background 收到卡片 / 复习变化后更新 badge。

这种方式适合 Chrome 扩展多上下文架构，可以避免 background、options、popup、content script 之间建立复杂的直接通信关系。

---

### 3.4 消息系统架构

跨上下文消息定义在 `src/types/messages.ts`，使用 discriminated union 表达不同消息类型。

主要消息包括：

| kind                  | 用途                         |
| --------------------- | ---------------------------- |
| `capture`             | 内容脚本请求后台保存捕获内容 |
| `toast`               | 后台请求内容页显示 toast     |
| `webdav`              | 前端请求后台代理 WebDAV 请求 |
| `save-feedback`       | popup 请求后台发送保存反馈   |
| `set-recent-project`  | 更新最近打开项目             |
| `list-projects`       | 获取项目列表                 |
| `add-project`         | 新建项目                     |
| `capture-visible-tab` | 截取当前可见标签页           |

项目约定使用 `sendMessage()` 封装 `chrome.runtime.sendMessage`，业务代码无需直接处理 callback 风格 API。

---

### 3.5 UI 层架构

`src/options.tsx` 是主页面组合根，负责持有页面级状态并连接各个 Hook 和组件。

它主要负责：

- 当前项目状态
- 当前搜索条件
- 卡片列表与分页
- 复习状态
- 备份选择状态
- 对话框状态
- 批量操作状态
- 主题 preset 状态

UI 组件拆分相对明确：

| 组件                  | 职责                     |
| --------------------- | ------------------------ |
| `AppHeader`           | 顶部工具栏               |
| `SidebarFilters`      | 左侧项目、复习、备份导航 |
| `CardGrid`            | 瀑布流卡片布局           |
| `ItemCard`            | 单张卡片外观和操作入口   |
| `CardRenderer`        | 不同模式下的卡片内容渲染 |
| `ReviewSession`       | 复习会话                 |
| `ItemDialog`          | 卡片详情和编辑           |
| `NewCardDialog`       | 手动新建卡片             |
| `NewProjectDialog`    | 新建项目                 |
| `DeleteConfirmDialog` | 删除确认                 |
| `SettingsDialog`      | 设置                     |
| `MoveCopyCards`       | 移动 / 复制目标项目选择  |

整体 UI 采用 React hooks + props callback 的方式组织，没有使用 Redux、Zustand 或 router。

---

## 4. 架构优点

### 4.1 Chrome 扩展上下文边界清晰

后台 Service Worker 负责扩展级能力，例如右键菜单、通知、badge、消息分发、WebDAV 代理；内容脚本负责页面内交互；Options 页面负责主 UI。这符合 Manifest V3 的运行模型。

### 4.2 IndexedDB 操作集中

数据库操作集中在 `src/database/index.ts`，业务层不会直接分散操作 IndexedDB。统一封装有利于事务管理、广播变更和后续迁移。

### 4.3 去重策略统一

多个入口都最终调用 `addItem()`，由数据层统一计算 hash 并执行重复检测，避免各入口重复实现去重逻辑。

### 4.4 UI 组件复用意识较强

卡片内容渲染统一走 `CardRenderer`，不同场景通过 `mode` 区分。空状态、删除确认、移动复制、设置等也都有独立组件。

### 4.5 同步设计符合扩展限制

WebDAV 请求通过后台代理，避免前端页面直接触发浏览器原生 Basic Auth 弹窗，适配 Chrome 扩展环境。

---

## 5. 潜在问题与改进建议

### 5.1 `options.tsx` 体积和职责偏重

`options.tsx` 同时承担：

- 页面组合
- 状态管理
- 卡片操作
- 复习加入逻辑
- 导入备份逻辑
- 移动 / 复制逻辑
- 搜索分页逻辑

建议后续拆分为更细的业务 Hook，例如：

- `useItemSearch`
- `useCardSelection`
- `useMoveCopyCards`
- `useReviewMembership`
- `useImportBackup`

这样可以降低主页面复杂度，提升测试便利性。

### 5.2 导入统计可能不准确

`importFromZip()` 中调用 `addItem(item)` 后，没有检查返回值。由于 `addItem()` 在重复内容时会返回 `false`，当前逻辑可能把重复跳过的条目计为 `imported`。

建议改为：

```ts
const saved = await addItem(item)
if (saved) result.imported++
else result.skipped++
```

### 5.3 `SearchQuery.dueBefore` 字段暂未实际使用

类型中定义了 `dueBefore`，但 `searchItems()` 当前没有根据该字段过滤。若它是历史遗留字段，可以删除；若它是复习筛选预留字段，建议补上实现或注释说明。

### 5.4 AGENTS.md 与实际数据库版本存在差异

项目说明中提到 active stores 是 `items` + `projects`，但当前代码已经包含 `reviews` store，数据库版本也已经是 8。建议更新说明，避免后续维护者误判数据结构。

### 5.5 可补充架构级测试

当前已有数据库和工具函数测试入口。后续可以补充：

- 导入重复卡片统计测试
- `bulkReplace()` 删除 / upsert 测试
- `rateSrs()` 评分边界测试
- `searchItems()` 日期和关键词组合测试
- WebDAV 同步 hash 相同 / 不同分支测试

---

## 6. 总结

`lime` 当前是一个结构较完整的浏览器摘录与复习扩展：

- 捕获入口覆盖右键菜单和快捷键。
- 数据模型围绕项目、卡片、复习记录展开。
- IndexedDB 封装较集中，并具备跨上下文变更广播。
- Options 页面功能丰富，承担项目管理、卡片管理、复习、备份和同步。
- 同步方案针对 Chrome 扩展环境做了 WebDAV 后台代理。

整体架构清晰、功能闭环完整。当前最值得优先优化的是继续拆分 `options.tsx` 的业务逻辑，以及修正导入统计、文档与代码不一致等小问题。
