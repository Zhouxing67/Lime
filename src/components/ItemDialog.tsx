import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip
} from "@mui/material"
import { useEffect, useState } from "react"

import type { Item } from "../types"
import { prettyUrl } from "../utils"
import CardRenderer from "./CardRenderer"
import DialogEditMode from "./DialogEditMode"
import ImageUrlInput from "./ImageUrlInput"

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
  const [draftImages, setDraftImages] = useState<string[]>(item.images ?? [])

  useEffect(() => {
    setEditing(false)
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftImages(item.images ?? [])
  }, [item.id])

  const [animDir, setAnimDir] = useState<"prev" | "next" | null>(null)

  const handleSave = async () => {
    const images = draftImages.map((u) => u.trim()).filter(Boolean)
    const updated: Item = {
      ...item,
      title: draftTitle.trim() || undefined,
      content: draftContent,
      ...(images.length > 0 ? { images } : {})
    }
    if (onSave) await onSave(updated)
    setEditing(false)
  }

  const handleCancel = () => {
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftImages(item.images ?? [])
    setEditing(false)
  }

  const handleNavigate = (dir: "prev" | "next") => {
    if (animDir || !onNavigate) return
    setAnimDir(dir)
    setTimeout(() => {
      onNavigate(dir)
      setAnimDir(null)
    }, 250)
  }

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
      {onNavigate && (
        <>
          <IconButton
            onClick={() => handleNavigate("prev")}
            disabled={!hasPrev}
            sx={{
              position: "fixed",
              left: 24,
              top: "50%",
              "&.Mui-disabled": { opacity: 0.3 },
              transform: "translateY(-50%)",
              zIndex: (theme) => theme.zIndex.modal + 1,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 2,
              "&:hover": { bgcolor: "action.hover" }
            }}>
            <ChevronLeftRoundedIcon sx={{ fontSize: 28 }} />
          </IconButton>
          <IconButton
            onClick={() => handleNavigate("next")}
            disabled={!hasNext}
            sx={{
              position: "fixed",
              right: 24,
              top: "50%",
              "&.Mui-disabled": { opacity: 0.3 },
              transform: "translateY(-50%)",
              zIndex: (theme) => theme.zIndex.modal + 1,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 2,
              "&:hover": { bgcolor: "action.hover" }
            }}>
            <ChevronRightRoundedIcon sx={{ fontSize: 28 }} />
          </IconButton>
        </>
      )}
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
          justifyContent: "flex-end",
          gap: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          py: 2.5,
          px: 3
        }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {!readOnly && (editing ? (
            <>
              <Tooltip title="保存">
                <IconButton size="small" onClick={handleSave} color="primary">
                  <CheckRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="取消">
                <IconButton size="small" onClick={handleCancel}>
                  <CloseRoundedIcon fontSize="small" />
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
                navigator.clipboard.writeText(`${header}> ${item.content}${src}`)
              }}>
              <ContentCopyRoundedIcon fontSize="small" />
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
            ? `dialogSlideOut${animDir === "next" ? "Left" : "Right"} 0.2s ease-in forwards`
            : "none",
          "&::-webkit-scrollbar": {
            width: "8px"
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: "transparent"
          },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: (theme) =>
              theme.palette.mode === "light"
                ? "rgba(45, 52, 54, 0.2)"
                : "rgba(232, 230, 227, 0.2)",
            borderRadius: "8px",
            "&:hover": {
              bgcolor: (theme) =>
                theme.palette.mode === "light"
                  ? "rgba(45, 52, 54, 0.3)"
                  : "rgba(232, 230, 227, 0.3)"
            }
          }
        }}>
        <Box key={item.id} sx={{ flex: 1, display: "flex", flexDirection: "column", animation: animDir ? "none" : "dialogSlideIn 0.25s ease-out" }}>
          {editing ? (
            <DialogEditMode
              draftTitle={draftTitle}
              draftContent={draftContent}
              draftImages={draftImages}
              onTitleChange={setDraftTitle}
              onContentChange={setDraftContent}
              onImagesChange={setDraftImages}
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
