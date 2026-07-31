import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded"
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded"
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material"
import type { ReactNode } from "react"

import type { ReviewStats } from "../hooks/useSrs"

interface AppHeaderProps {
  drawerOpen: boolean
  headerHeight: number
  onToggleDrawer: () => void
  onSettingsClick: () => void
  reviewProgress?: { current: number; total: number; sessionMastered: number }
  reviewStats?: ReviewStats
  activeProjectName?: string
  children?: ReactNode
}

export default function AppHeader({
  drawerOpen,
  headerHeight,
  onToggleDrawer,
  onSettingsClick,
  reviewProgress,
  reviewStats,
  activeProjectName,
  children
}: AppHeaderProps) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        height: headerHeight,
        display: "flex",
        alignItems: "center"
      }}>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ width: "100%", px: 2 }}>
        <Tooltip title={drawerOpen ? "关闭项目面板" : "打开项目面板"}>
          <IconButton
            size="small"
            onClick={onToggleDrawer}
            sx={{
              color: drawerOpen ? "primary.main" : "text.secondary",
              transition: "color 0.2s",
              "&:hover": { color: "primary.main" }
            }}>
            <FilterListRoundedIcon />
          </IconButton>
        </Tooltip>
        <Stack
          direction="row"
          alignItems="baseline"
          spacing={1}
          sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "1.05rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              lineHeight: 1,
              flexShrink: 0
            }}>
            lime
          </Typography>
          {!reviewProgress && activeProjectName && (
            <Typography
              variant="body2"
              noWrap
              sx={{
                color: "text.secondary",
                fontSize: "0.85rem",
                minWidth: 0
              }}>
              {activeProjectName}
            </Typography>
          )}
        </Stack>
        <Tooltip title="设置">
          <IconButton
            size="small"
            onClick={onSettingsClick}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              "&.Mui-focusVisible": { outline: "none" }
            }}>
            <SettingsRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        {reviewProgress && reviewProgress.total > 0 && (
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontSize: "0.85rem", ml: 0.5 }}>
            第 {reviewProgress.current} 张 / 共 {reviewProgress.total} 张
          </Typography>
        )}
        {reviewProgress && (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.72rem" }}>
            · 已掌握 {reviewProgress.sessionMastered ?? 0} · 待复习{" "}
            {reviewStats?.dueCount ?? 0}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {children}
      </Stack>
    </Box>
  )
}
