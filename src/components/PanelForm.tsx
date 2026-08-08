import React, { useCallback, useEffect, useState } from "react"

import type { Project } from "../types"
import { sendMessage } from "../types/messages"
import {
  appendMarkdownImage,
  currentSourceMeta,
  extractMarkdownImages,
  removeMarkdownImage
} from "../utils"
import { IconCrop, IconPlus } from "./panelIcons"
import type { PanelColors } from "./panelTheme"
import { iconBtnStyle, inputStyle } from "./panelTheme"

/** The capture form shared by the floating panel and the right sidebar. Owns
 *  the form-local state (save/project-create/image/link quick-inputs); the
 *  draft itself (title/content/images) stays controlled from the entry. */
export default function PanelForm({
  colors,
  dataText,
  title,
  setTitle,
  content,
  setContent,
  imageDraft,
  setImageDraft,
  captureType,
  projects,
  selectedProjectId,
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onCaptureRegion,
  onClose
}: {
  colors: PanelColors
  dataText: string
  title: string
  setTitle: (v: string) => void
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  imageDraft: string
  setImageDraft: (v: string) => void
  captureType: "text" | "image"
  projects: Project[]
  selectedProjectId: string
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  /** Reports whether the draft holds content (content or an image draft) — the
   *  entry uses it to decide append-vs-fill on the next Alt+L. */
  onDirtyChange: (isDirty: boolean) => void
  /** Enter the region-select (框选) capture mode — the entry hides the panel,
   *  the user drags a rectangle, a screenshot is cropped to it. */
  onCaptureRegion: () => void
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")
  const [linkDraft, setLinkDraft] = useState("")

  // Reset transient state when a new capture comes in.
  useEffect(() => {
    setSaving(false)
    setSaved(false)
    setError("")
    setLinkDraft("")
  }, [dataText])

  // Load projects
  const load = useCallback(async () => {
    try {
      const list: Project[] =
        (await sendMessage({ kind: "list-projects" })) ?? []
      onProjectsChange(list)
      const valid = list.find((p) => p.id === selectedProjectId)
      if (valid) {
        onSelectedProjectChange(selectedProjectId)
      } else if (list.length > 0) {
        onSelectedProjectChange(list[0].id)
      } else {
        onSelectedProjectChange("")
      }
    } catch (err) {
      console.warn("[lime] load projects failed:", err)
    }
  }, [onProjectsChange, onSelectedProjectChange, selectedProjectId])
  useEffect(() => {
    load()
  }, [load])

  // A draft = content or an image draft (the title is NOT a draft). The entry's
  // dirtyRef drives Alt+L append-vs-fill — report every change, including the
  // transition back to empty (a cleared draft must allow overwrite again).
  useEffect(() => {
    onDirtyChange(content.trim() !== "" || imageDraft.trim() !== "")
  }, [content, imageDraft, onDirtyChange])

  const save = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true)
    setError("")
    try {
      const res = await sendMessage<{ ok: boolean; saved?: boolean }>({
        kind: "capture",
        payload: {
          type: captureType,
          content: content.trim(),
          title: title.trim() || undefined,
          source: currentSourceMeta(),
          projectId: selectedProjectId || undefined
        }
      })
      if (res?.saved === false) {
        setError("内容重复，已跳过")
        setSaving(false)
        return
      }
      setSaved(true)
      // Keep the panel open after save; only the explicit close button closes it.
      setTimeout(() => {
        setSaved(false)
        setSaving(false)
        setContent("")
        setTitle("")
        setImageDraft("")
        setLinkDraft("")
      }, 1200)
    } catch (err) {
      console.warn("[lime] save failed:", err)
      setError("保存失败")
      setSaving(false)
    }
  }, [content, title, captureType, selectedProjectId, setContent, setImageDraft, setTitle])

  const createProject = useCallback(async () => {
    if (!newName.trim()) return
    setError("")
    try {
      const res = await sendMessage<{
        ok: boolean
        id?: string
        error?: string
      }>({ kind: "add-project", name: newName.trim() })
      if (res?.ok) {
        setNewName("")
        setCreating(false)
        await load()
      } else {
        setError(res?.error ?? "项目名称已存在")
      }
    } catch (err) {
      console.warn("[lime] create project failed:", err)
      setError("创建失败")
    }
  }, [newName, load])

  const iconBtn = iconBtnStyle(colors)

  // Images live inside the content as Markdown tokens.
  const panelImages = extractMarkdownImages(content)
  const addImage = useCallback(
    (url: string) => {
      const trimmed = url.trim()
      if (!trimmed || panelImages.includes(trimmed)) return
      setContent((prev) => appendMarkdownImage(prev, trimmed))
    },
    [panelImages, setContent]
  )
  const removeImage = useCallback((url: string) => {
    setContent((prev) => removeMarkdownImage(prev, url))
  }, [setContent])

  /** Insert `[摘要](url)` into the content (label forced from the 摘要 field). */
  const addLink = useCallback(() => {
    const url = linkDraft.trim()
    const label = title.trim()
    if (!url || !label) return
    setContent((prev) => {
      const token = `[${label}](${url})`
      const trimmed = prev.trim()
      return trimmed ? `${trimmed}\n\n${token}` : token
    })
    setLinkDraft("")
  }, [linkDraft, title, setContent])

  return (
    <>
      {/* Scrollable middle (project row + form) — the footer stays pinned. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      {/* Business row: project selection + create */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          background: colors.bgDefault,
          borderBottom: `1px solid ${colors.divider}`
        }}>
        <span
          style={{
            fontSize: 11,
            color: colors.textSecondary,
            flexShrink: 0,
            letterSpacing: "0.03em"
          }}>
          保存到
        </span>
        <span
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            display: "inline-flex",
            alignItems: "center"
          }}>
          <select
            className="lime-input"
            value={selectedProjectId}
            onChange={(e) => onSelectedProjectChange(e.target.value)}
            style={{
              ...inputStyle(colors),
              padding: "5px 24px 5px 8px",
              cursor: "pointer",
              fontWeight: 500,
              appearance: "none",
              WebkitAppearance: "none",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap"
            }}>
            {projects.length === 0 && (
              <option value="" disabled>
                暂无项目，请先新建
              </option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `5px solid ${colors.textSecondary}`,
              pointerEvents: "none"
            }}
          />
        </span>
        <button
          type="button"
          className="lime-icon-btn"
          style={iconBtn}
          onClick={() => setCreating(!creating)}
          title="新建项目">
          <IconPlus />
        </button>
      </div>

      {/* Create project */}
      {creating && (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "8px 12px",
            background: colors.bgDefault
          }}>
          <input
            className="lime-input"
            placeholder="项目名称…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            autoFocus
            style={inputStyle(colors)}
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={createProject}
            style={{
              border: "none",
              background: colors.primary,
              color: "#fff",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
              opacity: !newName.trim() ? 0.5 : 1,
              flexShrink: 0
            }}>
            创建
          </button>
        </div>
      )}

      {/* Inputs — scrollable so a tall content box never clips */}
      <div style={{ padding: "8px 12px 4px" }}>
        <input
          className="lime-input"
          placeholder="摘要（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...inputStyle(colors), fontWeight: 500, marginBottom: 8 }}
        />
        {captureType === "image" ? (
          /* Image capture: preview + 摘要 + save (no body / URL inputs). */
          <img
            src={content}
            alt=""
            style={{
              width: "100%",
              maxHeight: 260,
              objectFit: "contain",
              borderRadius: 8,
              background: colors.bgHover,
              display: "block"
            }}
          />
        ) : (
          <>
            <textarea
              className="lime-input"
              placeholder="输入内容…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              style={{
                ...inputStyle(colors),
                lineHeight: 1.7,
                resize: "vertical",
                maxHeight: 420
              }}
            />

            {/* Image URL input — plain DOM, no MUI (content-script bundle) */}
            <div
              style={{
                display: "flex",
                gap: 4,
                marginTop: 10,
                paddingTop: 8,
                borderTop: `1px solid ${colors.divider}`
              }}>
              <input
                className="lime-input"
                placeholder="图片 URL（可选，回车插入）"
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addImage(imageDraft)
                    setImageDraft("")
                  }
                }}
                style={{
                  ...inputStyle(colors),
                  padding: "6px 10px",
                  fontSize: 12
                }}
              />
              <button
                type="button"
                disabled={!imageDraft.trim()}
                title="插入图片"
                onClick={() => {
                  addImage(imageDraft)
                  setImageDraft("")
                }}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "0 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: imageDraft.trim()
                    ? colors.primary
                    : colors.bgHover,
                  color: imageDraft.trim() ? "#fff" : colors.textDisabled,
                  flexShrink: 0
                }}>
                ＋
              </button>
              <button
                type="button"
                title="框选网页区域"
                onClick={onCaptureRegion}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "0 9px",
                  cursor: "pointer",
                  background: colors.bgHover,
                  color: colors.textSecondary,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center"
                }}>
                <IconCrop />
              </button>
            </div>

            {/* Link quick-input: pastes [摘要](url) into the content */}
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input
                className="lime-input"
                placeholder="链接 URL（可选，以摘要为标签插入）"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addLink()
                  }
                }}
                style={{
                  ...inputStyle(colors),
                  padding: "6px 10px",
                  fontSize: 12
                }}
              />
              <button
                type="button"
                disabled={!linkDraft.trim() || !title.trim()}
                onClick={addLink}
                title={title.trim() ? "插入链接" : "请先填写摘要作为链接标签"}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "0 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background:
                    linkDraft.trim() && title.trim()
                      ? colors.primary
                      : colors.bgHover,
                  color:
                    linkDraft.trim() && title.trim()
                      ? "#fff"
                      : colors.textDisabled,
                  flexShrink: 0
                }}>
                ＋
              </button>
            </div>
          </>
        )}
        {panelImages.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
              gap: 4,
              marginTop: 6
            }}>
            {panelImages.map((url) => (
              <div
                key={url}
                style={{
                  position: "relative",
                  borderRadius: 6,
                  overflow: "hidden",
                  aspectRatio: "1 / 1",
                  background: colors.bgHover
                }}>
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block"
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 16,
                    height: 16,
                    fontSize: 10,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px 10px",
          background: colors.bgDefault,
          borderTop: `1px solid ${colors.divider}`,
          marginTop: "auto"
        }}>
        {error && (
          <span
            style={{ fontSize: 11, color: colors.error, marginRight: "auto" }}>
            {error}
          </span>
        )}
        {!error && <span style={{ flex: 1 }} />}
        <button
          type="button"
          onClick={onClose}
          style={{
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 600,
            background: colors.bgPaper,
            color: colors.textSecondary,
            border: `1px solid ${colors.borderStrong}`
          }}>
          取消
        </button>
        <button
          type="button"
          disabled={saving || saved || !content.trim()}
          onClick={save}
          style={{
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 600,
            border: "none",
            color: "#fff",
            background: saved ? colors.success : colors.primary,
            opacity: saving || !content.trim() ? 0.5 : 1
          }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </>
  )
}
