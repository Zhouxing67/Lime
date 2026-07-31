import BackupRoundedIcon from "@mui/icons-material/BackupRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded"
import { Badge, Box, IconButton, Tooltip } from "@mui/material"
import { alpha } from "@mui/material/styles"

export type SidebarTab = "projects" | "review" | "backup"

interface NavRailProps {
  sidebarTab: SidebarTab
  dueCount: number
  onSetSidebarTab: (tab: SidebarTab) => void
}

const BUTTONS: {
  tab: SidebarTab
  label: string
  icon: React.ReactNode
  badge?: number
}[] = [
  {
    tab: "projects",
    label: "项目管理",
    icon: <FolderOpenRoundedIcon sx={{ fontSize: 22 }} />
  },
  {
    tab: "review",
    label: "间隔复习",
    icon: <SchoolRoundedIcon sx={{ fontSize: 22 }} />
  },
  {
    tab: "backup",
    label: "备份与同步",
    icon: <BackupRoundedIcon sx={{ fontSize: 22 }} />
  }
]

export default function NavRail({
  sidebarTab,
  dueCount,
  onSetSidebarTab
}: NavRailProps) {
  return (
    <Box
      sx={{
        width: 52,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        py: 1.5,
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider"
      }}>
      {BUTTONS.map((b) => {
        const active = sidebarTab === b.tab
        const icon =
          b.tab === "review" ? (
            <Badge
              badgeContent={dueCount}
              color="error"
              invisible={dueCount === 0}
              sx={{
                "& .MuiBadge-badge": {
                  fontSize: "0.6rem",
                  height: 16,
                  minWidth: 16,
                  right: -6,
                  top: 0
                }
              }}>
              {b.icon}
            </Badge>
          ) : (
            b.icon
          )
        return (
          <Tooltip key={b.tab} title={b.label} placement="right">
            <IconButton
              size="small"
              onClick={() => onSetSidebarTab(b.tab)}
              sx={(theme) => ({
                color: active ? "primary.main" : "text.secondary",
                bgcolor: active
                  ? alpha(theme.palette.primary.main, 0.08)
                  : "transparent",
                borderRadius: 1,
                p: 0.75,
                "&:hover": {
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.08)
                }
              })}>
              {icon}
            </IconButton>
          </Tooltip>
        )
      })}
    </Box>
  )
}
