import { useEffect, useMemo, useState } from "react"
import { createPdfiumDirectEngine as createPdfiumEngine } from "@embedpdf/engines"
import { createPluginRegistration } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/dist/react/index"
import { DocumentManagerPluginPackage, DocumentContent } from "@embedpdf/plugin-document-manager/dist/react/index"
import { ViewportPluginPackage, Viewport } from "@embedpdf/plugin-viewport/dist/react/index"
import { ScrollPluginPackage, Scroller } from "@embedpdf/plugin-scroll/dist/react/index"
import { RenderPluginPackage, RenderLayer } from "@embedpdf/plugin-render/dist/react/index"
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/dist/react/index"
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/dist/react/index"

import { listPdfs, getPdf } from "~/src/database"

export default function PdfPoc2() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [engine, setEngine] = useState<Awaited<ReturnType<typeof createPdfiumEngine>> | null>(null)
  const [error, setError] = useState("")

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
        const buf = await pdf.bytes.arrayBuffer()
        const blob = new Blob([buf], { type: "application/pdf" })
        const url = URL.createObjectURL(blob)
        setPdfUrl(url)
        console.log("[poc2] loading pdfium engine…")
        const eng = await createPdfiumEngine(
          chrome.runtime.getURL("assets/pdfium/pdfium.wasm")
        )
        console.log("[poc2] engine ready")
        setEngine(eng)
      } catch (e) {
        console.error("[poc2] failed:", e)
        setError((e as Error)?.message ?? "加载失败")
      }
    })()
  }, [])

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: pdfUrl
          ? [
              {
                url: pdfUrl,
                name: "poc2",
                mode: "full-fetch"
              }
            ]
          : []
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage)
    ],
    [pdfUrl]
  )

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "#c00" }}>
        {error}
      </div>
    )
  }
  if (!engine || !pdfUrl) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        加载 PDFium 引擎…
      </div>
    )
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId ? (
            <div style={{ flex: 1, overflow: "auto", background: "#525659" }}>
              <DocumentContent documentId={activeDocumentId}>
                {({ isLoaded }) =>
                  isLoaded ? (
                    <Viewport documentId={activeDocumentId}>
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ width, height, pageIndex }) => (
                          <div
                            style={{
                              width,
                              height,
                              position: "relative",
                              margin: "8px auto",
                              background: "#fff",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
                            }}>
                            <RenderLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                          </div>
                        )}
                      />
                    </Viewport>
                  ) : (
                    <div style={{ padding: 24, color: "#fff" }}>加载文档…</div>
                  )
                }
              </DocumentContent>
            </div>
          ) : null
        }
      </EmbedPDF>
    </div>
  )
}
