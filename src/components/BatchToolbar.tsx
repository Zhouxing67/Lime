import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import { Button, Checkbox, Divider, Stack, Typography, type ButtonOwnProps } from "@mui/material"
import { Fragment, type ReactElement } from "react"

export interface BatchAction {
  label: string
  icon: ReactElement
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  dividerBefore?: boolean
  disabled?: boolean
  variant?: ButtonOwnProps["variant"]
  color?: ButtonOwnProps["color"]
}

interface BatchToolbarProps {
  selectedCount: number
  allSelected: boolean
  onSelectAll: () => void
  /** Label suffix for the count, e.g. "已选 N 条 / 个项目 / 个 PDF". */
  countLabel?: string
  actions: BatchAction[]
}

export default function BatchToolbar({
  selectedCount,
  allSelected,
  onSelectAll,
  countLabel = "条",
  actions
}: BatchToolbarProps) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
        已选 {selectedCount} {countLabel}
      </Typography>
      <Checkbox
        size="small"
        checked={allSelected}
        indeterminate={selectedCount > 0 && !allSelected}
        onChange={onSelectAll}
        sx={{
          p: 0.25,
          color: "text.disabled",
          "&.Mui-checked": { color: "error.main" },
          "&.MuiCheckbox-indeterminate": { color: "error.main" },
          "& .MuiSvgIcon-root": { fontSize: 18 }
        }}
      />
      <Button
        size="small"
        variant="text"
        sx={{ borderRadius: 1, fontSize: "0.75rem", whiteSpace: "nowrap" }}
        onClick={onSelectAll}>
        {allSelected ? "取消全选" : "全选"}
      </Button>
      {actions.map((btn) => (
        <Fragment key={btn.label}>
          {btn.dividerBefore && <Divider orientation="vertical" flexItem />}
          <Button
            size="small"
            variant={btn.variant ?? "text"}
            color={btn.color ?? "primary"}
            sx={{ borderRadius: 1, fontSize: "0.75rem", whiteSpace: "nowrap" }}
            disabled={btn.disabled}
            onClick={(e) => btn.onClick(e)}>
            {btn.icon}
            {btn.label}
          </Button>
        </Fragment>
      ))}
    </Stack>
  )
}
