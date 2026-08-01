import TagRoundedIcon from "@mui/icons-material/TagRounded"
import { Box, Checkbox, InputBase } from "@mui/material"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"

interface TaskRow {
  kind: "task" | "heading"
  checked: boolean
  prefix: string
  text: string
}

const TASK_RE = /^(\s*(?:[-*]|\d+\.)\s+)\[([ xX])\](.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/

function parseRows(value: string): TaskRow[] {
  const rows: TaskRow[] = []
  for (const line of value.split("\n")) {
    const t = TASK_RE.exec(line)
    if (t) {
      rows.push({ kind: "task", checked: t[2].toLowerCase() === "x", prefix: "", text: t[3].trim() })
      continue
    }
    const h = HEADING_RE.exec(line)
    if (h) {
      rows.push({ kind: "heading", checked: false, prefix: `${h[1]} `, text: h[2] })
      continue
    }
    if (line.trim()) rows.push({ kind: "task", checked: false, prefix: "", text: line.trim() })
  }
  if (rows.length === 0) rows.push({ kind: "task", checked: false, prefix: "", text: "" })
  return rows
}

function serializeRows(rows: TaskRow[]): string {
  const parts: string[] = []
  for (const r of rows) {
    if (r.kind === "task") {
      if (!r.text.trim()) continue
      parts.push(`${r.checked ? "- [x] " : "- [ ] "}${r.text}`)
    } else {
      if (!r.text.trim()) continue
      parts.push(`${r.prefix}${r.text}`)
    }
  }
  return parts.join("\n")
}

interface TaskEditorProps {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export default function TaskEditor({ value, onChange, autoFocus }: TaskEditorProps) {
  const [rows, setRows] = useState<TaskRow[]>(() => parseRows(value))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const commit = (next: TaskRow[]) => {
    setRows(next)
    onChange(serializeRows(next))
  }

  const updateRow = (i: number, patch: Partial<TaskRow>) => {
    commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const toggleRow = (i: number) => {
    updateRow(i, { checked: !rows[i].checked })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const next = [...rows]
      next.splice(i + 1, 0, { kind: "task", checked: false, prefix: "", text: "" })
      commit(next)
      requestAnimationFrame(() => refs.current[i + 1]?.focus())
    } else if (e.key === "Backspace") {
      const row = rows[i]
      if (row.kind === "task" && !row.text.trim() && rows.length > 1) {
        e.preventDefault()
        const next = rows.filter((_, idx) => idx !== i)
        commit(next)
        requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus())
      }
    }
  }

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => refs.current[0]?.focus())
  }, [autoFocus])

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      {rows.map((row, i) => (
        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {row.kind === "task" ? (
            <Checkbox
              size="small"
              checked={row.checked}
              onChange={() => toggleRow(i)}
              sx={{ p: 0.25, color: "text.disabled" }}
            />
          ) : (
            <TagRoundedIcon sx={{ fontSize: 15, color: "text.disabled", mx: 0.75 }} />
          )}
          <InputBase
            value={row.text}
            onChange={(e) => updateRow(i, { text: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, i)}
            inputRef={(el) => {
              refs.current[i] = el
            }}
            fullWidth
            placeholder={row.kind === "task" ? "新任务…" : "章节…"}
            sx={{
              fontSize: "0.9rem",
              fontFamily: (t) => t.custom.serif,
              "& input": { py: 0.75 }
            }}
          />
        </Box>
      ))}
    </Box>
  )
}
