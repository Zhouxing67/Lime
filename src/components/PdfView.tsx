import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, CircularProgress, IconButton, Typography } from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import {
  createRegionAnnotationCard,
  createTextAnnotationCard,
  deletePdfCard,
  getAnnotationsByPdf,
  getItemsByPdf
} from "../database"
import type { Item, PdfAnnotation, PdfMark } from "../types"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"
import { getTextLayer } from "./pdfRegistry"
import { textLayerOffsets } from "./pdfText"
import PdfRenderer from "./PdfRenderer"

export type PdfOutlineItem = {
  title: string
  dest: unknown
  items?: PdfOutlineItem[]
}

const TEXT_TOOLS: Exclude<PdfMark, "frame">[] = [
  "highlight",
  "underline",
  "wavy",
  "strike"
]

/** Resolve an outline item's `.dest` to a 1-based page number. Only named
 *  (string) dests need `getDestination`; array dests carry the page ref already. */
export async function outlinePageNumber(
  doc: pdfjsLib.PDFDocumentProxy,
  item: PdfOutlineItem
): Promise<number | null> {
  try {
    let dest = item.dest
    if (typeof dest === "string") {
      dest = (await doc.getDestination(dest)) ?? undefined
    }
    if (Array.isArray(dest) && dest.length > 0) {
      const pageRef = dest[0]
      if (pageRef) {
        return (await doc.getPageIndex(pageRef)) + 1
      }
    }
  } catch {}
  return null
}

/** Main-area PDF view: left = the PDF + annotation toolbar, right = its cards. */
export default function PdfView({
  pdfId,
  onClose,
  onOutlineLoaded,
  outlineDest
}: {
  pdfId: string | null
  onClose: () => void
  onOutlineLoaded?: (outline: PdfOutlineItem[] | null) => void
  outlineDest?: PdfOutlineItem | null
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [pdfPct, setPdfPct] = useState(0.78)
  const [scrollPage, setScrollPage] = useState<number | null>(null)
  const [flashAnnId, setFlashAnnId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [pdfCards, setPdfCards] = useState<Item[]>([])
  const [frameMode, setFrameMode] = useState(false)
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null)

  // Load this PDF's annotations + cards.
  const reloadPdfData = useCallback(async () => {
    if (!pdfId) return
    const [ann, cards] = await Promise.all([
      getAnnotationsByPdf(pdfId),
      getItemsByPdf(pdfId)
    ])
    setAnnotations(ann)
    setPdfCards(cards)
  }, [pdfId])

  useEffect(() => {
    reloadPdfData()
  }, [reloadPdfData])

  // Reflect annotation changes from other contexts (broadcast _dbpdf).
  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes._dbpdf) reloadPdfData()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [reloadPdfData])

  // Report the outline up so the sidebar can render the TOC.
  useEffect(() => {
    onOutlineLoaded?.(loaded ? (loaded.outline as PdfOutlineItem[]) : null)
  }, [loaded, onOutlineLoaded])

  // Resolve a sidebar TOC click into a scroll target.
  useEffect(() => {
    if (!outlineDest || !loaded) return
    let cancelled = false
    outlinePageNumber(loaded.doc, outlineDest).then((page) => {
      if (!cancelled && page) setScrollPage(page)
    })
    return () => {
      cancelled = true
    }
  }, [outlineDest, loaded])

  // Apply an annotation tool to the current text selection → auto-card.
  const handleTool = useCallback(
    async (type: Exclude<PdfMark, "frame">) => {
      if (!pdfId) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      const holder = sel.anchorNode?.parentElement?.closest?.(
        "[data-page]"
      ) as HTMLElement | null
      if (!holder) return
      const page = Number(holder.getAttribute("data-page"))
      const entry = getTextLayer(page)
      if (!entry) return
      const offsets = textLayerOffsets(entry.textLayer, sel)
      if (!offsets || offsets.end <= offsets.start) return
      const text = sel.toString().trim()
      if (!text) return
      try {
        await createTextAnnotationCard({
          pdfId,
          page,
          type,
          text,
          startOffset: offsets.start,
          endOffset: offsets.end
        })
        sel.removeAllRanges()
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create annotation failed:", e)
      }
    },
    [pdfId, reloadPdfData]
  )

  const handleCardClick = useCallback((card: Item) => {
    if (!card.pdfRef) return
    setScrollPage(card.pdfRef.page)
    setFlashAnnId(card.pdfRef.annotationId)
  }, [])

  const handleCardDelete = useCallback(async (card: Item) => {
    await deletePdfCard(card)
    // The write broadcasts _dbpdf → the storage listener reloads.
  }, [])

  // 框选 release → crop image → frame annotation + image card.
  const handleFrameRegion = useCallback(
    async (result: {
      page: number
      rects: { x: number; y: number; w: number; h: number }[]
      imageDataUrl: string
    }) => {
      if (!pdfId) return
      try {
        await createRegionAnnotationCard({
          pdfId,
          page: result.page,
          rects: result.rects,
          imageDataUrl: result.imageDataUrl
        })
        setFrameMode(false)
        setScrollPage(result.page)
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create region annotation failed:", e)
      }
    },
    [pdfId]
  )

  // Cards sorted by original position (page + annotation startOffset).
  const sortedCards = [...pdfCards].sort((a, b) => {
    const pa = a.pdfRef?.page ?? 0
    const pb = b.pdfRef?.page ?? 0
    if (pa !== pb) return pa - pb
    const annA = annotations.find(
      (x) => x.id === a.pdfRef?.annotationId
    )
    const annB = annotations.find((x) => x.id === b.pdfRef?.annotationId)
    return (annA?.startOffset ?? 0) - (annB?.startOffset ?? 0)
  })

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startPct: pdfPct
    }
    const mv = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || rect.width === 0) return
      // PDF pane is left-anchored: dragging the handle left narrows it.
      const pct = d.startPct + (ev.clientX - d.startX) / rect.width
      setPdfPct(Math.max(0.55, Math.min(0.92, pct)))
    }
    const up = () => {
      dragRef.current = null
      document.removeEventListener("pointermove", mv)
      document.removeEventListener("pointerup", up)
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
  }, [pdfPct])

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: the PDF (fixed share) */}
      <Box
        sx={{
          flex: `0 0 ${pdfPct * 100}%`,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
        {/* tool bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            minHeight: 40,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper"
          }}>
          <IconButton size="small" onClick={onClose} title="退出 PDF 视图">
            <ArrowBackRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.82rem",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 120
            }}>
            {loaded?.file.name ?? "PDF"}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {/* text annotation tools */}
          {TEXT_TOOLS.map((t) => (
            <Box
              key={t}
              // mousedown + preventDefault: clicking a toolbar button would
              // otherwise clear the text selection before the handler runs.
              onMouseDown={(e) => {
                e.preventDefault()
                handleTool(t)
              }}
              title={`选中文字后点此：${MARK_LABEL[t]}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                cursor: "pointer",
                color: "text.secondary",
                fontSize: "0.72rem",
                "&:hover": {
                  bgcolor: "action.hover",
                  color: "text.primary"
                }
              }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: MARK_DOT[t]
                }}
              />
              {MARK_LABEL[t]}
            </Box>
          ))}
          {/* 框选 */}
          <Box
            onClick={() => setFrameMode((f) => !f)}
            title="框选区域（公式/图表）→ 图片卡"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              cursor: "pointer",
              fontSize: "0.72rem",
              bgcolor: frameMode ? "action.selected" : "transparent",
              color: frameMode ? "text.primary" : "text.secondary",
              "&:hover": { bgcolor: "action.hover" }
            }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: 1,
                background: MARK_DOT.frame
              }}
            />
            {MARK_LABEL.frame}
          </Box>
          {/* jump to page */}
          <input
            type="number"
            min={1}
            max={loaded?.pageCount}
            placeholder="页码"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = Number((e.target as HTMLInputElement).value)
                if (
                  Number.isInteger(n) &&
                  n >= 1 &&
                  n <= (loaded?.pageCount ?? Infinity)
                ) {
                  setScrollPage(n)
                }
                ;(e.target as HTMLInputElement).value = ""
              }
            }}
            style={{
              width: 44,
              marginLeft: 4,
              padding: "3px 6px",
              fontSize: "0.72rem",
              border: "1px solid",
              borderColor: "rgba(0,0,0,0.12)",
              borderRadius: 4,
              outline: "none"
            }}
          />
        </Box>
        {error ? (
          <Box sx={{ p: 3, color: "error.main", fontSize: "0.85rem" }}>
            {error}
          </Box>
        ) : loaded ? (
          <PdfRenderer
            doc={loaded.doc}
            pageCount={loaded.pageCount}
            scrollTarget={scrollPage}
            annotations={annotations}
            flashAnnId={flashAnnId}
            onFlashDone={() => setFlashAnnId(null)}
            frameMode={frameMode}
            onFrameRegion={handleFrameRegion}
          />
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
            <CircularProgress size={28} />
          </Box>
        )}
      </Box>

      {/* Split handle */}
      <Box
        onPointerDown={startDrag}
        sx={{
          width: 4,
          cursor: "col-resize",
          bgcolor: "divider",
          "&:hover": { bgcolor: "primary.light" },
          flexShrink: 0
        }}
      />

      {/* Right: this PDF's cards, ordered by original position */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default"
        }}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "text.secondary",
            borderBottom: "1px solid",
            borderColor: "divider"
          }}>
          摘录卡片（{sortedCards.length}）
        </Box>
        {sortedCards.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              py: 6,
              color: "text.disabled"
            }}>
            <PictureAsPdfRoundedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
            <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
              在左侧选中文字后点标记，自动生成卡片
            </Typography>
          </Box>
        ) : (
          sortedCards.map((card) => {
            const ann = annotations.find(
              (x) => x.id === card.pdfRef?.annotationId
            )
            return (
              <Box
                key={card.id}
                onClick={() => handleCardClick(card)}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  cursor: "pointer",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" }
                }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.25
                  }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.68rem",
                      color: "text.disabled",
                      flexShrink: 0
                    }}>
                    P{card.pdfRef?.page}
                  </Typography>
                  {ann && (
                    <Typography
                      variant="caption"
                      sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                      {MARK_LABEL[ann.type]}
                    </Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCardDelete(card)
                    }}
                    sx={{ p: 0.25, color: "text.disabled" }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
                {card.type === "image" ? (
                  <Box
                    component="img"
                    src={card.content}
                    alt=""
                    sx={{
                      display: "block",
                      maxWidth: "100%",
                      maxHeight: 140,
                      borderRadius: 1,
                      objectFit: "contain",
                      bgcolor: "#f5f4f2"
                    }}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      color: "text.primary"
                    }}>
                    {card.content}
                  </Typography>
                )}
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}
