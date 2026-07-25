import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded"
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded"
import { Box, IconButton, Stack, Tooltip, Typography, alpha } from "@mui/material"
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
      sx={(theme) => ({
        bgcolor: alpha(theme.palette.primary.main, 0.07),
        borderBottom: "2px solid",
        borderColor: "primary.main",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        height: headerHeight,
        display: "flex",
        alignItems: "center"
      })}>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ width: "100%" }}>
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
        <Typography
          sx={{
            fontSize: "1.5rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            lineHeight: 1
          }}>
          {reviewProgress ? (
            <>复习</>
          ) : activeProjectName ? (
            <>lime · <Box component="span" sx={{ fontSize: "1rem", fontWeight: 400, opacity: 0.8 }}>{activeProjectName}</Box></>
          ) : "lime"}
        </Typography>
        <Tooltip title="设置">
          <IconButton
            size="small"
            onClick={onSettingsClick}
            sx={{ color: "text.secondary", "&:hover": { color: "primary.main" }, "&.Mui-focusVisible": { outline: "none" } }}>
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
            · 已掌握 {reviewProgress.sessionMastered ?? 0} · 待复习 {reviewStats?.dueCount ?? 0}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {children}
      </Stack>
    </Box>
  )
}
