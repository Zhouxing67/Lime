import { Box, TextField, Typography } from "@mui/material"

import ImageUrlInput from "./ImageUrlInput"

export default function DialogEditMode({
  draftTitle,
  draftContent,
  draftIdea,
  imageOnly,
  onTitleChange,
  onContentChange,
  onIdeaChange
}: {
  draftTitle: string
  draftContent: string
  draftIdea: string
  /** Image cards (web/PDF capture): content is a data-URL — show it read-only
   *  and edit the idea (备注) instead of raw base64 text. */
  imageOnly?: boolean
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onIdeaChange: (v: string) => void
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
      {imageOnly ? (
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
            补充说明（支持 Markdown）
          </Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={draftIdea}
            onChange={(e) => onIdeaChange(e.target.value)}
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
