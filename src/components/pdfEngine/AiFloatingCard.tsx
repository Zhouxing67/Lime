import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded"
import {
  Box,
  ClickAwayListener,
  IconButton,
  Paper,
  Popper,
  Typography
} from "@mui/material"
import { useState, type PointerEvent, type ReactNode } from "react"

/** Shared non-modal AI result surface. Its header is the drag handle. */
export default function AiFloatingCard({
  anchorEl,
  title,
  onClose,
  children,
  width = 380
}: {
  anchorEl: HTMLElement | null
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{
    pointerId: number
    x: number
    y: number
    originX: number
    originY: number
  } | null>(null)

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: offset.x,
      originY: offset.y
    })
  }

  return (
    <Popper
      open
      anchorEl={anchorEl}
      placement="top"
      modifiers={[{ name: "offset", options: { offset: [0, 10] } }]}
      sx={{ zIndex: 1500 }}>
      <ClickAwayListener onClickAway={onClose}>
        <Paper
          elevation={0}
          sx={(theme) => ({
            width,
            maxWidth: "calc(100vw - 24px)",
            overflow: "hidden",
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadowHover,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: drag ? "none" : "box-shadow 0.2s ease"
          })}>
          <Box
            onPointerDown={startDrag}
            onPointerMove={(event) => {
              if (!drag || event.pointerId !== drag.pointerId) return
              setOffset({
                x: drag.originX + event.clientX - drag.x,
                y: drag.originY + event.clientY - drag.y
              })
            }}
            onPointerUp={(event) => {
              if (drag?.pointerId === event.pointerId) setDrag(null)
            }}
            onPointerCancel={() => setDrag(null)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1.5,
              py: 1,
              cursor: drag ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none"
            }}>
            <Typography sx={{ flex: 1, fontSize: "0.75rem", fontWeight: 600 }}>
              {title}
            </Typography>
            <DragIndicatorRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            <IconButton
              size="small"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClose}
              sx={{ p: 0.75 }}>
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box sx={{ mx: 1, borderBottom: "1px solid", borderColor: "divider" }} />
          <Box sx={{ p: 1.5 }}>{children}</Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  )
}
