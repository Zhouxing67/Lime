# DB 迁移递归 —— `tx()`/`withStore()` 在迁移内复用导致"数据丢失"

## 症状
升级后**整个应用空白，数据"全部丢失"**（实际是每次 DB 操作都挂起等待永不完成的 open）。

## 根因
一次性数据迁移（`migratePdfIdsIfNeeded`）在 `openDb` 的 onsuccess 里运行，但内部调用了 `tx()`/`withStore()` 辅助函数——它们会**再次调用 `openDb()`** → 触发 onupgradeneeded → 再次触发迁移 → **无限递归**。所有 DB 事务等待一个永不完成的 open → UI 空渲染 = 假"数据丢失"。

```ts
// ❌ 迁移内部用 tx() —— tx() 调 openDb() → 迁移 → tx() → openDb() → …
async function migratePdfIdsIfNeeded(db) {
  await tx("pdfs", "readwrite", ...)  // 递归！
}
```

## 修复
迁移必须用**已打开的 db 连接**直接开事务，绝不走 `tx()`/`withStore()`：

```ts
// ✅ 用 db.transaction（已打开的连接），绝不重新 openDb()
const idbTx = db.transaction(["pdfs", "pdfAnnotations", "pdfCards"], "readwrite")
```

（这正是 memory #205 的规则来源。）

## 通用教训
- 迁移/一次性初始化代码**永远不要调用会重开 DB 的辅助函数**（它们走 `openDb()` 主入口）
- 迁移要**幂等 + 标记守卫**（`_pdfIdMigrated`）
- "数据丢失"先怀疑递归/挂起，再怀疑真的删了——用日志确认事务是否完成
