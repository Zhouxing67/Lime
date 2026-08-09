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
import Well from "./Well"
import {
  insertMarkdownSyntax,
  type MarkdownTool
} from "../utils/markdownEditor"
import { flowPdfQuote } from "../utils"

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
  onPageChange?: (page: "edit" | "readonly") => void
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
    onPageChange,
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
  const [editorPage, setEditorPage] = useState<"edit" | "readonly">("edit")
  const handlePageChange = (p: "edit" | "readonly") => {
    setEditorPage(p)
    onPageChange?.(p)
  }

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

  // A full-width surface2 band between the editable regions — the strong
  // boundary (no labels; the placeholders carry the region meaning).
  const sectionGap = (
    <Box
      sx={{
        height: 10,
        mx: -3,
        bgcolor: (t) => t.custom.surface2,
        borderTop: "1px solid",
        borderBottom: "1px solid",
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
          {sectionGap}
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              view={view}
              autoFocus
              placeholder="在此处输入文本卡片内容，支持 Markdown 与公式"
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
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Box
              sx={{
                display: "flex",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden"
              }}>
              {(["readonly", "edit"] as const).map((p) => (
                <Box
                  key={p}
                  onClick={() => handlePageChange(p)}
                  sx={{
                    px: 1.2,
                    py: 0.4,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    userSelect: "none",
                    color: editorPage === p ? "primary.main" : "text.secondary",
                    bgcolor: editorPage === p ? "action.selected" : "transparent",
                    "&:hover": { bgcolor: "action.hover" }
                  }}>
                  {p === "readonly" ? "只读" : "编辑"}
                </Box>
              ))}
            </Box>
          </Box>

          {editorPage === "readonly" ? (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column"
              }}>
              {mode === "create" && type === "image" ? (
                <Box
                  onClick={() => fileRef.current?.click()}
                  sx={{
                    flex: 1,
                    border: "1.5px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    color: "text.disabled",
                    cursor: "pointer",
                    "&:hover": {
                      borderColor: "primary.main",
                      color: "primary.main"
                    }
                  }}>
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain"
                      }}
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
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: (t) => t.custom.surface2,
                    borderRadius: 1,
                    p: 1,
                    overflow: "hidden"
                  }}>
                  <img
                    src={readonlyImage}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain"
                    }}
                  />
                </Box>
              ) : readonlyText ? (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center"
                  }}>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      width: "100%",
                      maxWidth: "60ch",
                      my: 2,
                      p: 2,
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      color: "text.primary",
                      fontSize: "0.95rem",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}>
                    <Box
                      sx={{
                        width: 3,
                        alignSelf: "stretch",
                        borderRadius: 1,
                        bgcolor: "primary.main",
                        flexShrink: 0
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>{flowPdfQuote(readonlyText)}</Box>
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: (t) => t.custom.surface2,
                    borderRadius: 1
                  }}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.disabled" }}>
                    此处显示卡片原始内容
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <>
              {sectionGap}
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column"
                }}>
                <MarkdownEditor
                  value={comment}
                  onChange={setComment}
                  view={view}
                  placeholder="在此处输入卡片备注…"
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
