import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import { Box, IconButton, TextField } from "@mui/material"
import { useState } from "react"

import {
  appendMarkdownImage,
  extractMarkdownImages,
  removeMarkdownImage
} from "../utils"

interface ImageUrlInputProps {
  /** The Markdown content text; images live inside it as `![alt](url)` tokens. */
  content: string
  onContentChange: (next: string) => void
}

/**
 * Image input bound to the card's Markdown content. Pasting a URL appends an
 * image token to the content; the thumbnail grid is derived live from the
 * content, and removing an image strips its token.
 */
export default function ImageUrlInput({
  content,
  onContentChange
}: ImageUrlInputProps) {
  const [draft, setDraft] = useState("")
  const images = extractMarkdownImages(content)

  const add = () => {
    const url = draft.trim()
    setDraft("")
    if (!url || images.includes(url)) return
    onContentChange(appendMarkdownImage(content, url))
  }

  const remove = (url: string) => {
    onContentChange(removeMarkdownImage(content, url))
  }

  return (
    <Box sx={{ width: "100%" }}>
      <TextField
        fullWidth
        size="small"
        placeholder="粘贴图片 URL，回车插入到内容"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 1,
            fontSize: "0.9rem"
          }
        }}
      />

      {images.length > 0 && (
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            gap: 1
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
