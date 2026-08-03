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

/** Resolve an outline item's `.dest` to a 1-based page number. */
export async function outlinePageNumber(
  doc: pdfjsLib.PDFDocumentProxy,
  item: PdfOutlineItem
): Promise<number | null> {
  try {
    const dest = await doc.getDestination(item.dest as never)
    if (dest && dest[0]) {
      return (await doc.getPageIndex(dest[0])) + 1
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
  const [leftPct, setLeftPct] = useState(0.55)
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
      startPct: leftPct
    }
    const mv = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const pct = d.startPct + (ev.clientX - d.startX) / rect.width
      setLeftPct(Math.max(0.3, Math.min(0.75, pct)))
    }
    const up = () => {
      dragRef.current = null
      document.removeEventListener("pointermove", mv)
      document.removeEventListener("pointerup", up)
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
  }, [leftPct])

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: the PDF */}
      <Box
        sx={{
          flex: `0 0 ${leftPct * 100}%`,
          minWidth: 0,
          display: "flex",
          flexDirection: "column"
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

      {/* Right: this PDF's cards (P2) */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 1,
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
