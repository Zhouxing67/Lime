import { useRef, useState } from "react"
import {
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContentText,
  IconButton,
  Tooltip,
  Typography
} from "@mui/material"
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded"
import NoteAddRoundedIcon from "@mui/icons-material/NoteAddRounded"
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded"
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded"

import CardEditorView, {
  type CardEditorValues,
  type CardEditorHandle
} from "./CardEditorView"
import DeleteConfirmDialog from "./DeleteConfirmDialog"
import DialogShell from "./DialogShell"
import MarkdownToolbar from "./MarkdownToolbar"
import { typeIcon } from "./CardRenderer"
import type { EditorView } from "./MarkdownEditor"
import { cardKind } from "../utils/cards"
import type { DisplayCard } from "../types"

const VIEW_STATES = ["edit", "split", "preview"] as const
const VIEW_LABELS: Record<EditorView, string> = {
  edit: "编辑",
  split: "分栏",
  preview: "预览"
}
const VIEW_ICONS: Record<EditorView, JSX.Element> = {
  edit: <EditNoteRoundedIcon fontSize="small" />,
  split: <ViewWeekRoundedIcon fontSize="small" />,
  preview: <VisibilityRoundedIcon fontSize="small" />
}

function WorkspaceHeader({
  view,
  createType,
  onToggleType,
  headerTitle,
  dirty,
  editorView,
  onViewChange,
  showViewSegmented,
  onClose
}: {
  view: "edit" | "create"
  createType: "text" | "image"
  onToggleType: () => void
  headerTitle: string
  dirty: boolean
  editorView: EditorView
  onViewChange: (v: EditorView) => void
  showViewSegmented: boolean
  onClose: () => void
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        height: 56,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0
      }}>
      <Tooltip title="返回">
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            p: 0.75,
            color: "text.secondary",
            "&:hover": { color: "primary.main" }
          }}>
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {view === "create" && (
        <Tooltip title={createType === "text" ? "切换为图片卡" : "切换为文本卡"}>
          <IconButton
            size="small"
            onClick={onToggleType}
            sx={{
              p: 0.75,
              color: "text.secondary",
              "&:hover": { color: "primary.main" }
            }}>
            {typeIcon(createType)}
          </IconButton>
        </Tooltip>
      )}
      <Typography
        sx={{
          fontSize: "0.9rem",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0
        }}>
        {headerTitle}
      </Typography>
      {dirty && (
        <>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "primary.main",
              flexShrink: 0
            }}
          />
          <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
            未保存
          </Typography>
        </>
      )}
      <Box sx={{ flex: 1 }} />
      {showViewSegmented && (
      <Box
        sx={{
          display: "flex",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "background.paper"
        }}>
        {VIEW_STATES.map((v) => (
          <Tooltip key={v} title={VIEW_LABELS[v]}>
            <IconButton
              size="small"
              onClick={() => onViewChange(v)}
              sx={{
                p: 0.5,
                borderRadius: 0,
                color: editorView === v ? "primary.main" : "text.secondary",
                bgcolor: editorView === v ? "action.selected" : "transparent",
                "&:hover": { bgcolor: "action.hover" }
              }}>
              {VIEW_ICONS[v]}
            </IconButton>
          </Tooltip>
        ))}
      </Box>
      )}
    </Box>
  )
}

function WorkspaceActionBar({
  busyAction,
  onDiscard,
  onSaveDraft,
  onSave
}: {
  busyAction: "save" | "draft" | null
  onDiscard: () => void
  onSaveDraft: () => void
  onSave: () => void
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 1,
        px: 2,
        py: 1,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0
      }}>
      <Tooltip title="丢弃">
        <span>
          <IconButton
            size="small"
            onClick={onDiscard}
            disabled={busyAction !== null}
            sx={{
              p: 0.75,
              color: "text.secondary",
              "&:hover": { color: "error.main", bgcolor: "action.hover" }
            }}>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="存草稿">
        <span>
          <IconButton
            size="small"
            onClick={onSaveDraft}
            disabled={busyAction !== null}
            sx={{
              p: 0.75,
              color: "text.secondary",
              "&:hover": { color: "primary.main", bgcolor: "action.hover" }
            }}>
            <NoteAddRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="保存">
        <span>
          <IconButton
            size="small"
            onClick={onSave}
            disabled={busyAction !== null}
            sx={{
              p: 0.75,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
              "&.Mui-disabled": {
                bgcolor: "action.disabled",
                color: "text.disabled"
              }
            }}>
            {busyAction === "save" ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CheckRoundedIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

/** The workspace card mode — Header 56px (back + title + dirty dot + global
 *  view segmented), a conditional MarkdownToolbar (edit/split + focus), a
 *  paper-framed full-width editing surface, and a sticky bottom ActionBar
 *  (discard / save-draft / save). */
export default function CardWorkspace({
  view,
  card,
  onClose,
  onSave,
  onSaveDraft,
  onDiscard
}: {
  view: "edit" | "create"
  card: DisplayCard | null
  onClose: () => void
  onSave: (values: CardEditorValues, type: "text" | "image" | "placed") => void
  onSaveDraft: (values: CardEditorValues, type: "text" | "image" | "placed") => void
  onDiscard: () => void
}) {
  const [createType, setCreateType] = useState<"text" | "image">("text")
  const [editorView, setEditorView] = useState<EditorView>("split")
  const [dirty, setDirty] = useState(false)
  const [editorFocused, setEditorFocused] = useState(false)
  const [editorPage, setEditorPage] = useState<"edit" | "readonly">("edit")
  const [busyAction, setBusyAction] = useState<"save" | "draft" | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const editorRef = useRef<CardEditorHandle>(null)

  // The header 返回 intercepts a dirty workspace: unsaved edits would be lost
  // silently, so confirm with 丢弃 / 存草稿 / 取消.
  const handleRequestClose = () => {
    if (dirty) setLeaveConfirmOpen(true)
    else onClose()
  }

  const handleLeaveDiscard = () => {
    setLeaveConfirmOpen(false)
    onDiscard()
  }

  const handleLeaveSaveDraft = () => {
    setLeaveConfirmOpen(false)
    handleSaveDraft()
  }

  const editType: "text" | "image" | "placed" =
    view === "edit" && card ? cardKind(card) : createType

  const headerTitle =
    view === "create"
      ? "新建卡片"
      : card?.title?.trim() || "未命名卡片"

  const run = async (
    action: "save" | "draft",
    fn: () => void | Promise<void>
  ) => {
    setBusyAction(action)
    try {
      await fn()
    } finally {
      setBusyAction(null)
    }
  }

  const handleSave = () =>
    run("save", () =>
      onSave(editorRef.current?.getValues() ?? {}, editType)
    )

  const handleSaveDraft = () =>
    run("draft", () =>
      onSaveDraft(editorRef.current?.getValues() ?? {}, editType)
    )

  const handleDiscardConfirm = () => {
    setDiscardOpen(false)
    onDiscard()
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <WorkspaceHeader
        view={view}
        createType={createType}
        onToggleType={() => setCreateType((t) => (t === "text" ? "image" : "text"))}
        headerTitle={headerTitle}
        dirty={dirty}
        editorView={editorView}
        onViewChange={setEditorView}
        showViewSegmented={editorPage === "edit"}
        onClose={handleRequestClose}
      />

      {/* Toolbar — shows only while actively editing (edit/split + focus) */}
      {editorPage === "edit" &&
        editorView !== "preview" &&
        editorFocused && (
          <MarkdownToolbar
            onTool={(tool) => editorRef.current?.applyTool(tool)}
          />
        )}

      {/* Content — paper-framed editing surface */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        <Box
          sx={{
            maxWidth: 1400,
            mx: "auto",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            boxShadow: (t) => t.custom.cardShadow,
            height: "100%"
          }}>
          {view === "edit" && card ? (
            <CardEditorView
              ref={editorRef}
              type={cardKind(card)}
              mode="edit"
              initial={{
                title: card.title,
                content: card.content,
                image: card.image,
                comment: card.comment
              }}
              view={editorView}
              onDirtyChange={setDirty}
              onFocusChange={setEditorFocused}
              onPageChange={setEditorPage}
              readonlyImage={card.image}
              readonlyText={
                cardKind(card) === "placed" && !card.image
                  ? card.content
                  : undefined
              }
            />
          ) : view === "create" ? (
            <CardEditorView
              ref={editorRef}
              type={createType}
              mode="create"
              initial={{}}
              view={editorView}
              onDirtyChange={setDirty}
              onFocusChange={setEditorFocused}
              onPageChange={setEditorPage}
            />
          ) : null}
        </Box>
      </Box>

      <WorkspaceActionBar
        busyAction={busyAction}
        onDiscard={() => setDiscardOpen(true)}
        onSaveDraft={handleSaveDraft}
        onSave={handleSave}
      />

      <DeleteConfirmDialog
        open={discardOpen}
        batch={false}
        count={1}
        itemLabel="本次编辑"
        message="将丢弃未保存的更改"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={handleDiscardConfirm}
      />

      <DialogShell
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        title="未保存的更改"
        maxWidth="xs"
        actions={
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setLeaveConfirmOpen(false)}>取消</Button>
            <Button color="inherit" onClick={handleLeaveSaveDraft}>
              存草稿
            </Button>
            <Button variant="contained" color="error" onClick={handleLeaveDiscard}>
              丢弃
            </Button>
          </DialogActions>
        }>
        <DialogContentText>存在未保存内容，返回将丢弃</DialogContentText>
      </DialogShell>
    </Box>
  )
}
