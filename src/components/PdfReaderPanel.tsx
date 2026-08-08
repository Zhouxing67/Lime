import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
import { Box, Divider, Tooltip, Typography } from "@mui/material"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"
import type { PdfOutlineItem } from "../types"

const THUMB_WIDTH = 200

function OutlineTree({
  item,
  depth,
  onSelect,
  collapsedKeys,
  onToggleKey
}: {
  item: PdfOutlineItem
  depth: number
  onSelect: (item: PdfOutlineItem) => void
  collapsedKeys: Set<string>
  onToggleKey: (key: string) => void
}) {
  const key = item.title + String(item.dest)
  const hasChildren = !!item.items?.length
  const collapsed = collapsedKeys.has(key)
  return (
    <>
      <Box
        onClick={() => onSelect(item)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          pl: 1 + depth * 1.25,
          pr: 1,
          py: 0.5,
          borderRadius: 1,
          cursor: "pointer",
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover", color: "text.primary" }
        }}>
        {hasChildren ? (
          <Box
            component="span"
            onClick={(e) => {
              e.stopPropagation()
              onToggleKey(key)
            }}
            sx={{
              display: "inline-flex",
              color: "text.disabled",
              cursor: "pointer",
              "&:hover": { color: "text.secondary" }
            }}>
            {collapsed ? (
              <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
            ) : (
              <ExpandMoreRoundedIcon sx={{ fontSize: 14 }} />
            )}
          </Box>
        ) : (
          <Box component="span" sx={{ width: 14 }} />
        )}
        <Typography
          variant="body2"
          sx={{
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
          {item.title}
        </Typography>
      </Box>
      {!collapsed &&
        item.items?.map((child) => (
          <OutlineTree
            key={child.title + String(child.dest)}
            item={child}
            depth={depth + 1}
            onSelect={onSelect}
            collapsedKeys={collapsedKeys}
            onToggleKey={onToggleKey}
          />
        ))}
    </>
  )
}

function collectTocKeys(items: PdfOutlineItem[]): string[] {
  const keys: string[] = []
  const walk = (list: PdfOutlineItem[]) => {
    for (const it of list) {
      keys.push(it.title + String(it.dest))
      if (it.items) walk(it.items)
    }
  }
  walk(items)
  return keys
}

/** A single lazy thumbnail: renders the page at a small width when visible.
 *  Memoized — only the page's `current` state re-renders it on page changes. */
const PdfThumb = memo(function PdfThumb({
  doc,
  pageNo,
  current,
  onJump
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNo: number
  current: boolean
  onJump: (page: number) => void
}) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const ro = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ro.disconnect()
          let cancelled = false
          ;(async () => {
            const page = await doc.getPage(pageNo)
            const vp1 = page.getViewport({ scale: 1 })
            const scale = THUMB_WIDTH / vp1.width
            const viewport = page.getViewport({ scale })
            if (cancelled) return
            const canvas = canvasRef.current
            if (!canvas) return
            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            setSize({ w: canvas.width, h: canvas.height })
            await page.render({
              canvas,
              viewport
            }).promise
          })().catch(() => {
            /* aborted / failed thumbnail — leave blank */
          })
          return () => {
            cancelled = true
          }
        }
      },
      { rootMargin: "120px" }
    )
    ro.observe(holder)
    return () => ro.disconnect()
  }, [doc, pageNo])

  return (
    <Box
      ref={holderRef}
      onClick={() => onJump(pageNo)}
      title={`第 ${pageNo} 页`}
      sx={{
        mb: 1,
        borderRadius: 1,
        border: "1px solid",
        borderColor: current ? "primary.main" : "transparent",
        cursor: "pointer",
        padding: 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: current ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" }
      }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size?.w ?? 0,
          height: size?.h ?? 0,
          background: "#fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
          borderRadius: 1
        }}
      />
    </Box>
  )
})

/** The reader navigation panel: TOC | thumbnails, collapsible, left of the PDF. */
export default function PdfReaderPanel({
  outline,
  doc,
  currentPage,
  onOutlineClick,
  onJumpPage
}: {
  outline: PdfOutlineItem[] | null
  doc: pdfjsLib.PDFDocumentProxy | null
  currentPage: number
  onOutlineClick: (item: PdfOutlineItem) => void
  onJumpPage: (page: number) => void
}) {
  const [tab, setTab] = useState<"toc" | "thumbs">("toc")
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const toggleKey = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        minHeight: 0
      }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 0.5, py: 0.5, gap: 0.5 }}>
        {(["toc", "thumbs"] as const).map((t) => (
          <Box
            key={t}
            onClick={() => setTab(t)}
            sx={{
              flex: 1,
              textAlign: "center",
              py: 0.35,
              borderRadius: 1,
              fontSize: "0.72rem",
              cursor: "pointer",
              bgcolor: tab === t ? "action.selected" : "transparent",
              color: tab === t ? "primary.main" : "text.secondary",
              "&:hover": { bgcolor: "action.hover" }
            }}>
            {t === "toc" ? "目录" : "缩略图"}
          </Box>
        ))}
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", px: 0.5, py: 0.5, minHeight: 0 }}>
        {tab === "toc" ? (
          outline && outline.length > 0 ? (
            <>
              <Box sx={{ display: "flex", justifyContent: "flex-end", px: 0.5 }}>
                <Tooltip title={collapsedKeys.size > 0 ? "全部展开" : "全部折叠"}>
                  <Box
                    onClick={() =>
                      collapsedKeys.size > 0
                        ? setCollapsedKeys(new Set())
                        : setCollapsedKeys(new Set(collectTocKeys(outline)))
                    }
                    sx={{
                      display: "flex",
                      color: "text.disabled",
                      cursor: "pointer",
                      px: 0.5,
                      mb: 0.25,
                      "&:hover": { color: "text.primary" }
                    }}>
                    {collapsedKeys.size > 0 ? (
                      <UnfoldMoreRoundedIcon sx={{ fontSize: 15 }} />
                    ) : (
                      <UnfoldLessRoundedIcon sx={{ fontSize: 15 }} />
                    )}
                  </Box>
                </Tooltip>
              </Box>
              {outline.map((item) => (
                <OutlineTree
                  key={item.title + String(item.dest)}
                  item={item}
                  depth={0}
                  onSelect={onOutlineClick}
                  collapsedKeys={collapsedKeys}
                  onToggleKey={toggleKey}
                />
              ))}
            </>
          ) : (
            <Box sx={{ px: 1, py: 2, fontSize: "0.72rem", color: "text.disabled" }}>
              此 PDF 没有目录
            </Box>
          )
        ) : doc ? (
          Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
            <PdfThumb
              key={n}
              doc={doc}
              pageNo={n}
              current={n === currentPage}
              onJump={onJumpPage}
            />
          ))
        ) : (
          <Box sx={{ px: 1, py: 2, fontSize: "0.72rem", color: "text.disabled" }}>
            加载中…
          </Box>
        )}
      </Box>
    </Box>
  )
}
