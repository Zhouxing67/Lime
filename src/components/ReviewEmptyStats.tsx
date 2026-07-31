import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded"
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded"
import { Box, Button, Stack, Typography, useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"

const RATING_LABELS = ["重来", "困难", "良好", "简单"]
const RATING_COLORS = ["#ef4444", "#f97316", "#22c55e", "#3b82f6"]

interface ReviewEmptyStatsProps {
  masteredCount: number
  activeCount: number
  todayRatings: [number, number, number, number]
  streakDays: number
  onExit: () => void
}

export default function ReviewEmptyStats({
  masteredCount,
  activeCount,
  todayRatings,
  streakDays,
  onExit
}: ReviewEmptyStatsProps) {
  const theme = useTheme()
  const isWide = useMediaQuery(theme.breakpoints.up("sm"))
  const total = masteredCount + activeCount
  const pct = total > 0 ? masteredCount / total : 0

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", mt: 8, px: 2 }}>
      <Stack direction={isWide ? "row" : "column"} spacing={2} sx={{ mb: 2 }}>
        {/* Ring card */}
        <Box
          sx={{
            flex: isWide ? "0 0 240px" : "auto",
            bgcolor: "background.paper",
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            py: 4,
            px: 3
          }}>
          <Box
            sx={{
              position: "relative",
              width: 120,
              height: 120
            }}>
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
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                {masteredCount}
              </Typography>
            </Box>
          </Box>
          <Typography
            variant="body2"
            sx={{ mt: 1.5, color: "text.secondary", textAlign: "center" }}>
            已掌握 {masteredCount} 张 · 学习中 {activeCount} 张
          </Typography>
        </Box>

        {/* Stats card */}
        <Box
          sx={{
            flex: 1,
            bgcolor: "background.paper",
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            py: 3,
            px: 3
          }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ mb: 2 }}>
            <AutoGraphRoundedIcon
              sx={{ fontSize: 18, color: "text.secondary" }}
            />
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontWeight: 500 }}>
              今日评分分布
            </Typography>
          </Stack>

          <Stack spacing={1}>
            {RATING_LABELS.map((label, i) => {
              const count = todayRatings[i]
              const max = Math.max(...todayRatings, 1)
              const width = (count / max) * 100
              return (
                <Stack
                  key={label}
                  direction="row"
                  alignItems="center"
                  spacing={1}>
                  <Typography
                    variant="caption"
                    sx={{ width: 28, color: RATING_COLORS[i], flexShrink: 0 }}>
                    {label}
                  </Typography>
                  <Box
                    sx={{
                      flex: 1,
                      height: 14,
                      borderRadius: "7px",
                      bgcolor: "action.hover",
                      overflow: "hidden"
                    }}>
                    <Box
                      sx={{
                        width: `${width}%`,
                        height: "100%",
                        bgcolor: RATING_COLORS[i],
                        borderRadius: "7px",
                        transition: "width 0.5s ease"
                      }}
                    />
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      width: 24,
                      textAlign: "right",
                      color: "text.secondary",
                      flexShrink: 0
                    }}>
                    {count}
                  </Typography>
                </Stack>
              )
            })}
          </Stack>

          {streakDays > 0 && (
            <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
              🔥 连续打卡 {streakDays} 天
            </Typography>
          )}
        </Box>
      </Stack>

      <Button
        variant="outlined"
        fullWidth
        onClick={onExit}
        sx={{ borderRadius: 1, py: 1 }}>
        退出复习
      </Button>
    </Box>
  )
}
