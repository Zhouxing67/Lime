# 迁移：`idea` → `comment`（一次性）

背景：卡片备注字段由 `idea` 重命名为 `comment`（`PdfCard`/`ProjectCard`/`DisplayCard`）。旧数据里的 `idea` 键不会自动跟随。

## 执行方式（一次性，不进主逻辑）
在扩展的 **options 页面**（`edge://extensions` → 打开 Lime 的选项页）按 `F12` 打开 DevTools，把以下片段**粘贴到 Console 并回车**：

```js
// Run ONCE after updating to the comment-rename build.
const DB_NAME = "pickquote-db"
const open = indexedDB.open(DB_NAME)
open.onsuccess = () => {
  const db = open.result
  const migrate = (storeName) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite")
      const store = tx.objectStore(storeName)
      const req = store.openCursor()
      let n = 0
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return resolve(n)
        const rec = cur.value
        if (rec.idea !== undefined) {
          rec.comment = rec.idea
          delete rec.idea
          cur.update(rec)
          n++
        }
        cur.continue()
      }
      req.onerror = () => reject(req.error)
    })
  Promise.all(["pdfCards", "projectCards"].map(migrate))
    .then(([pc, pr]) =>
      console.log(`[migrate] idea→comment: pdfCards=${pc} projectCards=${pr}`)
    )
    .catch((e) => console.error("[migrate] failed:", e))
}
open.onerror = (e) => console.error("[migrate] open failed:", e)
```

预期输出：`[migrate] idea→comment: pdfCards=N projectCards=M`（N/M 为实际迁移条数）。

## 备注
- 导入链路（`jsonImport`）仍读取旧的 `idea` 键作为回退——即使没跑迁移，旧备份导入也能读到备注。
- 跑完后重载 options 页即可。
