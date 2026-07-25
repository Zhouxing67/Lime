import type { PlasmoCSConfig } from "plasmo"

import { sendMessage } from "../types/messages"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "toast" && msg?.text) {
    showToast(msg.text)
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
    const text = sel?.toString().trim()
    if (!text) return
    console.debug("[lime:capture] Alt+S:", text.slice(0, 60))

    const payload = {
      type: "text" as const,
      content: text,
      source: {
        title: document.title,
        url: window.location.href,
        site: window.location.hostname
      }
    }
    sendMessage({ kind: "capture", payload }).catch(() => {})
  }
})
