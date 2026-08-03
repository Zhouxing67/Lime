import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, CircularProgress, IconButton, Typography } from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import { usePdfDocument } from "../hooks/usePdfDocument"
import PdfRenderer from "./PdfRenderer"

export type PdfOutlineItem = {
  title: string
  dest: unknown
  items?: PdfOutlineItem[]
}

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

/** Main-area PDF view: left = the PDF, right = its cards (P2). Draggable split. */
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
  // PDF pane keeps a FIXED share of the width (cards pane flexes to fill the
  // rest) — same structure as the working 50/50 layout. A flex:1 PDF pane lets
  // page content force its width, which caused the cards pane to cover the PDF.
  const [pdfPct, setPdfPct] = useState(0.78)
  const [scrollPage, setScrollPage] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null)

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
              whiteSpace: "nowrap"
            }}>
            {loaded?.file.name ?? "PDF"}
          </Typography>
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

      {/* Right: this PDF's cards (P2, flexes to fill) */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 1,
          borderLeft: "1px solid",
          borderColor: "divider",
          color: "text.disabled"
        }}>
        <PictureAsPdfRoundedIcon sx={{ fontSize: 48, opacity: 0.4 }} />
        <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
          该 PDF 的卡片将显示在这里
        </Typography>
      </Box>
    </Box>
  )
}
