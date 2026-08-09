import { Box, Button, Typography } from "@mui/material"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import { useState } from "react"

import CardEditorView, {
  type CardEditorValues
} from "./CardEditorView"
import type { DisplayCard } from "../types"

/** The workspace card mode — VIEW (read the full card), EDIT (type-driven
 *  editor) and CREATE (blank text/image editor) share one workspace surface
 *  like the PDF reader. Save/save-draft/discard return to the grid. */
export default function CardWorkspace({
  view,
  card,
  onClose,
  onSave,
  onSaveDraft,
  onDiscard
}: {
  view: "edit" | "create"
  card: DisplayCard | null
  onClose: () => void
  onSave: (values: CardEditorValues, type: "text" | "image" | "placed") => void
  onSaveDraft: (values: CardEditorValues, type: "text" | "image" | "placed") => void
  onDiscard: () => void
}) {
  const [createType, setCreateType] = useState<"text" | "image">("text")

  const headerTitle =
    view === "create"
      ? "新建卡片"
      : view === "edit"
        ? "编辑卡片"
        : "查看卡片"

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0
        }}>
        {view === "create" && (
          <Box
            sx={{
              display: "flex",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden"
            }}>
            {(["text", "image"] as const).map((t) => (
              <Box
                key={t}
                onClick={() => setCreateType(t)}
                sx={{
                  px: 1.2,
                  py: 0.4,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  userSelect: "none",
                  color: createType === t ? "primary.main" : "text.secondary",
                  bgcolor: createType === t ? "action.selected" : "transparent",
                  fontWeight: createType === t ? 600 : 400,
                  "&:hover": { bgcolor: "action.hover" }
                }}>
                {t === "text" ? "文本" : "图片"}
              </Box>
            ))}
          </Box>
        )}
        <Typography sx={{ fontSize: "0.85rem", color: "text.secondary" }}>
          {headerTitle}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          color="inherit"
          startIcon={<CloseRoundedIcon fontSize="small" />}
          onClick={onClose}>
          关闭
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", py: 2 }}>
        {view === "edit" && card ? (
          <CardEditorView
            type={card.type === "placed" ? "placed" : card.type === "image" ? "image" : "text"}
            mode="edit"
            initial={{
              title: card.title,
              content: card.content,
              image: card.image,
              comment: card.comment
            }}
            readonlyImage={card.image}
            readonlyText={card.type === "placed" && !card.image ? card.content : undefined}
            onSave={(v) =>
              onSave(
                v,
                card.type === "placed"
                  ? "placed"
                  : card.type === "image"
                    ? "image"
                    : "text"
              )
            }
            onSaveDraft={(v) =>
              onSaveDraft(
                v,
                card.type === "placed"
                  ? "placed"
                  : card.type === "image"
                    ? "image"
                    : "text"
              )
            }
            onDiscard={onDiscard}
          />
        ) : view === "create" ? (
          <CardEditorView
            type={createType}
            mode="create"
            initial={{}}
            onSave={(v) => onSave(v, createType)}
            onSaveDraft={(v) => onSaveDraft(v, createType)}
            onDiscard={onDiscard}
          />
        ) : null}
      </Box>
    </Box>
  )
}
