import { Box } from "@mui/material"
import type { SxProps, Theme } from "@mui/material"

/** Neutral container: background.default + hairline divider + borderRadius 1.
 *  The sidebar's grouping wells (新建项目/稍后阅读, review dates, backup
 *  groups, todo filters) + any dialog wells share this one surface. */
export default function Well({
  children,
  sx
}: {
  children: React.ReactNode
  sx?: SxProps<Theme>
}) {
  return (
    <Box
      sx={{
        bgcolor: "background.default",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        p: 0.75,
        ...sx
      }}>
      {children}
    </Box>
  )
}
