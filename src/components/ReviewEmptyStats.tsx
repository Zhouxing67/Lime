import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded"
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded"
import { Box, Stack, Typography, useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"

import { RATING_META } from "../utils"

interface ReviewEmptyStatsProps {
  masteredCount: number
  activeCount: number
  todayRatings: [number, number, number]
  streakDays: number
}

function StatCard({
  children,
  sx
}: {
  children: React.ReactNode
  sx?: object
}) {
  return (
    <Box
      sx={(t) => ({
        bgcolor: "background.paper",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        boxShadow: t.custom.cardShadow,
        p: 3,
        ...sx
      })}>
      {children}
    </Box>
  )
}

export default function ReviewEmptyStats({
  masteredCount,
  activeCount,
  todayRatings,
  streakDays
}: ReviewEmptyStatsProps) {
  const theme = useTheme()
  const isWide = useMediaQuery(theme.breakpoints.up("sm"))
  const total = masteredCount + activeCount
  const pct = total > 0 ? masteredCount / total : 0
  const todayTotal = todayRatings.reduce((s, n) => s + n, 0)

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", mt: 6, px: 2 }}>
      <Stack direction={isWide ? "row" : "column"} spacing={2} sx={{ mb: 2 }}>
        {/* Mastered ring card */}
        <StatCard sx={{ flex: isWide ? "0 0 240px" : "auto" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 1
            }}>
            <Box sx={{ position: "relative", width: 120, height: 120, mb: 2 }}>
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  bgcolor: "action.hover"
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: `conic-gradient(${theme.palette.primary.main} 0% ${pct * 100}%, transparent ${pct * 100}% 100%)`
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 16,
                  borderRadius: "50%",
                  bgcolor: "background.paper",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                <SchoolRoundedIcon
                  sx={{ fontSize: 20, color: "primary.main", mb: 0.5 }}
                />
                <Typography
                  sx={{
                    fontFamily: (t) => t.custom.serif,
                    fontWeight: 700,
                    fontSize: "1.5rem",
                    lineHeight: 1
                  }}>
                  {masteredCount}
                </Typography>
              </Box>
            </Box>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", textAlign: "center" }}>
              已掌握 {masteredCount} 张 · 学习中 {activeCount} 张
            </Typography>
          </Box>
        </StatCard>

        {/* Today's rating distribution card */}
        <StatCard sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
            <AutoGraphRoundedIcon
              sx={{ fontSize: 18, color: "text.secondary" }}
            />
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontWeight: 500 }}>
              今日评分分布
            </Typography>
          </Stack>

          <Box
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: "action.hover",
              overflow: "hidden",
              display: "flex",
              mb: 2
            }}>
            {todayTotal > 0 &&
              RATING_META.map((meta, i) => {
                const width = (todayRatings[i] / todayTotal) * 100
                if (width <= 0) return null
                return (
                  <Box
                    key={meta.label}
                    sx={{ width: `${width}%`, bgcolor: meta.color }}
                  />
                )
              })}
          </Box>
          {todayTotal === 0 && (
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", display: "block", mb: 2 }}>
              今日暂无评分
            </Typography>
          )}

          <Stack spacing={0.75}>
            {RATING_META.map((meta, i) => (
              <Stack
                key={meta.label}
                direction="row"
                alignItems="center"
                spacing={1}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: meta.color,
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontSize: "0.78rem", color: "text.secondary", flex: 1 }}>
                  {meta.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.78rem",
                    color: "text.primary",
                    fontWeight: 500
                  }}>
                  {todayRatings[i]}
                </Typography>
              </Stack>
            ))}
          </Stack>

          {streakDays > 0 && (
            <Typography
              variant="body2"
              sx={{ mt: 2, color: "text.secondary" }}>
              连续打卡 {streakDays} 天
            </Typography>
          )}
        </StatCard>
      </Stack>
    </Box>
  )
}
