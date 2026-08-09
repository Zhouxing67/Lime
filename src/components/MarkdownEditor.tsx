import { Fragment, useMemo, useRef, useState } from "react"
import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material"
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
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"

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

const TOOL_ICONS: Record<MarkdownTool, JSX.Element> = {
  bold: <FormatBoldRoundedIcon fontSize="small" />,
  italic: <FormatItalicRoundedIcon fontSize="small" />,
  heading: <TitleRoundedIcon fontSize="small" />,
  ulist: <FormatListBulletedRoundedIcon fontSize="small" />,
  olist: <FormatListNumberedRoundedIcon fontSize="small" />,
  quote: <FormatQuoteRoundedIcon fontSize="small" />,
  code: <CodeRoundedIcon fontSize="small" />,
  link: <LinkRoundedIcon fontSize="small" />,
  image: <ImageRoundedIcon fontSize="small" />,
  table: <TableChartRoundedIcon fontSize="small" />,
  formula: <FunctionsRoundedIcon fontSize="small" />
}

/** Grouped toolbar: 文字 │ 列表 │ 插入 — the groups split by hairlines. */
const TOOL_GROUPS: { label: string; tools: MarkdownTool[] }[] = [
  { label: "文字", tools: ["bold", "italic", "heading"] },
  { label: "列表", tools: ["ulist", "olist", "quote"] },
  { label: "插入", tools: ["link", "image", "table", "formula", "code"] }
]

const VIEW_STATES = ["edit", "split", "preview"] as const
type EditorView = (typeof VIEW_STATES)[number]
const VIEW_LABELS: Record<EditorView, string> = {
  edit: "编辑",
  split: "分栏",
  preview: "预览"
}

/** Inline markdown editor: a grouped MUI toolbar + a serif code TextField +
 *  a live preview rendered by the SAME MarkdownRenderer the cards use. One
 *  paper container (toolbar strip + body), split view by default with an
 *  edit/split/preview segmented control. */
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
  const [view, setView] = useState<EditorView>("split")
  const [focused, setFocused] = useState(false)
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
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const preview = useMemo(() => {
    if (view === "edit") return null
    return (
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: 2,
          py: 1.5,
          borderLeft: view === "split" ? "1px solid" : "none",
          borderColor: "divider",
          overflow: "auto",
          maxHeight: dense ? 300 : 420,
          fontSize: "0.9rem",
          lineHeight: 1.8
        }}>
        {value.trim() ? (
          <MarkdownRenderer content={value} />
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 120,
              gap: 1,
              color: "text.disabled"
            }}>
            <TextFieldsRoundedIcon sx={{ fontSize: 28, opacity: 0.6 }} />
            <Typography variant="caption">预览将显示在右侧</Typography>
          </Box>
        )}
      </Box>
    )
  }, [view, value, dense])

  return (
    <Box
      sx={{
        width: "100%",
        border: "1px solid",
        borderColor: focused ? "primary.main" : "divider",
        borderRadius: 1,
        boxShadow: (t) => (focused ? t.custom.focusRing : "none"),
        overflow: "hidden",
        bgcolor: "background.paper",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease"
      }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          flexWrap: "wrap",
          px: 0.75,
          py: 0.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: (t) => t.custom.surface2
        }}>
        {TOOL_GROUPS.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 && (
              <Box
                sx={{
                  width: 1,
                  height: 18,
                  mx: 0.5,
                  bgcolor: "divider",
                  flexShrink: 0
                }}
              />
            )}
            {group.tools.map((tool) => (
              <Tooltip key={tool} title={TOOL_TIPS[tool]}>
                <IconButton
                  size="small"
                  onClick={() => applyTool(tool)}
                  sx={{
                    p: 0.75,
                    color: "text.secondary",
                    "&:hover": { color: "primary.main", bgcolor: "action.hover" },
                    "&:active": { bgcolor: "action.selected" }
                  }}>
                  {TOOL_ICONS[tool]}
                </IconButton>
              </Tooltip>
            ))}
          </Fragment>
        ))}
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: "flex",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
            bgcolor: "background.paper"
          }}>
          {VIEW_STATES.map((v) => (
            <Box
              key={v}
              onClick={() => setView(v)}
              sx={{
                px: 0.9,
                py: 0.3,
                fontSize: "0.7rem",
                cursor: "pointer",
                userSelect: "none",
                color: view === v ? "primary.main" : "text.secondary",
                bgcolor: view === v ? "action.selected" : "transparent",
                fontWeight: view === v ? 600 : 400,
                "&:hover": { bgcolor: "action.hover" }
              }}>
              {VIEW_LABELS[v]}
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "stretch" }}>
        {view !== "preview" && (
          <TextField
            inputRef={inputRef}
            multiline
            minRows={minRows}
            fullWidth
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            variant="standard"
            sx={{
              flex: 1,
              minWidth: 0,
              fontFamily: (t) => t.custom.serif,
              fontSize: "0.95rem",
              lineHeight: 1.8,
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
