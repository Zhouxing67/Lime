import { Box } from "@mui/material"

import type { PdfCard } from "../types"
import { MARK_LABEL } from "./pdfTheme"
import MarkdownRenderer from "./MarkdownRenderer"

/** Unified PDF-card body: a compact type/page marker + the editable `idea`
 *  note. The annotation's content (quote / frame image) is deliberately NOT
 *  displayed — the PDF page itself shows it; the card is a management marker. */
export default function PdfCardBody({
  item,
  maxLines
}: {
  item: PdfCard
  maxLines?: number
}) {
  const showIdea = !!item.idea
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.6,
          fontSize: "0.72rem",
          color: "text.secondary",
          mb: showIdea ? 1.25 : 0
        }}>
        <Box
          sx={{
            px: 0.75,
            py: 0.15,
            borderRadius: 1,
            bgcolor: "action.hover",
            flexShrink: 0
          }}>
          {MARK_LABEL[item.type] ?? item.type}
        </Box>
        <Box component="span" sx={{ flexShrink: 0 }}>
          P{item.page}
        </Box>
        {!showIdea && (
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            阅读批注 · 点击跳转
          </Box>
        )}
      </Box>
      {showIdea && (
        <Box>
          {/* The note is the user's own content — always fully visible. */}
          <MarkdownRenderer content={item.idea!} maxLines={maxLines} />
        </Box>
      )}
    </Box>
  )
}
