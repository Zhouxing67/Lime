import { Box, Typography } from "@mui/material"

import type { SidebarTab } from "./NavRail"
import type { TodoStats } from "../types"

interface FooterBarProps {
  sidebarTab: SidebarTab
  totalItems: number
  totalProjects: number
  dueCount: number
  syncStatus: string
  version: string
  activeProjectName?: string | null
  activeProjectItemCount?: number
  todoStats: TodoStats
}

export default function FooterBar({
  sidebarTab,
  totalItems,
  totalProjects,
  dueCount,
  syncStatus,
  version,
  activeProjectName,
  activeProjectItemCount,
  todoStats
}: FooterBarProps) {
  const pct = todoStats.total
    ? Math.round((todoStats.completed / todoStats.total) * 100)
    : 0

  return (
    <Box
      sx={{
        flexShrink: 0,
        height: 52,
        display: "flex",
        alignItems: "center",
        px: 3,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper"
      }}>
      {sidebarTab === "todo" ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            variant="caption"
            sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            待办{" "}
            <Box
              component="span"
              sx={{ fontWeight: 700, color: "primary.main" }}>
              {todoStats.incomplete}
            </Box>
            /{todoStats.total}
          </Typography>
          <Box
            sx={{
              width: 56,
              height: 3,
              borderRadius: 1.5,
              bgcolor: "action.hover",
              overflow: "hidden"
            }}>
            <Box
              sx={{
                width: `${pct}%`,
                height: "100%",
                bgcolor:
                  pct === 100 ? "success.main" : "primary.main",
                transition: "width 0.3s"
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            <Box
              component="span"
              sx={{ mx: 0.5, color: "text.disabled" }}>
              ·
            </Box>
            已过期{" "}
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: todoStats.overdue ? "error.main" : "text.secondary"
              }}>
              {todoStats.overdue}
            </Box>
            <Box
              component="span"
              sx={{ mx: 0.5, color: "text.disabled" }}>
              ·
            </Box>
            今天{" "}
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: todoStats.today ? "warning.main" : "text.secondary"
              }}>
              {todoStats.today}
            </Box>
          </Typography>
        </Box>
      ) : sidebarTab === "review" ? (
        <Typography
          variant="caption"
          sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          待复习{" "}
          <Box
            component="span"
            sx={{ fontWeight: 700, color: "error.main" }}>
            {dueCount}
          </Box>
        </Typography>
      ) : (
        <Typography
          variant="caption"
          sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {activeProjectName ? (
            <>
              <Box
                component="span"
                sx={{ fontWeight: 700, color: "primary.main" }}>
                {activeProjectItemCount ?? 0}
              </Box>{" "}
              收藏 · {activeProjectName}
              <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>
                /
              </Box>
            </>
          ) : null}
          <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>
            {totalItems}
          </Box>{" "}
          收藏
          <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>
            ·
          </Box>
          <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>
            {totalProjects}
          </Box>{" "}
          项目
        </Typography>
      )}

      <Box sx={{ flex: 1 }} />

      <Typography
        variant="caption"
        sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
        {syncStatus || "未同步"}
        <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>
          ·
        </Box>
        <Box component="span" sx={{ color: "text.disabled" }}>
          v{version}
        </Box>
      </Typography>
    </Box>
  )
}
