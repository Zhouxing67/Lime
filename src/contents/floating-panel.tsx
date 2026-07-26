import type { PlasmoCSConfig } from "plasmo"
import { createRoot } from "react-dom/client"

import FloatingPanel, { state } from "../components/FloatingPanel"
import type { PanelData } from "../components/FloatingPanel"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

// ---- Mount management ----
let panelRoot: ReturnType<typeof createRoot> | null = null
let mountEl: HTMLDivElement | null = null

// Reload content script on extension update
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "reload-extension") location.reload()
})

function safeUnmount() {
  if (panelRoot) {
    try { panelRoot.unmount() } catch { /* already destroyed */ }
    panelRoot = null
  }
}

function ensureMount(): boolean {
  if (mountEl?.isConnected) return true
  safeUnmount()
  mountEl?.remove()
  mountEl = document.createElement("div")
  mountEl.id = "lime-panel-mount"
  const shadow = mountEl.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = `
    *{box-sizing:border-box;margin:0}
    .lp{position:fixed;z-index:2147483646;width:320px;overflow:hidden}
    .pin-svg{display:block;width:16px;height:16px;transition:transform 0.2s;fill:currentColor}
  `
  shadow.appendChild(style)
  const reactRoot = document.createElement("div")
  shadow.appendChild(reactRoot)
  document.body.appendChild(mountEl)
  panelRoot = createRoot(reactRoot)
  return true
}

// ---- Show/hide ----
function clampInView(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const maxL = window.innerWidth - 340, maxT = window.innerHeight - 60
  const l = Math.max(4, Math.min(r.left, maxL))
  const t = Math.max(4, Math.min(r.top, maxT))
  if (l !== r.left) el.style.left = `${l}px`
  if (t !== r.top) el.style.top = `${t}px`
}

let hideTimer: ReturnType<typeof setTimeout> | null = null
let prevSelection = ""

document.addEventListener("mouseup", (e) => {
  if (mountEl?.contains(e.target as Node)) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 5 || text.length > 2000) {
      if (!state.isPinned) hidePanel()
      return
    }
    if (text === prevSelection && state.isOpen && state.isPinned) return
    prevSelection = text
    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) { if (!state.isPinned) hidePanel(); return }
    showPanel(text, rect)
  }, 300)
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.isPinned) { state.isPinned = false; hidePanel() }
    else if (state.isOpen) hidePanel()
  }
})

function showPanel(text: string, rect: DOMRect) {
  state.isOpen = true
  if (!ensureMount()) return
  mountEl!.style.display = "block"
  const panelProps = {
    data: { text, rect } as PanelData,
    onClose: () => { if (state.isPinned) state.isPinned = false; hidePanel() },
    onSaved: () => { if (state.isPinned) state.isPinned = false; hidePanel() }
  }
  try {
    panelRoot!.render(<FloatingPanel {...panelProps} />)
  } catch {
    safeUnmount(); mountEl?.remove(); mountEl = null
    if (!ensureMount()) return
    mountEl!.style.display = "block"
    try {
      panelRoot!.render(<FloatingPanel {...panelProps} />)
    } catch (e2) { console.warn("[lime] panel render failed:", e2) }
  }
}

function hidePanel() {
  state.isOpen = false
  if (mountEl) mountEl.style.display = "none"
}
