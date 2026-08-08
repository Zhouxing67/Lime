import { Box } from "@mui/material"

import type { PdfCard } from "../types"
import MarkdownRenderer from "./MarkdownRenderer"

/** Unified PDF-card body: the editable `comment` note (+ a compact affordance hint
 *  when empty). The annotation's content / type / page are deliberately NOT
 *  shown — the order chip + the PDF page itself carry that info. */
export default function PdfCardBody({
  item,
  maxLines
}: {
  item: PdfCard
  maxLines?: number
}) {
  const showComment = !!item.comment
  if (!showComment) {
    return (
      <Box
        sx={{
          fontSize: "0.7rem",
          color: "text.disabled",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
        阅读批注 · 点击跳转
      </Box>
    )
  }
  return (
    <Box>
      {/* The note is the user's own content — always fully visible. */}
      <MarkdownRenderer content={item.comment!} maxLines={maxLines} />
    </Box>
  )
}
