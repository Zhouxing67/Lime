import {
  Box,
  Button,
  TextField,
  Typography
} from "@mui/material"
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded"
import { useEffect, useRef, useState } from "react"

import MarkdownEditor from "./MarkdownEditor"

export interface CardEditorValues {
  title?: string
  content?: string
  image?: string
  comment?: string
}

/** The type-driven card editor — mirrors the full-mode section layout. Each
 *  editable markdown field is a MarkdownEditor (toolbar + live preview via the
 *  same renderer the cards use). Used by both the workspace EDIT and CREATE. */
export default function CardEditorView({
  type,
  mode,
  initial,
  readonlyImage,
  readonlyText,
  onSave,
  onSaveDraft,
  onDiscard
}: {
  type: "text" | "image" | "placed"
  mode: "create" | "edit"
  initial: CardEditorValues
  /** EDIT: the readonly original display (image card → the image; placed →
   *  the resolved crop or the PDF quote). CREATE(image): the upload zone. */
  readonlyImage?: string
  readonlyText?: string
  onSave: (values: CardEditorValues) => void
  onSaveDraft: (values: CardEditorValues) => void
  onDiscard: () => void
}) {
  const [title, setTitle] = useState(initial.title ?? "")
  const [content, setContent] = useState(initial.content ?? "")
  const [image, setImage] = useState(initial.image ?? "")
  const [comment, setComment] = useState(initial.comment ?? "")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(initial.title ?? "")
    setContent(initial.content ?? "")
    setImage(initial.image ?? "")
    setComment(initial.comment ?? "")
  }, [initial.title, initial.content, initial.image, initial.comment])

  const values: CardEditorValues = { title, content, image, comment }

  const sectionLabel = (label: string) => (
    <Typography
      variant="caption"
      sx={{
        color: "text.secondary",
        fontSize: "0.75rem",
        letterSpacing: "0.05em",
        mb: 0.5,
        display: "block"
      }}>
      {label}
    </Typography>
  )

  const divider = (
    <Box
      sx={{
        my: 2.5,
        borderTop: "1px solid",
        borderColor: "divider"
      }}
    />
  )

  const handlePickImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", width: "100%", px: 2 }}>
      {sectionLabel("摘要")}
      <TextField
        fullWidth
        placeholder="卡片标题（可选）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        variant="standard"
        sx={{
          "& .MuiInputBase-root": { fontSize: "1.25rem" },
          "& .MuiInputBase-root::before": { display: "none" }
        }}
      />

      {type === "text" && (
        <>
          {divider}
          {sectionLabel("内容")}
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="支持 Markdown 与公式…"
          />
        </>
      )}

      {(type === "image" || type === "placed") && (
        <>
          {divider}
          {sectionLabel("只读原始内容")}
          {mode === "create" && type === "image" ? (
            <Box
              onClick={() => fileRef.current?.click()}
              sx={{
                border: "1.5px dashed",
                borderColor: "divider",
                borderRadius: 1,
                p: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                color: "text.disabled",
                cursor: "pointer",
                "&:hover": { borderColor: "primary.main", color: "primary.main" }
              }}>
              {image ? (
                <img
                  src={image}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain" }}
                />
              ) : (
                <>
                  <AddPhotoAlternateRoundedIcon />
                  <Typography variant="caption">点击上传图片</Typography>
                </>
              )}
            </Box>
          ) : readonlyImage ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                p: 1,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "action.hover"
              }}>
              <img
                src={readonlyImage}
                alt=""
                style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain" }}
              />
            </Box>
          ) : readonlyText ? (
            <Box
              sx={{
                pl: 2,
                borderLeft: "4px solid",
                borderLeftColor: "primary.main",
                color: "text.secondary",
                fontSize: "0.95rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}>
              {readonlyText}
            </Box>
          ) : null}

          {divider}
          {sectionLabel("备注")}
          <MarkdownEditor
            value={comment}
            onChange={setComment}
            placeholder="写下你的理解、批注或补充…"
            minRows={3}
            dense
          />
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handlePickImage(f)
          e.target.value = ""
        }}
      />

      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 3 }}>
        <Button size="small" color="inherit" onClick={onDiscard}>
          丢弃
        </Button>
        <Button size="small" onClick={() => onSaveDraft(values)}>
          存草稿
        </Button>
        <Button size="small" variant="contained" onClick={() => onSave(values)}>
          保存
        </Button>
      </Box>
    </Box>
  )
}
