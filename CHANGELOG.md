# Changelog

## Unreleased

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
