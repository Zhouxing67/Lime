import {
  addProject,
  addProjectCard,
  createImageCard,
  createTextCard,
  getDueCount,
  getIncompleteTodoCount,
  getRecentProjects,
  listProjects,
  touchProject
} from "./database"
import type { Project } from "./types"
import type { ExtensionMessage } from "./types/messages"
import { applyBadge } from "./utils"

async function updateBadge() {
  try {
    const total = (await getDueCount()) + (await getIncompleteTodoCount())
    applyBadge(total)
  } catch {}
}

// Initial badge on first load
updateBadge()

function notifyTab(
  tabId: number | undefined,
  saved: boolean,
  type?: string,
  projectName?: string
) {
  const typeLabel =
    type === "text" ? "文本" : type === "image" ? "图片" : "链接"
  const toastText = saved
    ? projectName
      ? `已保存${typeLabel}到 ${projectName}`
      : `已保存${typeLabel}`
    : "内容重复，已跳过"

  if (tabId) {
    chrome.tabs
      .sendMessage(tabId, { kind: "toast", text: toastText })
      .catch((e) => {
        console.warn(
          "[lime] toast to tab failed, falling back to system notification:",
          e
        )
        notifySystem(toastText)
      })
    return
  }
  notifySystem(toastText)
}

function notifySystem(text: string) {
  try {
    const icons = chrome.runtime.getManifest().icons as
      | Record<string, string>
      | undefined
    const iconUrl = icons
      ? chrome.runtime.getURL(icons["128"] || icons["48"] || "")
      : undefined
    chrome.notifications.create({
      type: "basic",
      iconUrl,
      title: "lime",
      message: text
    })
  } catch {
    // notifications API unavailable
  }
}

// Listen for database changes broadcast via storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes._dbi || changes._dbr || changes._dbt) {
    updateBadge()
  }
})

chrome.runtime.onInstalled.addListener(() => {
  updateBadge()
  // Notify all tabs to reload content scripts
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, { kind: "reload-extension" as const })
          .catch(() => {})
      }
    }
  })
})

import { addPdf } from "./database"
import { base64ToBytes, bytesToBase64 } from "./utils"

chrome.runtime.onStartup.addListener(() => {
  updateBadge()
})

chrome.runtime.onMessage.addListener((raw: any, _sender, sendResponse) => {
  const msg = raw as ExtensionMessage
  if (!msg?.kind) return

  switch (msg.kind) {
    case "webdav": {
      const controller = new AbortController()
      // Binary transfers (PDF files) need more headroom than small JSON/text.
      const timer = setTimeout(
        () => controller.abort(),
        msg.binary ? 120000 : 20000
      )
      const headers: Record<string, string> = {
        Authorization: `Basic ${msg.authBase64}`
      }
      if (msg.contentType) headers["Content-Type"] = msg.contentType
      const body = msg.binary && msg.body ? base64ToBytes(msg.body) : (msg.body ?? null)
      fetch(msg.url, {
        method: msg.method ?? "GET",
        headers,
        body: body as BodyInit | null,
        signal: controller.signal
      })
        .then(async (res) => {
          clearTimeout(timer)
          const body = msg.binary
            ? bytesToBase64(new Uint8Array(await res.arrayBuffer()))
            : await res.text()
          sendResponse({ ok: res.ok, status: res.status, body })
        })
        .catch((e) => {
          clearTimeout(timer)
          sendResponse({
            ok: false,
            status: 0,
            body: e?.message ?? "Request failed"
          })
        })
      return true
    }
    case "save-feedback": {
      notifyTab(msg.tabId, msg.saved, msg.type, msg.projectName)
      return
    }
    case "set-recent-project": {
      touchProject(msg.projectId).catch(() => {})
      return
    }
    case "capture": {
      handleCapture(msg.payload, _sender?.tab, sendResponse)
      return true
    }
    case "list-projects": {
      listProjects().then((projects) => sendResponse(projects))
      return true
    }
    case "add-project": {
      const project: Project = {
        id: crypto.randomUUID(),
        name: (msg as any).name,
        createdAt: Date.now()
      }
      addProject(project)
        .then(() => sendResponse({ ok: true, id: project.id }))
        .catch((e) =>
          sendResponse({ ok: false, error: e?.message ?? "创建失败" })
        )
      return true
    }
    case "capture-visible-tab": {
      chrome.tabs.captureVisibleTab((dataUrl) => sendResponse(dataUrl))
      return true
    }
    case "fetch-pdf": {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000)
      fetch(msg.url, { signal: controller.signal })
        .then(async (res) => {
          clearTimeout(timer)
          if (!res.ok) {
            sendResponse({ ok: false, error: `下载失败：HTTP ${res.status}` })
            return
          }
          const buf = await res.arrayBuffer()
          // PDF magic check — best-effort: the URL must point at a direct PDF.
          const head = new TextDecoder("ascii").decode(buf.slice(0, 4))
          if (!buf.byteLength || head !== "%PDF") {
            sendResponse({
              ok: false,
              error: "该 URL 不是直接 PDF 资源（尽力而为：部分站点需登录或防盗链）"
            })
            return
          }
          const name =
            msg.url.split("/").pop()?.split("?")[0] || "web.pdf"
          sendResponse({
            ok: true,
            name,
            body: bytesToBase64(new Uint8Array(buf))
          })
        })
        .catch((e) => {
          clearTimeout(timer)
          sendResponse({ ok: false, error: `下载失败：${e?.message ?? e}` })
        })
      return true
    }
    case "save-web-pdf": {
      addPdf({
        id: crypto.randomUUID(),
        name: msg.name,
        bytes: new Blob([base64ToBytes(msg.body)], { type: "application/pdf" }),
        pageCount: 0,
        addedAt: Date.now()
      })
        .then(() => {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon128.plasmo.3c1ed2d2.png",
            title: "Lime",
            message: `已保存「${msg.name}」到 Lime`
          })
          sendResponse({ ok: true })
        })
        .catch((e) => {
          sendResponse({ ok: false, error: String(e) })
        })
      return true
    }
    default: {
      sendResponse({ ok: false, error: `Unknown message kind: ${msg.kind}` })
      return false
    }
  }
})

async function handleCapture(
  payload: any,
  senderTab: chrome.tabs.Tab | undefined,
  sendResponse: (response: any) => void
) {
  // If payload specifies a projectId, use it; otherwise fall back to most recent
  const targetProject = payload.projectId
    ? (await listProjects()).find((p) => p.id === payload.projectId)
    : (await getRecentProjects(1))[0]

  if (targetProject) {
    // Captured cards land in 未分类 (no sectionId) — the same as before.
    // Text/image captures go through the typed creation interfaces (the raw
    // builder is not a business-layer creation API).
    const saved =
      payload.type === "image"
        ? await createImageCard({
            image: payload.content,
            title: payload.title,
            source: payload.source,
            projectId: targetProject.id
          })
        : await createTextCard({
            content: payload.content,
            title: payload.title,
            source: payload.source,
            projectId: targetProject.id
          })
    if (saved) touchProject(targetProject.id).catch(() => {})
    notifyTab(senderTab?.id, saved, payload.type)
    sendResponse({ ok: true, saved })
    return
  }

  // No projects: fail the save with a clear reason — the capture panel keeps
  // its draft and shows "请先创建一个项目" (the user creates one in the
  // options page, then re-saves). No pending-capture popup.
  if (senderTab?.id) {
    chrome.tabs
      .sendMessage(senderTab.id, { kind: "toast", text: "请先创建一个项目" })
      .catch(() => {})
  }
  sendResponse({ ok: false, error: "no-project" })
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
