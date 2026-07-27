import { Box, TextField, Typography } from "@mui/material"

import ImageUrlInput from "./ImageUrlInput"

export default function DialogEditMode({
  draftTitle,
  draftContent,
  draftImages,
  onTitleChange,
  onContentChange,
  onImagesChange
}: {
  draftTitle: string
  draftContent: string
  draftImages: string[]
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onImagesChange: (v: string[]) => void
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
        图片
      </Typography>
      <ImageUrlInput images={draftImages} onChange={onImagesChange} />
    </Box>
  )
}