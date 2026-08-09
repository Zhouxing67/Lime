import { Box } from "@mui/material"

import { flowPdfQuote } from "../utils"

/** The reading-style quote card for PDF-sourced text (placed cards): a 60ch
 *  column on a soft background with the primary accent bar at the text height.
 *  flowPdfQuote reflows the PDF extraction (hyphenation rejoin + per-line
 *  breaks → spaces, paragraphs kept) so the quote reads as a natural paragraph.
 */
export default function PdfQuoteCard({
  text,
  maxLines
}: {
  text: string
  maxLines?: number
}) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        width: "100%",
        p: 2,
        bgcolor: "action.hover",
        borderRadius: 1,
        color: "text.primary",
        fontSize: "0.95rem",
        lineHeight: 1.6,
        fontFamily: (t) => t.custom.serif,
        wordBreak: "break-word"
      }}>
      <Box
        sx={{
          width: 3,
          alignSelf: "stretch",
          borderRadius: 1,
          bgcolor: "primary.main",
          flexShrink: 0
        }}
      />
      <Box
        sx={{
          minWidth: 0,
          whiteSpace: maxLines ? "normal" : "pre-wrap",
          ...(maxLines
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }
            : {})
        }}>
        {flowPdfQuote(text)}
      </Box>
    </Box>
  )
}
