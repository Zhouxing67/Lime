import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import { Box, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material"
import { useState } from "react"

interface ImageUrlInputProps {
  images: string[]
  onChange: (next: string[]) => void
  /** Visual density: floating content panel needs a compact mode. */
  compact?: boolean
}

export default function ImageUrlInput({ images, onChange, compact = false }: ImageUrlInputProps) {
  const [draft, setDraft] = useState("")

  const add = () => {
    const url = draft.trim()
    if (!url || images.includes(url)) {
      setDraft("")
      return
    }
    onChange([...images, url])
    setDraft("")
  }

  const remove = (url: string) => {
    onChange(images.filter((u) => u !== url))
  }

  const thumbSize = compact ? 56 : 84
  const cols = compact ? "60px 1fr" : "1fr auto"

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr auto" : "1fr",
          gap: 0.5
        }}>
        <TextField
          fullWidth
          size={compact ? "small" : "small"}
          placeholder="粘贴图片 URL，回车添加"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          sx={{
            gridArea: "1 / 1",
            "& .MuiOutlinedInput-root": { borderRadius: 1, fontSize: compact ? "0.85rem" : "0.9rem" }
          }}
        />
        {compact && (
          <IconButton size="small" onClick={add} disabled={!draft.trim()} color="primary">
            <AddRoundedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {images.length > 0 && (
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
            gap: compact ? 0.5 : 1
          }}>
          {images.map((url) => (
            <Box
              key={url}
              sx={{
                position: "relative",
                borderRadius: 1,
                overflow: "hidden",
                aspectRatio: "1 / 1",
                bgcolor: "action.hover",
                border: "1px solid",
                borderColor: "divider"
              }}>
              <img
                src={url}
                alt=""
                loading="lazy"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block"
                }}
              />
              <IconButton
                size="small"
                onClick={() => remove(url)}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  bgcolor: "rgba(0,0,0,0.45)",
                  color: "common.white",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                  p: 0.3,
                  "& .MuiSvgIcon-root": { fontSize: "0.85rem" }
                }}>
                <CloseRoundedIcon />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}