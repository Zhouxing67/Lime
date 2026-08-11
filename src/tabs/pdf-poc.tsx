import { useEffect, useState } from "react"
import { PdfAnnotator } from "~/src/pdf/inklayer/features/annotator"

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
        PoC — {name}（选区→高亮/下划线/删除线；缩放后 mark 应对齐；onSave 输出到 console）
      </div>
      <PdfAnnotator
        title={name}
        data={bytes}
        user={{ id: "poc", name: "PoC" }}
        onSave={(anns) => console.log("[poc] onSave", JSON.stringify(anns))}
        layoutStyle={{ width: "100%", height: "calc(100vh - 40px)" }}
      />
    </div>
  )
}
