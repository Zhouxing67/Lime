import { Box, TextField } from "@mui/material"

export default function DialogEditMode({
  draftTitle,
  draftContent,
  onTitleChange,
  onContentChange
}: {
  draftTitle: string
  draftContent: string
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
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
    </Box>
  )
}
