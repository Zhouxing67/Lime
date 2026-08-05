import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import UndoRoundedIcon from "@mui/icons-material/UndoRounded"
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  alpha
} from "@mui/material"
import { useCallback, useEffect, useState } from "react"

import type { Item } from "../types"
import { prettyUrl } from "../utils"
import CardRenderer, { typeIcon } from "./CardRenderer"
import DialogEditMode from "./DialogEditMode"

export default function ItemDialog({
  item,
  open,
  onClose,
  onSave,
  onNavigate,
  readOnly,
  hasPrev,
  hasNext
}: {
  item: Item | null
  open: boolean
  onClose: () => void
  onSave?: (updated: Item) => void | Promise<void>
  onNavigate?: (direction: "prev" | "next") => void
  readOnly?: boolean
  hasPrev?: boolean
  hasNext?: boolean
}) {
  if (!item) return null

  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(item.title ?? "")
  const [draftContent, setDraftContent] = useState(item.content)
  const [draftIdea, setDraftIdea] = useState(item.idea ?? "")

  useEffect(() => {
    setEditing(false)
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftIdea(item.idea ?? "")
  }, [item.id])

  const [animDir, setAnimDir] = useState<"prev" | "next" | null>(null)

  const handleSave = async () => {
    // PDF-sourced cards keep their content read-only (the PDF original);
    // only the idea (备注) is editable. Same for image captures.
    const readOnlyContent = item.type === "image" || !!item.pdfRef
    const updated: Item = {
      ...item,
      title: draftTitle.trim() || undefined,
      content: readOnlyContent ? item.content : draftContent,
      idea: readOnlyContent ? draftIdea.trim() || undefined : item.idea
    }
    if (onSave) await onSave(updated)
    setEditing(false)
  }

  const handleCancel = () => {
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftIdea(item.idea ?? "")
    setEditing(false)
  }

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

  // Left/right arrow keys drive prev/next navigation. The listener is scoped
  // to the open dialog, skips text inputs (so cursor movement in edit mode
  // isn't hijacked), and the animDir guard throttles rapid key presses.
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
            <IconButton
              size="small"
              onClick={() => handleNavigate("prev")}
              disabled={!hasPrev}
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
            <IconButton
              size="small"
              onClick={() => handleNavigate("next")}
              disabled={!hasNext}
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
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: "1rem",
            fontWeight: 600,
            fontFamily: (t) => t.custom.serif,
            color: "text.primary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
          {item.title || "未命名卡片"}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {!readOnly &&
            (editing ? (
              <>
                <Tooltip title="保存">
                  <IconButton size="small" onClick={handleSave} color="primary">
                    <CheckRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="取消">
                  <IconButton size="small" onClick={handleCancel}>
                    <UndoRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="编辑">
                <IconButton size="small" onClick={() => setEditing(true)}>
                  <EditRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ))}
          <Tooltip title="复制引用">
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
              }}>
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
          {editing ? (
            <DialogEditMode
              draftTitle={draftTitle}
              draftContent={draftContent}
              draftIdea={draftIdea}
              readOnlyContent={item.type === "image" || !!item.pdfRef}
              isImage={item.type === "image"}
              onTitleChange={setDraftTitle}
              onContentChange={setDraftContent}
              onIdeaChange={setDraftIdea}
            />
          ) : (
            <Box
              onDoubleClick={(e) => {
                if (readOnly) return
                if ((e.target as HTMLElement).closest("a")) return
                setEditing(true)
              }}
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
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
