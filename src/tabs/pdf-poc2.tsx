import { useEffect, useMemo, useState } from "react"
import { init } from "@embedpdf/pdfium"
import { PdfiumNative, PdfEngine, browserImageDataToBlobConverter } from "@embedpdf/engines"
import { createPluginRegistration } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/react"
import { DocumentManagerPluginPackage, DocumentContent } from "@embedpdf/plugin-document-manager/react"
import { ViewportPluginPackage, Viewport } from "@embedpdf/plugin-viewport/react"
import { ScrollPluginPackage, Scroller } from "@embedpdf/plugin-scroll/react"
import { RenderPluginPackage, RenderLayer } from "@embedpdf/plugin-render/react"
import { SelectionPluginPackage, SelectionLayer } from "@embedpdf/plugin-selection/react"
import { InteractionManagerPluginPackage, PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react"

import { listPdfs, getPdf } from "~/src/database"

export default function PdfPoc2() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [engine, setEngine] = useState<PdfEngine | null>(null)
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
        const wasmRes = await fetch(
          chrome.runtime.getURL("assets/pdfium/pdfium.wasm")
        )
        const wasmBinary = await wasmRes.arrayBuffer()
        // `locateFile` avoids the Emscripten glue's `new URL(...)` branch —
        // Parcel rewrites it to a broken `new URL(C(...))` (C is not a function).
        const pdfiumModule = await init({
          wasmBinary,
          locateFile: () => "pdfium.wasm"
        })
        const native = new PdfiumNative(pdfiumModule)
        const eng = new PdfEngine(native, {
          imageConverter: browserImageDataToBlobConverter
        })
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

  useEffect(() => {
    if (!engine || !pdfUrl) return
    console.log("[poc2] engine + doc ready, state:", {
      pdfUrl: pdfUrl.slice(0, 60)
    })
    ;(window as any).__poc2Engine = engine
    // Direct openDocument test — isolates whether the ENGINE can parse the PDF.
    void (async () => {
      try {
        const doc = await engine
          .openDocumentUrl({ url: pdfUrl, id: "poc2-direct" })
          .toPromise()
        console.log("[poc2] engine.openDocumentUrl OK:", {
          pageCount: doc.pageCount,
          id: doc.id
        })
      } catch (e) {
        console.error("[poc2] engine.openDocumentUrl FAILED:", e)
      }
    })()
  }, [engine, pdfUrl])

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
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={async (registry) => {
          console.log("[poc2] registry ready")
          ;(window as any).__poc2Registry = registry
          const state = (registry as any)["store"]?.getState?.()
          const core = state?.core
          console.log(
            "[poc2] core state:",
            JSON.stringify({
              activeDocumentId: core?.activeDocumentId,
              documentOrder: core?.documentOrder,
              docKeys: core?.documents ? Object.keys(core.documents) : null
            })
          )
        }}>
        {({ activeDocumentId }) => {
          const reg = (window as any).__poc2Registry
          if (activeDocumentId && reg) {
            const core = reg["store"]?.getState?.().core
            console.log(
              "[poc2] state on active:",
              JSON.stringify({
                activeDocumentId,
                docStatus: core?.documents?.[activeDocumentId]?.status,
                docKeys: core?.documents ? Object.keys(core.documents) : null
              })
            )
          }
          console.log("[poc2] activeDocumentId:", activeDocumentId)
          return activeDocumentId ? (
            <div style={{ flex: 1, overflow: "auto", background: "#525659" }}>
              <DocumentContent documentId={activeDocumentId}>
                {({ documentState, isLoading, isError, isLoaded }) => {
                  console.log("[poc2] DocumentContent state:", {
                    status: documentState?.status,
                    isLoading,
                    isError,
                    isLoaded
                  })
                  return isLoaded ? (
                    <Viewport documentId={activeDocumentId}>
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ width, height, pageIndex }) => {
                          if (pageIndex === 0) {
                            console.log("[poc2] renderPage:", {
                              pageIndex,
                              width,
                              height
                            })
                          }
                          return (
                            <div
                              style={{
                                width,
                                height,
                                position: "relative",
                                margin: "8px auto",
                                background: "#fff",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
                              }}>
                              <PagePointerProvider
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                style={{ position: "absolute", inset: 0 }}>
                                <RenderLayer
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                  style={{ width: "100%", height: "100%" }}
                                />
                                <SelectionLayer
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                />
                              </PagePointerProvider>
                            </div>
                          )
                        }}
                      />
                    </Viewport>
                  ) : (
                    <div style={{ padding: 24, color: "#fff" }}>加载文档…</div>
                  )
                }}
              </DocumentContent>
            </div>
          ) : null
        }}
      </EmbedPDF>
    </div>
  )
}
