import { Box, Paper, Typography, alpha } from "@mui/material"

export default function FooterBar({
  totalItems,
  totalProjects,
  dueCount,
  syncStatus,
  activeProjectName,
  activeProjectItemCount
}: {
  totalItems: number
  totalProjects: number
  dueCount: number
  syncStatus: string
  activeProjectName?: string | null
  activeProjectItemCount?: number
}) {
  return (
    <Box
      sx={(theme) => ({
        flexShrink: 0,
        height: 52,
        display: "flex",
        alignItems: "center",
        px: 3,
        borderTop: "2px solid",
        borderColor: "primary.main",
        bgcolor: alpha(theme.palette.primary.main, 0.07),
        boxShadow: "0 -1px 4px rgba(0,0,0,0.04)"
      })}>
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          borderRadius: 1,
          px: 3,
          py: 0.75,
          display: "flex",
          alignItems: "center"
        }}>
        <Typography variant="caption" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {activeProjectName ? (
            <>
              <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{activeProjectItemCount ?? 0}</Box> 收藏 · {activeProjectName}
              <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>/</Box>
            </>
          ) : null}
          <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{totalItems}</Box> 收藏
          <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>·</Box>
          <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{totalProjects}</Box> 项目
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Typography variant="caption" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {dueCount > 0 && (
            <>
              待复习 <Box component="span" sx={{ fontWeight: 700, color: "error.main" }}>{dueCount}</Box>
              <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>·</Box>
            </>
          )}
          {syncStatus || "未同步"}
        </Typography>
      </Paper>
    </Box>
  )
}
