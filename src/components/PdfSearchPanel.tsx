import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded"
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded"
import {
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  TextField,
  Typography
} from "@mui/material"
import { useState } from "react"
import { useTheme } from "@mui/material/styles"
import { usePanelDragResize } from "../hooks/usePanelDragResize"

import type { PdfSearchEntry } from "./pdfText"
import EmptyState from "./EmptyState"

/** Right-sidebar search panel (InkLayer-style): a results list whose unit is a
 *  TEXT LINE, grouped by page, with case/whole-word options that re-search
 *  immediately. */
export default function PdfSearchPanel({
  width,
  onWidthChange,
  query,
  caseSensitive,
  wholeWord,
  entries,
  loading,
  currentIndex,
  onOptionsChange,
  onSearch,
  onEntryClick,
  onNav,
  onBack
}: {
  width: number
  onWidthChange: (w: number) => void
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  entries: PdfSearchEntry[]
  loading: boolean
  currentIndex: number
  onOptionsChange: (
    opts: { caseSensitive: boolean; wholeWord: boolean },
    query: string
  ) => void
  onSearch: (query: string) => void
  onEntryClick: (index: number) => void
  onNav: (dir: 1 | -1) => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState(query)
  const theme = useTheme()

  const startDrag = usePanelDragResize(width, onWidthChange, () => 2000)

  // Group entries by page, preserving the first-hit order.
  const byPage: { page: number; items: { entry: PdfSearchEntry; index: number }[] }[] = []
  const pageIndex = new Map<number, number>()
  entries.forEach((entry, index) => {
    let gi = pageIndex.get(entry.page)
    if (gi === undefined) {
      gi = byPage.length
      pageIndex.set(entry.page, gi)
      byPage.push({ page: entry.page, items: [] })
    }
    byPage[gi].items.push({ entry, index })
  })

  return (
    <Paper
      elevation={0}
      sx={{
        width,
        height: "100%",
        borderRadius: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper"
      }}>
      <Box
        onPointerDown={startDrag}
        sx={{
          position: "absolute",
          left: -4,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "col-resize",
          zIndex: 10
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          minHeight: 40,
          borderBottom: "1px solid",
          borderColor: "divider"
        }}>
        <Typography
          onClick={onBack}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            fontSize: "0.72rem",
            color: "text.secondary",
            cursor: "pointer",
            "&:hover": { color: "primary.main" },
            flexShrink: 0
          }}>
          <ArrowBackRoundedIcon sx={{ fontSize: 14 }} />
          摘录
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "text.secondary" }}>
          搜索
        </Typography>
        <Box sx={{ flex: 1 }} />
      </Box>

      <Box sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="搜索 PDF 全文…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch(draft)
          }}
          InputProps={{
            endAdornment: loading ? (
              <CircularProgress size={13} />
            ) : (
              <SearchRoundedIcon
                sx={{ fontSize: 16, color: "text.disabled", cursor: "pointer" }}
                onClick={() => onSearch(draft)}
              />
            )
          }}
          sx={{
            "& .MuiOutlinedInput-root": { borderRadius: 1, fontSize: "0.8rem" }
          }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.75 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={caseSensitive}
                onChange={(e) =>
                  onOptionsChange(
                    { caseSensitive: e.target.checked, wholeWord },
                    draft
                  )
                }
                sx={{ p: 0.25 }}
              />
            }
            label={<Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>大小写敏感</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={wholeWord}
                onChange={(e) =>
                  onOptionsChange(
                    { caseSensitive, wholeWord: e.target.checked },
                    draft
                  )
                }
                sx={{ p: 0.25 }}
              />
            }
            label={<Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>全字匹配</Typography>}
          />
        </Box>
      </Box>

      {entries.length > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1.5,
            py: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider"
          }}>
          <Typography
            sx={{ fontSize: "0.68rem", color: "text.disabled" }}>
            {currentIndex + 1} / {entries.length}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <Box
              onClick={() => onNav(-1)}
              title="上一个结果"
              sx={{
                display: "flex",
                color: "text.secondary",
                cursor: "pointer",
                px: 0.5,
                "&:hover": { color: "primary.main" }
              }}>
              <KeyboardArrowUpRoundedIcon sx={{ fontSize: 17 }} />
            </Box>
            <Box
              onClick={() => onNav(1)}
              title="下一个结果"
              sx={{
                display: "flex",
                color: "text.secondary",
                cursor: "pointer",
                px: 0.5,
                "&:hover": { color: "primary.main" }
              }}>
              <KeyboardArrowDownRoundedIcon sx={{ fontSize: 17 }} />
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 1 }}>
        {entries.length === 0 ? (
          <EmptyState
            icon={<SearchRoundedIcon sx={{ fontSize: 28 }} />}
            title={query ? "没有匹配结果" : "搜索全文"}
            subtitle={query ? "换个关键词试试" : "输入关键词后回车搜索"}
          />
        ) : (
          byPage.map(({ page, items }) => (
            <Box key={page} sx={{ mb: 1.5 }}>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  color: "text.disabled",
                  mb: 0.5
                }}>
                第 {page} 页（{items.length}）
              </Typography>
              {items.map(({ entry: e, index: globalIndex }) => {
                const active = globalIndex === currentIndex
                return (
                  <Box
                    key={`${e.page}-${e.start}`}
                    onClick={() => onEntryClick(globalIndex)}
                    sx={{
                      p: 1,
                      mb: 0.5,
                      borderRadius: 1,
                      cursor: "pointer",
                      bgcolor: active ? "action.selected" : "transparent",
                      border: "1px solid",
                      borderColor: active ? "primary.main" : "transparent",
                      "&:hover": { bgcolor: active ? "action.selected" : "action.hover" }
                    }}>
                    <Box
                      sx={{
                        fontSize: "0.78rem",
                        lineHeight: 1.45,
                        color: "text.primary",
                        wordBreak: "break-all"
                      }}>
                      {(() => {
                        const from = Math.max(0, e.hitInLine - 10)
                        const hitStart = e.hitInLine - from
                        const hitLen = Math.max(1, e.end - e.start)
                        return (
                          <>
                            {e.snippet.slice(0, hitStart)}
                            <Box
                              component="span"
                              sx={{
                                bgcolor: theme.custom.searchHit,
                                color: theme.custom.searchHitText,
                                borderRadius: 0.5,
                                px: 0.25
                              }}>
                              {e.snippet.slice(hitStart, hitStart + hitLen) || e.snippet}
                            </Box>
                            {e.snippet.slice(hitStart + hitLen)}
                          </>
                        )
                      })()}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ))
        )}
      </Box>
    </Paper>
  )
}
