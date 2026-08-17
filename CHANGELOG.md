# Changelog

## Unreleased

## 0.3.0 — 待办链接 + 独立稍后读
- **待办↔卡片/PDF/网页链接**：TodoCard 新增可选 `pdfId/cardId/url` 链接字段（schema 单一来源，无 DB 迁移/同步升版）；待办卡显示关联 chip 点击跳转；编辑表单可设关联（卡片/PDF/URL/无）。
- **独立稍后读**：新 `ReadLater` 类型 + `readLater` store（DB v14，`byPdfId` 唯一索引 —— 一个 PDF 一张稍后读卡）；并入待办视图为「待办 | 稍后读」tab；ReadingCard（未读/在读/已读 + 摘录/笔记/来源）；阅读完毕自动归档。
- **PDF 瓦片稍后读 icon**：一键加入稍后读；未归档时显示「稍后读」提醒 chip + 填充图标，标记已读后取消。
- **双入口**：网页悬浮球「稍后读」按钮 + 稍后读 tab 新建瓦片（填 URL 或选库内 PDF）。
- **同步 v7**：SyncPayload 新增 `readLater` 数组（哈希覆盖、门控 v3-v7、sanitize 校验、bulkReplace 冲突去重）。
- 备份导出/导入含 readLater（ZIP v5 增列）。

## 0.2.0 — 序列化单一来源 + 发布前加固
- **序列化单一来源**：记录类型由 Zod schema（`types/schemas.ts`）`z.infer` 推导，`types/index.ts` re-export；import 校验器改为 `schema.safeParse`（形状校验自动随数据模型更新）。
- **同步下载校验**：`sanitizeSyncPayload` 应用前逐条 `safeParse`，畸形记录跳过+计数，合法记录原样应用（未知字段零丢失）。
- **上传守卫**：全新设备（从未同步 + 本地记录 < 云端）阻断上传，防清空云端（R1）。
- **导入格式守卫**：ZIP 导入检测 v6 同步格式 → 提示用同步导入，防静默丢图（R2）。
- **哈希确定性**：`buildPayload` images 键排序，避免同数据跨设备哈希漂移（R4）。
- **去重/死代码清理**：`collectAll` 收集助手、`dayKey` 单源、`MergeSeparator` 去重、删 `rectsUnionCenter`/`AnyCard`。
- 依赖：新增 zod@4.1（锁 4.1）、TypeScript 5.3 → 5.6。

## 0.1.0 — 版本机制重置
- 从 8.x 重置为 `0.Y.Z`（开发期，MAJOR 恒 0，不发布正式版）；移除全部历史版本段。
