import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded"
import PlaylistRemoveRoundedIcon from "@mui/icons-material/PlaylistRemoveRounded"
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded"
import { Box, IconButton, Stack, Tooltip } from "@mui/material"
import { useState } from "react"

import type { DisplayCard } from "../types"
import { prettyUrl } from "../utils"

interface ItemCardOperationsProps {
  item: DisplayCard
  inReview?: boolean
  mastered?: boolean
  readOnly?: boolean
  visible?: boolean
  onDelete: (id: string) => void
  onToggleReview?: (id: string) => void
  onReReview?: (id: string) => void
  onCopyToProject?: (id: string) => void
  /** Move the card to another section of the active project. */
  onMoveToSection?: (id: string) => void
}

export default function ItemCardOperations({
  item,
  inReview,
  mastered,
  readOnly,
  visible = false,
  onDelete,
  onToggleReview,
  onReReview,
  onCopyToProject,
  onMoveToSection
}: ItemCardOperationsProps) {
  const [copied, setCopied] = useState(false)

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      flexShrink={0}
      onClick={(e) => e.stopPropagation()}>
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.2s"
        }}>
        <Tooltip title={copied ? "已复制" : "剪贴板"}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              const src = item.source?.url
                ? `\n\n— ${item.source.title || prettyUrl(item.source.url)}`
                : ""
              navigator.clipboard.writeText(`> ${item.content}${src}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            sx={{ p: 0.75 }}>
            <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        {!readOnly && (
          <>
            {onCopyToProject && (
              <Tooltip title="复制到项目">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyToProject(item.id)
                  }}
                  sx={{ p: 0.75 }}>
                  <FileCopyOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {mastered && onReReview && (
              <Tooltip title="重新复习">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReReview(item.id)
                  }}
                  sx={{ p: 0.75 }}>
                  <ReplayRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onMoveToSection && (
              <Tooltip title="移动到章节">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveToSection(item.id)
                  }}
                  sx={{ p: 0.75 }}>
                  <DriveFileMoveOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onToggleReview && (
              <Tooltip title={inReview ? "移出复习" : "加入复习"}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleReview(item.id)
                  }}
                  sx={{
                    p: 0.75,
                    color: inReview ? "success.main" : "text.disabled"
                  }}>
                  {inReview ? (
                    <PlaylistRemoveRoundedIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <PlaylistAddCheckRoundedIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </Box>
      {!readOnly && (
        <Tooltip title="删除">
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(item.id)
            }}
            sx={{ p: 0.75, opacity: 0.75, "&:hover": { opacity: 1 } }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  )
}
