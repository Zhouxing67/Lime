import { Box, TextField, Typography } from "@mui/material"
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react"

import MarkdownEditor, { type EditorView } from "./MarkdownEditor"
import {
  insertMarkdownSyntax,
  type MarkdownTool
} from "../utils/markdownEditor"

export interface CardEditorValues {
  title?: string
  content?: string
  image?: string
  comment?: string
}

export interface CardEditorHandle {
  applyTool: (tool: MarkdownTool) => void
  getValues: () => CardEditorValues
}

/** The type-driven card editor — mirrors the full-mode section layout. Each
 *  editable markdown field is a MarkdownEditor (input + preview); the toolbar
 *  lives in the workspace's top bar and inserts into the last-focused field.
 *  Actions (save/draft/discard) live in the workspace's ActionBar. */
const CardEditorView = forwardRef<CardEditorHandle, {
  type: "text" | "image" | "placed"
  mode: "create" | "edit"
  initial: CardEditorValues
  view: EditorView
  onDirtyChange?: (dirty: boolean) => void
  onFocusChange?: (focused: boolean) => void
  readonlyImage?: string
  readonlyText?: string
}>(function CardEditorView(
  {
    type,
    mode,
    initial,
    view,
    onDirtyChange,
    onFocusChange,
    readonlyImage,
    readonlyText
  },
  ref
) {
  const [title, setTitle] = useState(initial.title ?? "")
  const [content, setContent] = useState(initial.content ?? "")
  const [image, setImage] = useState(initial.image ?? "")
  const [comment, setComment] = useState(initial.comment ?? "")
  const fileRef = useRef<HTMLInputElement>(null)

  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [activeField, setActiveField] = useState<"content" | "comment">(
    type === "text" ? "content" : "comment"
  )
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    setTitle(initial.title ?? "")
    setContent(initial.content ?? "")
    setImage(initial.image ?? "")
    setComment(initial.comment ?? "")
    setActiveField(type === "text" ? "content" : "comment")
  }, [initial.title, initial.content, initial.image, initial.comment, type])

  const values = useMemo<CardEditorValues>(
    () => ({ title, content, image, comment }),
    [title, content, image, comment]
  )

  // Dirty: any edit diverging from the initial (saved) values.
  useEffect(() => {
    const dirty =
      (title ?? "") !== (initial.title ?? "") ||
      (content ?? "") !== (initial.content ?? "") ||
      (image ?? "") !== (initial.image ?? "") ||
      (comment ?? "") !== (initial.comment ?? "")
    onDirtyChange?.(dirty)
  }, [title, content, image, comment, initial, onDirtyChange])

  useImperativeHandle(
    ref,
    () => ({
      applyTool: (tool: MarkdownTool) => {
        const el = markdownInputRef.current
        if (!el) return
        const value = activeField === "comment" ? comment : content
        const setter = activeField === "comment" ? setComment : setContent
        const { text, cursor } = insertMarkdownSyntax(
          value,
          el.selectionStart ?? value.length,
          el.selectionEnd ?? value.length,
          tool
        )
        setter(text)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(cursor, cursor)
        })
      },
      getValues: () => values
    }),
    [activeField, content, comment, values]
  )

  const sectionHeader = (label: string) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
      <Typography
        sx={{
          color: "text.secondary",
          fontSize: "0.75rem",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap"
        }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, borderTop: "1px solid", borderColor: "divider" }} />
    </Box>
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
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        px: 3,
        py: 2,
        display: "flex",
        flexDirection: "column",
        overflow: "auto"
      }}>
      {/* title-style 摘要: 20px/600 + single bottom hairline, no label */}
      <TextField
        fullWidth
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="未命名卡片"
        variant="standard"
        sx={{
          "& .MuiInputBase-root": {
            fontSize: "1.25rem",
            fontWeight: 600,
            fontFamily: (t) => t.custom.serif
          },
          "& .MuiInputBase-root::before": {
            borderBottom: "1px solid",
            borderColor: "divider"
          },
          "& .MuiInputBase-root:hover:not(.Mui-disabled)::before": {
            borderBottomColor: "text.secondary"
          }
        }}
      />

      {type === "text" && (
        <>
          {sectionHeader("内容")}
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              view={view}
              autoFocus
              registerRef={(el) => {
                markdownInputRef.current = el
              }}
              onFocusChange={(f) => {
                setFocused(f)
                onFocusChange?.(f)
                if (f) setActiveField("content")
              }}
            />
          </Box>
        </>
      )}

      {(type === "image" || type === "placed") && (
        <>
          {sectionHeader("只读原始内容")}
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
          {sectionHeader("备注")}
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <MarkdownEditor
              value={comment}
              onChange={setComment}
              view={view}
              registerRef={(el) => {
                markdownInputRef.current = el
              }}
              onFocusChange={(f) => {
                setFocused(f)
                onFocusChange?.(f)
                if (f) setActiveField("comment")
              }}
            />
          </Box>
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
    </Box>
  )
})

export default CardEditorView
