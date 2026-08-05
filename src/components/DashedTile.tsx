import { alpha, Box, Paper, Typography } from "@mui/material"
import type { ReactNode } from "react"

/** The app's one dashed "add" tile (新建项目 / 打开 PDF / 新建主题 / 新增待办 /
 *  新建卡片): 1.5px dashed borderStrong, centered icon + label, hover primary.
 *  Two look variants — "simple" (hub tiles) and "card" (paper + rest shadow +
 *  lift, used where the tile is a standalone grid cell). */
interface DashedTileProps {
  icon: ReactNode
  label: string
  onClick: () => void
  minHeight?: number
  variant?: "simple" | "card"
  /** Render the icon inside a 36px dashed circle (todo/card tiles). */
  circleIcon?: boolean
  labelSize?: string
  /** Marks this tile as a card-drag drop target (the "move to last" zone). */
  dropTarget?: boolean
  /** Drop-indicator highlight while a card drag hovers this tile. */
  highlighted?: boolean
}

export default function DashedTile({
  icon,
  label,
  onClick,
  minHeight = 104,
  variant = "simple",
  circleIcon = false,
  labelSize = "0.85rem",
  dropTarget = false,
  highlighted = false
}: DashedTileProps) {
  return (
    <Paper
      elevation={0}
      data-card-drop-end={dropTarget ? "true" : undefined}
      onClick={onClick}
      sx={(theme) => ({
        p: 2,
        borderRadius: 1,
        border: "1.5px dashed",
        borderColor: highlighted ? "primary.main" : theme.custom.borderStrong,
        minHeight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        cursor: "pointer",
        color: highlighted ? "primary.main" : "text.secondary",
        ...(highlighted
          ? { bgcolor: alpha(theme.palette.primary.main, 0.04) }
          : {}),
        ...(variant === "card"
          ? { bgcolor: "background.paper", boxShadow: theme.custom.cardShadow }
          : {}),
        transition: "all 0.2s",
        "&:hover": {
          borderColor: "primary.main",
          color: "primary.main",
          boxShadow: theme.custom.cardShadowHover,
          ...(variant === "card" ? { transform: "translateY(-1px)" } : {})
        }
      })}>
      {circleIcon ? (
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1.5px dashed",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
          {icon}
        </Box>
      ) : (
        <Box>{icon}</Box>
      )}
      <Typography variant="body2" sx={{ fontSize: labelSize }}>
        {label}
      </Typography>
    </Paper>
  )
}
