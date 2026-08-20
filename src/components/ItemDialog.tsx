import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  alpha
} from "@mui/material"
import { useCallback, useEffect, useState } from "react"

import type { DisplayCard } from "../types"
import { prettyUrl } from "../utils"
import CardRenderer, { typeIcon } from "./CardRenderer"

/** The card reader — a pure browse popup. Editing lives in the workspace
 *  (grid hover 编辑 → CardWorkspace), so this dialog has no edit mode. */
export default function ItemDialog({
  item,
  open,
  onClose,
  onNavigate,
  readOnly,
  hasPrev,
  hasNext
}: {
  item: DisplayCard | null
  open: boolean
  onClose: () => void
  onNavigate?: (direction: "prev" | "next") => void
  readOnly?: boolean
  hasPrev?: boolean
  hasNext?: boolean
}) {
  const [animDir, setAnimDir] = useState<"prev" | "next" | null>(null)
  const [copied, setCopied] = useState(false)

  const handleNavigate = useCallback(
    (dir: "prev" | "next") => {
      if (animDir || !onNavigate) return
      setAnimDir(dir)
      setTimeout(() => {
        onNavigate(dir)
        setAnimDir(null)
      }, 250)
    },
    [animDir, onNavigate]
  )

  // Left/right arrow keys drive prev/next navigation.
  useEffect(() => {
    if (!open || !onNavigate) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return
      const dir = e.key === "ArrowLeft" ? "prev" : "next"
      if (dir === "prev" ? !hasPrev : !hasNext) return
      e.preventDefault()
      handleNavigate(dir)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onNavigate, hasPrev, hasNext, handleNavigate])

  if (!item) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 1,
            height: "85vh",
            display: "flex",
            bgcolor: "background.paper"
          }
        }
      }}>
      <style>{`
        @keyframes dialogSlideOutLeft {
          to { opacity: 0; transform: translateX(-24px); }
        }
        @keyframes dialogSlideOutRight {
          to { opacity: 0; transform: translateX(24px); }
        }
        @keyframes dialogSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          py: 2.5,
          px: 3
        }}>
        {onNavigate && (
          <>
            <Tooltip title="上一条">
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleNavigate("prev")}
                  disabled={!hasPrev}
                  aria-label="上一条"
                  sx={{
                    color: "text.secondary",
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    p: 0.5,
                    "&:hover": { bgcolor: "action.selected", color: "primary.main" },
                    "&.Mui-disabled": { opacity: 0.5 }
                  }}>
                  <ChevronLeftRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="下一条">
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleNavigate("next")}
                  disabled={!hasNext}
                  aria-label="下一条"
                  sx={{
                    color: "text.secondary",
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    p: 0.5,
                    "&:hover": { bgcolor: "action.selected", color: "primary.main" },
                    "&.Mui-disabled": { opacity: 0.5 }
                  }}>
                  <ChevronRightRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            color: "text.disabled",
            ml: 0.5,
            flexShrink: 0
          }}>
          {typeIcon(item.type)}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.5} alignItems="center">
          {!item.pdfVocabularyCardId && <Tooltip title={copied ? "已复制" : "复制引用"}>
            <IconButton
              size="small"
              onClick={() => {
                const header = item.title ? `${item.title}\n\n` : ""
                const src = item.source?.url
                  ? `\n\n— ${item.source.title || prettyUrl(item.source.url)}`
                  : ""
                navigator.clipboard.writeText(
                  `${header}> ${item.content}${src}`
                )
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }}>
              {copied ? (
                <CheckRoundedIcon fontSize="small" />
              ) : (
                <ContentCopyRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>}
          <Tooltip title="关闭">
            <IconButton size="small" onClick={onClose}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 3,
          py: 3,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          animation: animDir
            ? `dialogSlideOut${animDir === "next" ? "Left" : "Right"} 0.25s ease-out forwards`
            : "none",
          "&::-webkit-scrollbar": {
            width: "8px"
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: "transparent"
          },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.2),
            borderRadius: 1,
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.text.primary, 0.3)
            }
          }
        }}>
        <Box
          key={item.id}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            animation: animDir ? "none" : "dialogSlideIn 0.25s ease-out"
          }}>
          <Box
            sx={{
              flex: 1,
              maxWidth: "680px",
              mx: "auto",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center"
            }}>
            <CardRenderer item={item} mode="full" />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
