import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import MergeTypeRoundedIcon from "@mui/icons-material/MergeTypeRounded"
import {
  Button,
  Divider,
  Stack,
  Typography,
  type ButtonOwnProps
} from "@mui/material"
import { Fragment, useMemo, type ReactElement } from "react"

interface BatchToolbarProps {
  selectedIds: string[]
  allSelected: boolean
  onSelectAll: () => void
  onBatchDelete: () => void
  onBatchCopy: () => void
  onBatchMerge: () => void
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
  onSelectAll,
  onBatchDelete,
  onBatchCopy,
  onBatchMerge
}: BatchToolbarProps) {
  const hasSelection = selectedIds.length > 0
  const hasMulti = selectedIds.length >= 2

  const buttons = useMemo<ButtonConfig[]>(
    () => [
      {
        label: allSelected ? "取消全选" : "全选",
        icon: <DoneAllRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onSelectAll
      },
      {
        label: "复制到",
        icon: <FileCopyOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchCopy,
        dividerBefore: true,
        disabled: !hasSelection
      },
      {
        label: "合并",
        icon: <MergeTypeRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
        onClick: onBatchMerge,
        disabled: !hasMulti
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
    [onSelectAll, onBatchCopy, onBatchDelete, onBatchMerge, hasSelection, hasMulti, allSelected]
  )

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
        已选 {selectedIds.length} 条
      </Typography>
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
  )
}
