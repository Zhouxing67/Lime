# 迁移：卡片类型模型 v2（`link` 移除 + image 卡 content→image）

背景：卡片类型从 `"text" | "image" | "link"` 规范为 `"text" | "image" | "placed"`。
- `link` 类型被移除（text 覆盖）——**存量 link 卡片数据删除**
- image 卡的 dataURL 从 `content` 字段迁到新的只读 `image` 字段 + 重算 hash

## 执行方式（一次性，不进主逻辑）
在扩展的 **options 页面**（`edge://extensions` → 打开 Lime 的选项页）按 `F12` 打开 DevTools，把以下片段**粘贴到 Console 并回车**：

```js
// Run ONCE after updating to the card-type-v2 build.
const DB_NAME = "pickquote-db"
const enc = new TextEncoder()
const sha256 = async (s) => {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
const itemHash = (content, url, images) => {
  const imgs = images && images.length ? "\u0000" + images.join("\n") : ""
  return sha256(`${url}|${content}${imgs}`)
}

const open = indexedDB.open(DB_NAME)
open.onsuccess = async () => {
  const db = open.result
  const readAll = (storeName) =>
    new Promise((resolve, reject) => {
      const out = []
      const tx = db.transaction(storeName, "readonly")
      const req = tx.objectStore(storeName).openCursor()
      req.onsuccess = () => {
        const c = req.result
        if (c) { out.push(c.value); c.continue() } else resolve(out)
      }
      req.onerror = () => reject(req.error)
    })

  const cards = await readAll("projectCards")
  const toDelete = []
  const toPut = []
  for (const card of cards) {
    if (card.type === "link") {
      toDelete.push(card.id) // 产品决策：link 类型移除，存量删除
    } else if (
      card.type === "image" &&
      !card.image &&
      typeof card.content === "string" &&
      card.content.startsWith("data:image")
    ) {
      const image = card.content
      const url = card.source?.url ?? ""
      card.content = ""
      card.image = image
      card.hash = await itemHash(image, url, card.images)
      toPut.push(card)
    }
  }

  if (toDelete.length > 0 || toPut.length > 0) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("projectCards", "readwrite")
      const store = tx.objectStore("projectCards")
      for (const id of toDelete) store.delete(id)
      for (const card of toPut) store.put(card)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
  console.log(
    `[migrate] card-type v2: linkDeleted=${toDelete.length} imageMigrated=${toPut.length}`
  )
}
open.onerror = (e) => console.error("[migrate] open failed:", e)
```

预期输出：`[migrate] card-type v2: linkDeleted=N imageMigrated=M`（N/M 为实际处理条数）。

## 备注
- 跑完后重载 options 页即可。
- 即使不跑迁移：旧 link 卡会被导入校验拒绝（直接丢弃）、旧 image 卡渲染有 legacy 回退（`content` 当图显示）——但新模型的一致性需要跑一次。
