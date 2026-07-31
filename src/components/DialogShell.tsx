import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  type ButtonOwnProps
} from "@mui/material"
import type { ReactNode } from "react"

interface DialogShellProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
  maxWidth?: "xs" | "sm" | "md"
  confirmLabel?: string
  onConfirm?: () => void
  confirmDisabled?: boolean
  confirmColor?: ButtonOwnProps["color"]
}

export default function DialogShell({
  open,
  onClose,
  title,
  children,
  actions = undefined,
  maxWidth = "sm",
  confirmLabel = "确认",
  onConfirm,
  confirmDisabled,
  confirmColor = "primary"
}: DialogShellProps) {
  const defaultActions = (
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onClose}>取消</Button>
      {onConfirm && (
        <Button
          variant="contained"
          color={confirmColor}
          disabled={confirmDisabled}
          onClick={onConfirm}>
          {confirmLabel}
        </Button>
      )}
    </DialogActions>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 1 } } }}>
      <DialogTitle sx={{ py: 2.5, px: 3, fontSize: "1rem" }}>
        {title}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 1 }}>{children}</DialogContent>
      {actions === undefined ? defaultActions : actions}
    </Dialog>
  )
}
