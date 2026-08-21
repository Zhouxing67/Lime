import {
  Button,
  Checkbox,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  type ButtonOwnProps
} from "@mui/material"
import { Fragment, type ReactElement } from "react"

export interface BatchAction {
  label: string
  icon: ReactElement
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  dividerBefore?: boolean
  disabled?: boolean
  variant?: ButtonOwnProps["variant"]
  color?: ButtonOwnProps["color"]
  iconOnly?: boolean
  tooltip?: string
}

interface BatchToolbarProps {
  /** When undefined, the selection controls (count/checkbox/select-all) are
   *  hidden and the toolbar renders the actions only — a generic action bar. */
  selectedCount?: number
  allSelected?: boolean
  onSelectAll?: () => void
  /** Label suffix for the count, e.g. "已选 N 条 / 个项目 / 个 PDF". */
  countLabel?: string
  totalCount?: number
  selectAllLabel?: string
  selectAllIndeterminate?: boolean
  actions: BatchAction[]
}

export default function BatchToolbar({
  selectedCount,
  allSelected,
  onSelectAll,
  countLabel = "条",
  totalCount,
  selectAllLabel = "全选",
  selectAllIndeterminate,
  actions
}: BatchToolbarProps) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
      {selectedCount !== undefined && (
        <>
          <Button
            size="small"
            variant="text"
            startIcon={
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={
                  selectAllIndeterminate ?? (selectedCount > 0 && !allSelected)
                }
                tabIndex={-1}
                sx={{
                  p: 0,
                  pointerEvents: "none",
                  color: "text.disabled",
                  "&.Mui-checked": { color: "primary.main" },
                  "&.MuiCheckbox-indeterminate": { color: "primary.main" },
                  "& .MuiSvgIcon-root": { fontSize: 16 }
                }}
              />
            }
            disabled={totalCount === 0}
            sx={{ borderRadius: 1, fontSize: "0.75rem", whiteSpace: "nowrap" }}
            onClick={onSelectAll}>
            {allSelected ? "取消全选" : selectAllLabel}
          </Button>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            已选择 {selectedCount}
            {totalCount === undefined ? ` ${countLabel}` : ` / ${totalCount}`}
          </Typography>
        </>
      )}
      {actions.map((btn) => (
        <Fragment key={btn.label}>
          {btn.dividerBefore && <Divider orientation="vertical" flexItem />}
          {btn.iconOnly ? (
            <Tooltip title={btn.tooltip ?? btn.label}>
              <span>
                <IconButton
                  size="small"
                  color={btn.color ?? "primary"}
                  aria-label={btn.label}
                  disabled={btn.disabled}
                  onClick={(e) => btn.onClick(e)}
                  sx={{ p: 0.75 }}>
                  {btn.icon}
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Button
              size="small"
              variant={btn.variant ?? "text"}
              color={btn.color ?? "primary"}
              sx={{
                borderRadius: 1,
                fontSize: "0.75rem",
                whiteSpace: "nowrap"
              }}
              disabled={btn.disabled}
              onClick={(e) => btn.onClick(e)}>
              {btn.icon}
              {btn.label}
            </Button>
          )}
        </Fragment>
      ))}
    </Stack>
  )
}
