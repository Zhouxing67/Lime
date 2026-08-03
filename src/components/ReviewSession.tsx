import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import {
  alpha,
  Box,
  Button,
  Divider,
  Stack,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useEffect } from "react"

import type { Item } from "../types"
import { RATING_META } from "../utils"
import CardRenderer from "./CardRenderer"
import ReviewEmptyStats from "./ReviewEmptyStats"

interface ReviewSessionProps {
  item: Item | null
  /** Cards left in the current pass (absolute, no ratio). */
  remaining: number
  /** Rating actions taken this session. */
  ratedCount: number
  /** Cards that left the queue this session (final rating >= 2). */
  passedCount: number
  flipped: boolean
  completed: boolean
  animating: boolean
  masteredCount: number
  activeCount: number
  todayRatings: [number, number, number]
  streakDays: number
  onFlip: () => void
  onRate: (rating: 1 | 2 | 3) => void
  onExit: () => void
}

function StatBlock({
  value,
  label,
  color,
  faded
}: {
  value: number
  label: string
  color: string
  faded?: boolean
}) {
  return (
    <Box
      sx={{
        flex: 1,
        py: 2,
        px: 1,
        textAlign: "center",
        opacity: faded ? 0.45 : 1
      }}>
      <Typography
        sx={{
          fontSize: "1.5rem",
          fontWeight: 600,
          lineHeight: 1.2,
          color
        }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
    </Box>
  )
}

export default function ReviewSession({
  item,
  remaining,
  ratedCount,
  passedCount,
  flipped,
  completed,
  animating,
  masteredCount,
  activeCount,
  todayRatings,
  streakDays,
  onFlip,
  onRate,
  onExit
}: ReviewSessionProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (completed) return
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onFlip()
      }
      if (["1", "2", "3"].includes(e.key)) {
        e.preventDefault()
        const r = Number(e.key) as 1 | 2 | 3
        if (flipped) onRate(r)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [flipped, completed, onFlip, onRate])

  // Completion screen
  if (completed) {
    const retries = Math.max(0, ratedCount - passedCount)
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", mt: 10, px: 2 }}>
        <Box
          sx={(t) => ({
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            boxShadow: t.custom.cardShadow,
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center"
          })}>
          <Box
            sx={(t) => ({
              width: 44,
              height: 44,
              borderRadius: "50%",
              bgcolor: `alpha(${t.palette.success.main}, 0.08)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2
            })}>
            <CheckRoundedIcon sx={{ fontSize: 24, color: "success.main" }} />
          </Box>
          <Typography
            sx={{
              fontFamily: (t) => t.custom.serif,
              fontWeight: 600,
              fontSize: "1.35rem",
              mb: 0.5
            }}>
            复习完成
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", mb: 3 }}>
            今天完成了 {passedCount} 张卡片的复习
          </Typography>

          <Box
            sx={{
              width: "100%",
              display: "flex",
              borderTop: "1px solid",
              borderBottom: "1px solid",
              borderColor: "divider",
              mb: 3
            }}>
            <StatBlock
              value={passedCount}
              label="通过（张）"
              color="success.main"
            />
            <Divider orientation="vertical" flexItem />
            <StatBlock
              value={ratedCount}
              label="本次已评（次）"
              color="text.primary"
            />
            <Divider orientation="vertical" flexItem />
            <StatBlock
              value={retries}
              label="重试（次）"
              color={retries > 0 ? "warning.main" : "text.disabled"}
              faded={retries === 0}
            />
          </Box>

          {masteredCount > 0 && (
            <Typography
              variant="body2"
              sx={{ color: "success.main", fontWeight: 500, mb: 3 }}>
              累计已掌握 {masteredCount} 张卡片
            </Typography>
          )}

          <Button
            variant="contained"
            fullWidth
            onClick={onExit}
            sx={{ borderRadius: 1, py: 1 }}>
            退出复习
          </Button>
        </Box>
      </Box>
    )
  }

  // Empty state
  if (!item) {
    return (
      <ReviewEmptyStats
        masteredCount={masteredCount}
        activeCount={activeCount}
        todayRatings={todayRatings}
        streakDays={streakDays}
      />
    )
  }

  // Normal review card
  return (
    <Box
      sx={{
        maxWidth: 832,
        mx: "auto",
        mt: 12
      }}>
      <style>{`
        @keyframes reviewSlideOut {
          to { opacity: 0; transform: translateX(-60px); }
        }
        @keyframes reviewSlideInRight {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <Box sx={{ position: "relative", mb: 3 }}>
        <Box
          onClick={onFlip}
          sx={{
            position: "relative",
            minHeight: 520,
            cursor: "pointer",
            animation: animating
              ? "reviewSlideOut 0.3s ease-in forwards"
              : "reviewSlideInRight 0.35s ease-out"
          }}>
          {/* Front */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              opacity: flipped ? 0 : 1,
              pointerEvents: flipped ? "none" : "auto",
              transition: "opacity 0.3s ease",
              bgcolor: (theme) =>
                theme.palette.mode === "light" ? "#fcfcf9" : "#2a2a2a",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              boxShadow: 6,
              p: 3,
              display: "flex",
              flexDirection: "column"
            }}>
            <CardRenderer item={item} mode="front" />
          </Box>

          {/* Back */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
              opacity: flipped ? 1 : 0,
              pointerEvents: flipped ? "auto" : "none",
              transition: "opacity 0.3s ease",
              bgcolor: (theme) =>
                theme.palette.mode === "light" ? "#fcfcf9" : "#2a2a2a",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              boxShadow: 6,
              p: 3,
              display: "flex",
              flexDirection: "column",
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-thumb": {
                bgcolor: "divider",
                borderRadius: 1
              },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" }
            }}>
            <CardRenderer item={item} mode="back" />
          </Box>
        </Box>
      </Box>

      {/* Rating buttons */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          opacity: flipped ? 1 : 0,
          transform: flipped ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: flipped ? "auto" : "none"
        }}>
        {RATING_META.map((meta, i) => {
          const rating = (i + 1) as 1 | 2 | 3
          return (
            <Tooltip key={meta.label} title={`快捷键 ${i + 1}`}>
              <Button
                fullWidth
                onClick={(e) => {
                  e.stopPropagation()
                  onRate(rating)
                }}
                sx={(t) => ({
                  position: "relative",
                  py: 1.4,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  boxShadow: t.custom.cardShadow,
                  color: meta.color,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  minWidth: 0,
                  "&:hover": {
                    bgcolor: alpha(meta.color, 0.06),
                    borderColor: meta.color
                  }
                })}>
                <Box
                  sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    borderTopLeftRadius: 1,
                    borderBottomLeftRadius: 1,
                    bgcolor: meta.color
                  }}
                />
                {meta.label}
                <Box
                  component="span"
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    fontSize: "0.65rem",
                    opacity: 0.35
                  }}>
                  {i + 1}
                </Box>
              </Button>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}
