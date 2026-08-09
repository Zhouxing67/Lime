import {
  Box,
  IconButton,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import CodeRoundedIcon from "@mui/icons-material/CodeRounded"
import FormatBoldRoundedIcon from "@mui/icons-material/FormatBoldRounded"
import FormatItalicRoundedIcon from "@mui/icons-material/FormatItalicRounded"
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded"
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded"
import FormatQuoteRoundedIcon from "@mui/icons-material/FormatQuoteRounded"
import FunctionsRoundedIcon from "@mui/icons-material/FunctionsRounded"
import ImageRoundedIcon from "@mui/icons-material/ImageRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded"
import TitleRoundedIcon from "@mui/icons-material/TitleRounded"
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded"
import { useMemo, useRef, useState } from "react"

import MarkdownRenderer from "./MarkdownRenderer"
import {
  insertMarkdownSyntax,
  type MarkdownTool
} from "../utils/markdownEditor"

export type { MarkdownTool }

const TOOL_TIPS: Record<MarkdownTool, string> = {
  bold: "加粗",
  italic: "斜体",
  heading: "标题",
  ulist: "无序列表",
  olist: "有序列表",
  quote: "引用",
  code: "行内代码",
  link: "链接",
  image: "图片",
  table: "表格",
  formula: "公式"
}

const TOOLS: { tool: MarkdownTool; icon: JSX.Element }[] = [
  { tool: "bold", icon: <FormatBoldRoundedIcon fontSize="small" /> },
  { tool: "italic", icon: <FormatItalicRoundedIcon fontSize="small" /> },
  { tool: "heading", icon: <TitleRoundedIcon fontSize="small" /> },
  { tool: "ulist", icon: <FormatListBulletedRoundedIcon fontSize="small" /> },
  { tool: "olist", icon: <FormatListNumberedRoundedIcon fontSize="small" /> },
  { tool: "quote", icon: <FormatQuoteRoundedIcon fontSize="small" /> },
  { tool: "code", icon: <CodeRoundedIcon fontSize="small" /> },
  { tool: "link", icon: <LinkRoundedIcon fontSize="small" /> },
  { tool: "image", icon: <ImageRoundedIcon fontSize="small" /> },
  { tool: "table", icon: <TableChartRoundedIcon fontSize="small" /> },
  { tool: "formula", icon: <FunctionsRoundedIcon fontSize="small" /> }
]

/** Inline markdown editor: a MUI toolbar + a code TextField + a live preview
 *  rendered by the SAME MarkdownRenderer the cards use (edit = what the card
 *  will show). Split view by default, toggle to preview-only. */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 6,
  dense = false
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  dense?: boolean
}) {
  const [mode, setMode] = useState<"split" | "preview">("split")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const applyTool = (tool: MarkdownTool) => {
    const el = inputRef.current
    if (!el) return
    const { text, cursor } = insertMarkdownSyntax(
      value,
      el.selectionStart ?? value.length,
      el.selectionEnd ?? value.length,
      tool
    )
    onChange(text)
    // Restore focus + place the cursor after the insert.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const preview = useMemo(() => {
    if (mode !== "split") return null
    return (
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: 2,
          py: 1.5,
          borderLeft: "1px solid",
          borderColor: "divider",
          overflow: "auto",
          maxHeight: dense ? 300 : 420,
          fontSize: "0.9rem"
        }}>
        {value.trim() ? (
          <MarkdownRenderer content={value} />
        ) : (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            预览将显示在右侧
          </Typography>
        )}
      </Box>
    )
  }, [mode, value, dense])

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          flexWrap: "wrap",
          px: 0.5,
          py: 0.25,
          border: "1px solid",
          borderColor: "divider",
          borderBottom: "none",
          borderTopLeftRadius: 1,
          borderTopRightRadius: 1,
          bgcolor: "background.paper"
        }}>
        {TOOLS.map(({ tool, icon }) => (
          <Tooltip key={tool} title={TOOL_TIPS[tool]}>
            <IconButton
              size="small"
              onClick={() => applyTool(tool)}
              sx={{
                p: 0.5,
                color: "text.secondary",
                "&:hover": { color: "primary.main", bgcolor: "action.hover" }
              }}>
              {icon}
            </IconButton>
          </Tooltip>
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={mode === "split" ? "仅预览" : "分栏编辑"}>
          <IconButton
            size="small"
            onClick={() => setMode(mode === "split" ? "preview" : "split")}
            sx={{
              p: 0.5,
              color: mode === "split" ? "primary.main" : "text.secondary"
            }}>
            <ViewWeekRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        sx={{
          display: "flex",
          border: "1px solid",
          borderColor: "divider",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 1,
          borderBottomRightRadius: 1
        }}>
        {mode !== "preview" && (
          <TextField
            inputRef={inputRef}
            multiline
            minRows={minRows}
            fullWidth
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            variant="standard"
            sx={{
              flex: 1,
              minWidth: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.85rem",
              "& .MuiInputBase-root": { p: 1.5 },
              "& .MuiInputBase-root::before, & .MuiInputBase-root::after": {
                display: "none"
              }
            }}
          />
        )}
        {preview}
      </Box>
    </Box>
  )
}
