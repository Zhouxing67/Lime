import BackupRoundedIcon from "@mui/icons-material/BackupRounded"
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded"
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded"
import { Badge, Box, IconButton, Tooltip } from "@mui/material"
import { alpha } from "@mui/material/styles"

export type SidebarTab = "projects" | "review" | "backup" | "todo" | "pdf"

interface NavRailProps {
  sidebarTab: SidebarTab
  dueCount: number
  /** Todo button badge: incomplete todos + due reviews. */
  todoCount: number
  onSetSidebarTab: (tab: SidebarTab) => void
  onSettingsClick: () => void
}

const BUTTONS: {
  tab: SidebarTab
  label: string
  icon: React.ReactNode
  badgeFor: "review" | "todo" | null
}[] = [
  {
    tab: "projects",
    label: "项目管理",
    icon: <FolderOpenRoundedIcon sx={{ fontSize: 22 }} />,
    badgeFor: null
  },
  {
    tab: "pdf",
    label: "PDF 阅读",
    icon: <PictureAsPdfRoundedIcon sx={{ fontSize: 22 }} />,
    badgeFor: null
  },
  {
    tab: "review",
    label: "间隔复习",
    icon: <SchoolRoundedIcon sx={{ fontSize: 22 }} />,
    badgeFor: "review"
  },
  {
    tab: "todo",
    label: "待办",
    icon: <ChecklistRoundedIcon sx={{ fontSize: 22 }} />,
    badgeFor: "todo"
  },
  {
    tab: "backup",
    label: "备份与同步",
    icon: <BackupRoundedIcon sx={{ fontSize: 22 }} />,
    badgeFor: null
  }
]

export default function NavRail({
  sidebarTab,
  dueCount,
  todoCount,
  onSetSidebarTab,
  onSettingsClick
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
        const badgeValue =
          b.badgeFor === "review" ? dueCount : b.badgeFor === "todo" ? todoCount : 0
        const icon =
          badgeValue > 0 ? (
            <Badge
              badgeContent={badgeValue}
              color="error"
              invisible={badgeValue === 0}
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
      <Box sx={{ flex: 1 }} />
      <Tooltip title="设置" placement="right">
        <IconButton
          size="small"
          onClick={onSettingsClick}
          sx={(theme) => ({
            color: "text.secondary",
            borderRadius: 1,
            p: 0.75,
            "&:hover": {
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.08)
            }
          })}>
          <SettingsRoundedIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
