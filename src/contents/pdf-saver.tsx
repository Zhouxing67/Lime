import type { PlasmoCSConfig } from "plasmo"
import { useState } from "react"

import { sendMessage } from "../types/messages"
import { bytesToBase64 } from "../utils"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

/** PDF tab detection: the URL ends with .pdf (ignoring query/hash) or the
 *  document is served as application/pdf (the Edge built-in viewer keeps the
 *  original URL). Local file:// PDFs are out of scope (no content-script match). */
function isPdfTab(): boolean {
  if (document.contentType === "application/pdf") return true
  return /\.pdf(\?|#|$)/i.test(location.href)
}

const PRIMARY = "#4f46e5"
const FG = "#ffffff"
const HOVER = "#4338ca"

/** 常驻悬浮球: 保存网页 PDF 到 Lime. */
export default function PdfSaver() {
  const [visible] = useState(isPdfTab())
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  )
  const [error, setError] = useState("")

  const handleSave = async () => {
    setState("saving")
    setError("")
    try {
      const res = await fetch(location.href, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const name =
        location.pathname.split("/").pop()?.split("?")[0] || "web.pdf"
      const out = await sendMessage<{ ok: boolean; error?: string }>(
        {
          kind: "save-web-pdf",
          url: location.href,
          name,
          body: bytesToBase64(new Uint8Array(buf))
        },
        // The SW re-hashes the whole blob (content-hash id) + writes it to
        // IndexedDB — large PDFs take a while. A dead-SW hang must still
        // unblock the ball (the timeout rejects → the catch resets to "error").
        120_000
      )
      if (!out?.ok) throw new Error(out?.error ?? "保存失败")
      setState("saved")
      window.setTimeout(() => setState("idle"), 2000)
    } catch (e) {
      setState("error")
      setError(e instanceof Error ? e.message : String(e))
      window.setTimeout(() => setState("idle"), 3000)
    }
  }

  if (!visible) return null

  const label =
    state === "saving"
      ? "保存中…"
      : state === "saved"
        ? "已保存 ✓"
        : state === "error"
          ? "保存失败"
          : "保存到 Lime"

  return (
    <>
      <button
        onClick={handleSave}
        disabled={state === "saving"}
        data-lime-pdf-saver="1"
        title={state === "error" ? error : "将当前 PDF 保存到 Lime"}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          border: "none",
          borderRadius: 999,
          background: state === "error" ? "#dc2626" : state === "saved" ? "#16a34a" : PRIMARY,
          color: FG,
          fontSize: 13,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          opacity: state === "idle" ? 0.92 : 1,
          transition: "background 0.15s ease, opacity 0.15s ease"
        }}
        onMouseEnter={(e) => {
          if (state === "idle") e.currentTarget.style.background = HOVER
        }}
        onMouseLeave={(e) => {
          if (state === "idle") e.currentTarget.style.background = PRIMARY
        }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            stroke={FG}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <path d="M14 2v6h6" stroke={FG} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      <span
        style={{
          position: "fixed",
          right: 20,
          bottom: 58,
          zIndex: 2147483647,
          display: state === "error" ? "block" : "none",
          maxWidth: 260,
          padding: "6px 10px",
          borderRadius: 6,
          background: "#111827",
          color: "#f9fafb",
          fontSize: 12,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
        }}>
        {error}
      </span>
    </>
  )
}
