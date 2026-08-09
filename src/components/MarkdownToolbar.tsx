import { Fragment } from "react"
import { Box, Divider, IconButton, Tooltip } from "@mui/material"
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

import {
  TOOL_GROUPS,
  TOOL_LABELS
} from "../utils/markdownTools"
import type { MarkdownTool } from "../utils/markdownEditor"

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

/** The markdown formatting toolbar — one row with the groups spread
 *  left/center/right (vertical dividers), the app-standard icon buttons. */
export default function MarkdownToolbar({
  onTool
}: {
  onTool: (tool: MarkdownTool) => void
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1,
        py: 0.5,
        minHeight: 40,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0
      }}>
      {TOOL_GROUPS.map((group, gi) => (
        <Fragment key={group.tools.join(",")}>
          {gi === 1 && <Box sx={{ flex: 1 }} />}
          {gi === 2 && <Box sx={{ flex: 1 }} />}
          {gi > 0 && (
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 0.5, height: 16 }}
            />
          )}
          {group.tools.map((tool) => (
            <Tooltip key={tool} title={TOOL_LABELS[tool]}>
              <IconButton
                size="small"
                onClick={() => onTool(tool)}
                sx={{
                  p: 0.75,
                  color: "text.secondary",
                  "&:hover": { color: "primary.main", bgcolor: "action.hover" }
                }}>
                {TOOL_ICONS[tool]}
              </IconButton>
            </Tooltip>
          ))}
        </Fragment>
      ))}
    </Box>
  )
}
