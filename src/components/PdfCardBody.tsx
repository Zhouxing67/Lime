import { Box } from "@mui/material"
import { alpha } from "@mui/material/styles"

import type { Item } from "../types"
import MarkdownRenderer from "./MarkdownRenderer"

/** Unified PDF-card body: the read-only `content` (text → quote block,
 *  image → contained) + the editable `idea` note below. */
export default function PdfCardBody({
  item,
  maxLines
}: {
  item: Item
  maxLines?: number
}) {
  const showIdea = !!item.idea
  return (
    <Box>
      {item.type === "image" ? (
        <Box
          sx={{
            borderRadius: 1,
            bgcolor: "#f5f4f2",
            display: "flex",
            justifyContent: "center",
            p: 0.5,
            mb: showIdea ? 1.5 : 0
          }}>
          <Box
            component="img"
            src={item.content}
            alt=""
            loading="lazy"
            sx={{
              maxWidth: "100%",
              maxHeight: 160,
              objectFit: "contain",
              display: "block"
            }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            borderLeft: "3px solid",
            borderColor: "primary.main",
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            borderRadius: 0.5,
            px: 1.5,
            py: 1,
            mb: showIdea ? 1.5 : 0
          }}>
          <MarkdownRenderer content={item.content} maxLines={maxLines} />
        </Box>
      )}
      {showIdea && (
        <Box sx={{ mt: item.type === "image" ? 1.5 : 0 }}>
          {/* The note is the user's own content — always fully visible. */}
          <MarkdownRenderer content={item.idea!} />
        </Box>
      )}
    </Box>
  )
}
