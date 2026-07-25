import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded"
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded"
import PlaylistRemoveRoundedIcon from "@mui/icons-material/PlaylistRemoveRounded"
import { IconButton, Stack, Tooltip } from "@mui/material"
import { useState } from "react"

import type { Item } from "../types"
import { prettyUrl } from "../utils"

interface ItemCardOperationsProps {
  item: Item
  inReview?: boolean
  readOnly?: boolean
  onDelete: (id: string) => void
  onToggleReview?: (id: string) => void
  onMoveToProject?: (id: string) => void
  onCopyToProject?: (id: string) => void
  onToggleRead?: (id: string) => void
}

export default function ItemCardOperations({
  item,
  inReview,
  readOnly,
  onDelete,
  onToggleReview,
  onMoveToProject,
  onCopyToProject,
  onToggleRead
}: ItemCardOperationsProps) {
  const [copied, setCopied] = useState(false)

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      sx={{
        opacity: 0.6,
        transition: "opacity 0.2s",
        "&:hover": { opacity: 1 }
      }}
      onClick={(e) => e.stopPropagation()}>
      <Tooltip title={copied ? "已复制" : "复制引用"}>
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
          {onMoveToProject && (
            <Tooltip title="移动到…">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveToProject(item.id)
                }}
                sx={{ p: 0.75 }}>
                <DriveFileMoveOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onCopyToProject && (
            <Tooltip title="复制到…">
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
          <Tooltip title="删除">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item.id)
              }}
              sx={{ p: 0.75 }}>
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
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
          {item.type === "link" && onToggleRead && (
            <Tooltip title={item.read ? "标记未读" : "标记已读"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleRead(item.id)
                }}
                sx={{
                  p: 0.75,
                  color: item.read ? "success.main" : "text.disabled"
                }}>
                <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}
    </Stack>
  )
}
