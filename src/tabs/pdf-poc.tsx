import { useEffect, useState } from "react"
import PdfEngineView from "~/src/components/PdfEngineView"

import { listPdfs, getPdf } from "~/src/database"

export default function PdfPoc() {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const cssLink = document.createElement("link")
    cssLink.rel = "stylesheet"
    cssLink.href = chrome.runtime.getURL("assets/pdfjs/pdf_viewer.css")
    document.head.append(cssLink)
    return () => cssLink.remove()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const all = await listPdfs()
        if (all.length === 0) {
          setError("无 PDF，请先在主应用导入一个 PDF")
          return
        }
        const pdf = await getPdf(all[0].id)
        if (!pdf?.bytes) {
          setError(`PDF ${all[0].name} 没有文件字节（placeholder）`)
          return
        }
        setBytes(await pdf.bytes.arrayBuffer())
        setName(all[0].name)
      } catch (e) {
        setError((e as Error)?.message ?? "加载失败")
      }
    })()
  }, [])

  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>

  if (!bytes) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>加载中…</div>

  return (
    <div style={{ height: "100vh" }}>
      <div style={{ padding: "8px 16px", fontFamily: "sans-serif", fontSize: 13 }}>
        PoC — {name}（顶部工具条 = 我们的 MUI；选文字 → 弹出 MUI 选择栏；缩放对齐应正确）
      </div>
      <div style={{ width: "100%", height: "calc(100vh - 40px)" }}>
        <PdfEngineView
          data={bytes}
          onAnnotationAdd={(a) => console.log("[poc] add", a.id, a.type)}
          onAnnotationDelete={(id) => console.log("[poc] del", id)}
          onAnnotationChanged={(a) => console.log("[poc] changed", a.id)}
        />
      </div>
    </div>
  )
}
