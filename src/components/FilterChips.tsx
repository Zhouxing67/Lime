import type { ReactNode } from "react"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import { alpha, Box, Chip, Stack, TextField } from "@mui/material"

interface FilterChipsProps {
  keyword: string
  onKeywordChange: (v: string) => void
  children?: ReactNode
}

export default function FilterChips({
  keyword,
  onKeywordChange,
  children
}: FilterChipsProps) {
  return (
    <Box
      sx={(theme) => ({
        py: 1,
        px: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.03),
        borderBottom: "1px solid",
        borderColor: "divider"
      })}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="搜索当前项目中的卡片…"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          variant="outlined"
          sx={{
            minWidth: 200,
            "& .MuiOutlinedInput-root": {
              borderRadius: 1,
              fontSize: "0.8rem"
            }
          }}
          InputProps={{
            startAdornment: (
              <SearchRoundedIcon sx={{ fontSize: 16, mr: 0.5, color: "text.disabled" }} />
            )
          }}
        />
        {keyword && (
          <Chip
            label={`搜索: ${keyword}`}
            size="small"
            onDelete={() => onKeywordChange("")}
            sx={{ borderRadius: 1 }}
          />
        )}
        {children && <Box sx={{ flexGrow: 1 }} />}
        {children}
      </Stack>
    </Box>
  )
}
