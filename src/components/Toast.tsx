import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded"
import { Box, Snackbar, Typography } from "@mui/material"

interface ToastProps {
  open: boolean
  message: string
  /** Explicit severity — errors announce via role="alert"; the message-text
   *  heuristic is gone. */
  severity?: "success" | "error"
  onClose: () => void
}

/** Bottom-center paper toast: neutral card + colored icon (no filled band). */
export default function Toast({
  open,
  message,
  severity = "success",
  onClose
}: ToastProps) {
  const isError = severity === "error"
  const Icon = isError ? ErrorOutlineRoundedIcon : CheckRoundedIcon

  return (
    <Snackbar
      open={open}
      autoHideDuration={2500}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ bottom: { xs: 16, sm: 24 } }}>
      <Box
        role={isError ? "alert" : "status"}
        sx={(t) => ({
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          boxShadow: t.custom.cardShadow,
          px: 1.5,
          py: 1,
          maxWidth: 440
        })}>
        <Icon
          sx={{
            fontSize: 18,
            color: isError ? "error.main" : "success.main",
            flexShrink: 0
          }}
        />
        <Typography
          variant="body2"
          sx={{ fontSize: "0.75rem", color: "text.primary" }}>
          {message}
        </Typography>
      </Box>
    </Snackbar>
  )
}
