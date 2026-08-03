import {
  Box,
  Button,
  Stack,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useEffect } from "react"

import type { Item } from "../types"
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

const LABELS = ["不认识", "模糊", "认识"]
const COLORS = ["#ef4444", "#f97316", "#22c55e"]

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
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          py: 10,
          maxWidth: 400,
          mx: "auto"
        }}>
        <Typography sx={{ fontSize: "4rem", mb: 2, lineHeight: 1 }}>
          {retries === 0 ? "🎉" : "💪"}
        </Typography>
        <Typography
          variant="h5"
          sx={{ mb: 4, fontWeight: 500, letterSpacing: "0.04em" }}>
          复习完成
        </Typography>
        <Box
          sx={{
            width: "100%",
            bgcolor: "action.hover",
            borderRadius: 1,
            p: 3,
            mb: 3
          }}>
          <Stack direction="row" justifyContent="space-around">
            <Box sx={{ textAlign: "center" }}>
              <Typography
                variant="h4"
                sx={{ fontWeight: 600, color: "primary.main" }}>
                {passedCount}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                通过（张）
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                variant="h4"
                sx={{ fontWeight: 600, color: "text.secondary" }}>
                {ratedCount}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                本次已评（次）
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                variant="h4"
                sx={{ fontWeight: 600, color: "warning.main" }}>
                {retries}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                重试（次）
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Stack spacing={0.5} sx={{ mb: 3, textAlign: "center" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            本次复习 {ratedCount} 次 · 通过 {passedCount} 张
            {retries > 0 ? ` · 重试 ${retries} 次` : ""}
          </Typography>
          {masteredCount > 0 && (
            <Typography
              variant="body2"
              sx={{ color: "success.main", fontWeight: 500 }}>
              累计已掌握 {masteredCount} 张卡片
            </Typography>
          )}
        </Stack>
        <Button
          variant="outlined"
          onClick={onExit}
          sx={{ borderRadius: 1, px: 4 }}>
          退出复习
        </Button>
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
        onExit={onExit}
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
        {LABELS.map((label, i) => {
          const rating = (i + 1) as 1 | 2 | 3
          return (
            <Tooltip key={label} title={`快捷键 ${i + 1}`}>
              <Button
                variant="outlined"
                fullWidth
                onClick={(e) => {
                  e.stopPropagation()
                  onRate(rating)
                }}
                sx={{
                  borderRadius: 1,
                  borderColor: COLORS[i],
                  color: COLORS[i],
                  fontSize: "0.78rem",
                  py: 0.75,
                  minWidth: 0,
                  "&:hover": {
                    bgcolor: `${COLORS[i]}14`,
                    borderColor: COLORS[i]
                  }
                }}>
                <Box
                  component="span"
                  sx={{ mr: 0.5, opacity: 0.5, fontSize: "0.7rem" }}>
                  {i + 1}
                </Box>
                {label}
              </Button>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}
