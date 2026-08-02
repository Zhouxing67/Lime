import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import EventRoundedIcon from "@mui/icons-material/EventRounded"
import { Box, IconButton, Typography } from "@mui/material"
import { useRef } from "react"

interface DateFieldProps {
  /** Shown as the placeholder when no value is set. */
  label: string
  /** Local "YYYY-MM-DD". */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}

/** Compact date field: a visible click target opens the native date picker via
 * showPicker(); a hidden 1px input keeps the calendar available. The displayed
 * text is fully controlled (no browser-localized placeholder). */
export default function DateField({
  label,
  value,
  onChange,
  min,
  max
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [y, m, d] = value.split("-")
  const display = value ? `${y}年${+m}月${+d}日` : label

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === "function") {
      input.showPicker()
    } else {
      input.click()
    }
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          openPicker()
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        px: 1,
        py: 0.5,
        minWidth: 0,
        cursor: "pointer",
        "&:hover, &:focus-visible": { borderColor: "primary.main" },
        "&:focus-visible": { outline: "none" }
      }}>
      <EventRoundedIcon sx={{ fontSize: 15, color: "text.disabled" }} />
      <Typography
        variant="body2"
        noWrap
        sx={{
          fontSize: "0.78rem",
          flex: 1,
          minWidth: 0,
          color: value ? "text.primary" : "text.secondary"
        }}>
        {display}
      </Typography>
      {value && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            onChange("")
          }}
          title="清除"
          sx={{ p: 0.25 }}>
          <CloseRoundedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        tabIndex={-1}
        style={{
          position: "absolute",
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: "none"
        }}
      />
    </Box>
  )
}
