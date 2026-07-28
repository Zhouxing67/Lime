import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import { alpha, Box, Button, Divider, type ButtonOwnProps, Stack, Typography } from "@mui/material"
import { Fragment, type ReactElement, useMemo } from "react"

interface BatchToolbarProps {
  selectedIds: string[]
  allSelected: boolean
  hasSections: boolean
  onSelectAll: () => void
  onBatchDelete: () => void
  onBatchMove: () => void
  onBatchMoveToSection: () => void
  onBatchCopy: () => void
}

interface ButtonConfig {
  label: string
  icon: ReactElement
  onClick: () => void
  dividerBefore?: boolean
  disabled?: boolean
  variant?: ButtonOwnProps["variant"]
  color?: ButtonOwnProps["color"]
}

export default function BatchToolbar({
  selectedIds,
  allSelected,
  hasSections,
  onSelectAll,
  onBatchDelete,
  onBatchMove,
  onBatchMoveToSection,
  onBatchCopy
}: BatchToolbarProps) {
  const hasSelection = selectedIds.length > 0

  const buttons = useMemo<ButtonConfig[]>(
    () => [
      {
        label: allSelected ? "取消全选" : "全选",
        icon: <DoneAllRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onSelectAll
      },
      ...(hasSections ? [{
        label: "移动到章节",
        icon: <DriveFileMoveOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchMoveToSection,
        dividerBefore: true,
        disabled: !hasSelection
      } as ButtonConfig] : []),
      {
        label: "移动到",
        icon: <DriveFileMoveOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchMove,
        dividerBefore: true,
        disabled: !hasSelection
      },
      {
        label: "复制到",
        icon: <FileCopyOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchCopy,
        disabled: !hasSelection
      },
      {
        label: "删除选中",
        icon: <DeleteSweepRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchDelete,
        dividerBefore: true,
        disabled: !hasSelection,
        variant: "contained",
        color: "error"
      }
    ],
    [onSelectAll, onBatchMove, onBatchCopy, onBatchDelete, hasSelection, allSelected, hasSections, onBatchMoveToSection]
  )

  return (
    <Box
      sx={(theme) => ({
        py: 1.5,
        px: 2,
        mb: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider"
      })}>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.85rem" }}>
        ✅ 已选 {selectedIds.length} 条
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        {buttons.map((btn) => (
          <Fragment key={btn.label}>
            {btn.dividerBefore && <Divider orientation="vertical" flexItem />}
            <Button
              size="small"
              variant={btn.variant ?? "text"}
              color={btn.color ?? "primary"}
              sx={{ borderRadius: 1, fontSize: "0.75rem", whiteSpace: "nowrap" }}
              disabled={btn.disabled}
              onClick={btn.onClick}>
              {btn.icon}
              {btn.label}
            </Button>
          </Fragment>
        ))}
      </Stack>
    </Box>
  )
}
