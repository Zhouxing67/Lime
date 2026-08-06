import { Box, Menu, MenuItem, Typography } from "@mui/material"
import { Fragment } from "react"

import type { Section } from "../types"

/** The move-to-section picker as a lightweight Menu: L1/L2 tree + 未分类.
 *  Same surface as the PlaceCardMenu / CopyCardsMenu. */
export default function MoveToSectionMenu({
  anchor,
  sections,
  currentSectionId,
  onMove,
  onClose
}: {
  anchor: HTMLElement | null
  sections: Section[]
  currentSectionId: string | null
  onMove: (sectionId: string | null) => void
  onClose: () => void
}) {
  const l1 = sections.filter((s) => s.level === 1)
  const byParent = (parentId: string | null) =>
    sections.filter((s) => s.parentId === parentId)

  const SectionRow = ({
    section,
    indent
  }: {
    section: Section
    indent: number
  }) => (
    <MenuItem
      onClick={() => {
        onMove(section.id)
        onClose()
      }}
      sx={{
        pl: 1.5 + indent * 2,
        gap: 1,
        fontSize: "0.8rem",
        ...(section.id === currentSectionId
          ? { bgcolor: "action.selected", color: "primary.main" }
          : {})
      }}>
      <Box
        component="span"
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
        {section.title}
      </Box>
    </MenuItem>
  )

  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      slotProps={{
        paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 220 } }
      }}>
      <Typography
        sx={{
          fontSize: "0.68rem",
          color: "text.disabled",
          px: 1.5,
          pt: 0.5,
          pb: 0.25
        }}>
        移动到章节
      </Typography>
      {sections.length === 0 && (
        <Typography
          sx={{ fontSize: "0.75rem", color: "text.secondary", px: 1.5, py: 1 }}>
          该项目还没有章节
        </Typography>
      )}
      {l1.map((s) => (
        <Fragment key={s.id}>
          <SectionRow section={s} indent={0} />
          {byParent(s.id).map((c) => (
            <SectionRow key={c.id} section={c} indent={1} />
          ))}
        </Fragment>
      ))}
      {currentSectionId !== null && (
        <>
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 0.5 }} />
          <MenuItem
            onClick={() => {
              onMove(null)
              onClose()
            }}
            sx={{ gap: 1, fontSize: "0.8rem", color: "text.secondary" }}>
            移回未分类
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
