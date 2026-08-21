import { Box, Chip, Stack } from "@mui/material"
import type { ReactNode } from "react"

import SearchField from "./SearchField"

interface FilterChipsProps {
  keyword: string
  onKeywordChange: (v: string) => void
  placeholder?: string
  children?: ReactNode
}

export default function FilterChips({
  keyword,
  onKeywordChange,
  placeholder = "搜索当前项目中的卡片…",
  children
}: FilterChipsProps) {
  return (
    <Box
      sx={{
        py: 1,
        px: 2,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider"
      }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap>
        <SearchField
          placeholder={placeholder}
          value={keyword}
          onChange={onKeywordChange}
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
