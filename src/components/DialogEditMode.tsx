import { Box, TextField, Typography } from "@mui/material"

import ImageUrlInput from "./ImageUrlInput"

export default function DialogEditMode({
  draftTitle,
  draftContent,
  draftComment,
  readOnlyContent,
  isImage,
  onTitleChange,
  onContentChange,
  onCommentChange
}: {
  draftTitle: string
  draftContent: string
  draftComment: string
  /** Content is read-only (PDF-sourced cards): render it read-only and edit the
   *  comment (备注) instead — content is the PDF original (text quote or frame). */
  readOnlyContent?: boolean
  /** The read-only content is a data-URL image (web/PDF image captures). */
  isImage?: boolean
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onCommentChange: (v: string) => void
}) {
  return (
    <Box
      sx={{
        flex: 1,
        maxWidth: "680px",
        mx: "auto",
        width: "100%",
        display: "flex",
        flexDirection: "column"
      }}>
      <TextField
        fullWidth
        placeholder="卡片标题…"
        value={draftTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: 1,
            fontSize: "1rem",
            bgcolor: "background.paper"
          }
        }}
      />
      {readOnlyContent && isImage ? (
        <>
          <Box
            sx={{
              mb: 2,
              borderRadius: 1,
              overflow: "hidden",
              border: "1px solid",
              borderColor: "divider"
            }}>
            <img
              src={draftContent}
              alt=""
              style={{ display: "block", maxWidth: "100%", height: "auto" }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
            备注（支持 Markdown）
          </Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={draftComment}
            onChange={(e) => onCommentChange(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 1,
                fontSize: "1rem",
                bgcolor: "background.paper"
              }
            }}
          />
        </>
      ) : readOnlyContent ? (
        <>
          <Box
            sx={{
              mb: 2,
              borderLeft: "3px solid",
              borderLeftColor: "primary.main",
              bgcolor: (t) => `rgba(${t.palette.primary.main}, 0.04)`,
              borderRadius: 1,
              px: 2,
              py: 1.5,
              maxHeight: 240,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.9rem",
              color: "text.primary"
            }}>
            {draftContent}
          </Box>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
            原文引用（只读）· 备注（支持 Markdown）
          </Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={draftComment}
            onChange={(e) => onCommentChange(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 1,
                fontSize: "1rem",
                bgcolor: "background.paper"
              }
            }}
          />
        </>
      ) : (
        <>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={draftContent}
            onChange={(e) => onContentChange(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 1,
                fontSize: "1rem",
                bgcolor: "background.paper"
              }
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", mt: 2, mb: 0.5, display: "block" }}>
            图片（插入到内容）
          </Typography>
          <ImageUrlInput content={draftContent} onContentChange={onContentChange} />
        </>
      )}
    </Box>
  )
}
