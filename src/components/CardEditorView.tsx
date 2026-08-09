import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material"
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded"
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded"
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded"
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
  /** The image can be uploaded/replaced (create + a draft image card). */
  imageEditable?: boolean
}>(function CardEditorView(
  {
    type,
    mode,
    initial,
    view,
    onDirtyChange,
    onFocusChange,
    onPageChange,
    imageEditable
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
  // The image pages (readonly/upload + edit) exist when the image is
  // changeable: the create-image, and the draft of an image card.
  const showImagePages =
    (mode === "create" && type === "image") ||
    (mode === "edit" && imageEditable && type === "image")
  const [editorPage, setEditorPage] = useState<"edit" | "readonly">(
    mode === "create" && type === "image" ? "readonly" : "edit"
  )
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
      {/* Title row: 摘要 (flex:1) + the image-page toggle (right, same row) —
          the title's underline is the only divider to the editor below. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TextField
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="未命名卡片"
          variant="standard"
          sx={{
            flex: 1,
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
        {showImagePages && (
          <Box
            sx={{
              display: "flex",
              flexShrink: 0,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "background.paper"
            }}>
            <Tooltip title="只读">
              <IconButton
                size="small"
                onClick={() => handlePageChange("readonly")}
                sx={{
                  p: 0.5,
                  borderRadius: 0,
                  color: editorPage === "readonly" ? "primary.main" : "text.secondary",
                  bgcolor: editorPage === "readonly" ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" }
                }}>
                <VisibilityRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="编辑">
              <IconButton
                size="small"
                onClick={() => handlePageChange("edit")}
                sx={{
                  p: 0.5,
                  borderRadius: 0,
                  color: editorPage === "edit" ? "primary.main" : "text.secondary",
                  bgcolor: editorPage === "edit" ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" }
                }}>
                <EditNoteRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {type === "text" && (
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
      )}

      {(type === "image" || type === "placed") && (
        <>
          {showImagePages && (
            <>
              {editorPage === "readonly" && (
                <Box
                  sx={{
                    position: "relative",
                    flex: 1,
                    minHeight: 0,
                    border: "1.5px dashed",
                    borderColor: (t) => t.custom.borderStrong,
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.disabled",
                    cursor: "pointer",
                    overflow: "hidden",
                    "&:hover": { borderColor: "primary.main", color: "primary.main" }
                  }}
                  onClick={() => fileRef.current?.click()}>
                  {image ? (
                    <>
                      <img
                        src={image}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "contain"
                        }}
                      />
                      <Box
                        sx={{
                          position: "absolute",
                          bottom: 8,
                          left: "50%",
                          transform: "translateX(-50%)",
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          bgcolor: "background.paper",
                          color: "text.secondary",
                          fontSize: "0.75rem",
                          boxShadow: (t) => t.custom.cardShadow
                        }}>
                        点击更换图片
                      </Box>
                    </>
                  ) : (
                    <>
                      <AddPhotoAlternateRoundedIcon />
                      <Typography variant="caption">点击上传图片</Typography>
                    </>
                  )}
                </Box>
              )}
            </>
          )}

          {(!showImagePages || editorPage === "edit") && (
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
