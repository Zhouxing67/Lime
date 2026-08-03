import type { PlasmoCSConfig } from "plasmo"

import { sendMessage } from "../types/messages"
import { currentSourceMeta } from "../utils"
import { selectionWithMath } from "./formula"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "toast" && msg?.text) {
    showToast(msg.text)
  }
  if (msg?.kind === "reload-extension") {
    location.reload()
  }
})

function showToast(text: string) {
  const toast = document.createElement("div")
  toast.textContent = text
  Object.assign(toast.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "52px",
    right: "24px",
    background: "rgba(0,0,0,0.8)",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px"
  })
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
}

document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key === "s") {
    e.preventDefault()
    const sel = window.getSelection()
    const text = selectionWithMath(sel).trim()
    if (!text) return

    const payload = {
      type: "text" as const,
      content: text,
      source: currentSourceMeta()
    }
    sendMessage({ kind: "capture", payload }).catch(() => {})
  }
})
