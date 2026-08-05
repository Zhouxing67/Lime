import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined"
import ViewSidebarRoundedIcon from "@mui/icons-material/ViewSidebarRounded"
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material"
import type { ReactNode } from "react"

interface AppHeaderProps {
  drawerOpen: boolean
  headerHeight: number
  onToggleDrawer: () => void
  reviewProgress?: {
    remaining: number
    rated: number
    passed: number
  }
  activeProjectName?: string
  children?: ReactNode
}

export default function AppHeader({
  drawerOpen,
  headerHeight,
  onToggleDrawer,
  reviewProgress,
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
        <Tooltip title={drawerOpen ? "关闭侧边栏" : "打开侧边栏"}>
          <IconButton
            size="small"
            onClick={onToggleDrawer}
            sx={{
              color: drawerOpen ? "primary.main" : "text.secondary",
              transition: "color 0.2s ease",
              "&:hover": { color: "primary.main" }
            }}>
            {drawerOpen ? (
              <ViewSidebarRoundedIcon />
            ) : (
              <ViewSidebarOutlinedIcon />
            )}
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
        {reviewProgress && reviewProgress.remaining > 0 && (
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontSize: "0.85rem", ml: 0.5 }}>
            剩余 {reviewProgress.remaining} 张 · 已评{" "}
            {reviewProgress.rated} 次 · 通过 {reviewProgress.passed} 张
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {children}
      </Stack>
    </Box>
  )
}
