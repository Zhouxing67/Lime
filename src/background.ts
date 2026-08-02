import {
  createMenus,
  ensureMenusReady,
  rebuildProjectMenus,
  rebuildRecentMenus
} from "./background/menus"
import {
  addItem,
  addProject,
  getDueReviews,
  getRecentProjects,
  listProjects,
  searchItems,
  touchProject,
  tx
} from "./database"
import type { Item, Project, SourceMeta } from "./types"
import type { ExtensionMessage } from "./types/messages"
import { isTodoComplete } from "./utils"

async function updateBadge() {
  try {
    const due = await getDueReviews()
    const todos = await searchItems({ type: "todo" })
    const incompleteTodos = todos.filter((t) => !isTodoComplete(t.content)).length
    const total = due.length + incompleteTodos
    chrome.action.setBadgeText({
      text: total > 0 ? String(total) : ""
    })
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" })
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

function createItem(data: {
  type: Item["type"]
  content: string
  title?: string
  source?: SourceMeta
  projectId?: string
}): Item {
  const item: Item = {
    id: crypto.randomUUID(),
    type: data.type,
    title: data.title,
    content: data.content,
    source: data.source,
    createdAt: Date.now(),
    projectId: data.projectId
  }
  return item
}

// Listen for database changes broadcast via storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes._dbp) {
    rebuildProjectMenus().catch(() => {})
    rebuildRecentMenus().catch(() => {})
  }
  if (changes._dbi) {
    updateBadge()
  }
})

chrome.runtime.onInstalled.addListener(() => {
  createMenus().catch((e) => console.warn("onInstalled createMenus failed:", e))
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

chrome.runtime.onStartup.addListener(() => {
  createMenus().catch((e) => console.warn("onStartup createMenus failed:", e))
  updateBadge()
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    await ensureMenusReady()
    const { menuItemId } = info

    const url = info.pageUrl ?? tab?.url ?? ""
    const title = tab?.title ?? ""
    const site = url ? new URL(url).hostname : undefined

    const base = {
      source: { title, url, site },
      createdAt: Date.now()
    }

    const saveAndNotify = async (
      type: Item["type"],
      content: string,
      projectId?: string,
      projectName?: string
    ) => {
      const item = createItem({ type, content, source: base.source, projectId })
      const saved = await addItem(item)
      if (saved && projectId) {
        touchProject(projectId).catch(() => {})
      }
      notifyTab(tab?.id, saved, type, projectName)
    }

    const captureAndSave = async (
      projectId?: string,
      projectName?: string
    ): Promise<void> => {
      if (info.selectionText) {
        await saveAndNotify("text", info.selectionText, projectId, projectName)
        return
      }
      if (info.srcUrl) {
        await saveAndNotify("image", info.srcUrl, projectId, projectName)
        return
      }
      if (info.linkUrl) {
        await saveAndNotify("link", info.linkUrl, projectId, projectName)
        return
      }
      if (tab?.url) {
        await saveAndNotify("link", tab.url, projectId, projectName)
      }
    }

    // ---- "新建项目并加入" ----
    if (menuItemId === "pickquote-new-project") {
      let captureType: Item["type"] = "text"
      let captureContent = ""
      if (info.selectionText) {
        captureType = "text"
        captureContent = info.selectionText
      } else if (info.srcUrl) {
        captureType = "image"
        captureContent = info.srcUrl
      } else if (info.linkUrl) {
        captureType = "link"
        captureContent = info.linkUrl
      } else if (tab?.url) {
        captureType = "link"
        captureContent = tab.url
      } else {
        return
      }

      await new Promise<void>((resolve) =>
        chrome.storage.session.set(
          {
            pendingCapture: {
              type: captureType,
              content: captureContent,
              source: base.source
            },
            pendingTabId: tab?.id
          },
          () => resolve()
        )
      )
      chrome.windows.create({
        url: chrome.runtime.getURL("tabs/new-project.html"),
        type: "popup",
        width: 480,
        height: 460
      })
      return
    }

    // ---- "最近项目" ----
    if (
      typeof menuItemId === "string" &&
      menuItemId.startsWith("pickquote-recent-")
    ) {
      const idx = parseInt(menuItemId.slice("pickquote-recent-".length), 10)
      const recent = await getRecentProjects(3)
      const project = recent[idx]
      if (!project) return
      await captureAndSave(project.id, project.name)
      return
    }

    // ---- "加入已有项目" ----
    if (
      typeof menuItemId === "string" &&
      menuItemId.startsWith("pickquote-proj-")
    ) {
      const projectId = menuItemId.slice("pickquote-proj-".length)
      const projects = await listProjects()
      const project = projects.find((p) => p.id === projectId)
      await captureAndSave(projectId, project?.name ?? "未知项目")
      return
    }
  } catch (e) {
    console.error("contextMenus.onClicked failed:", e)
  }
})

chrome.runtime.onMessage.addListener((raw: any, _sender, sendResponse) => {
  const msg = raw as ExtensionMessage
  if (!msg?.kind) return

  switch (msg.kind) {
    case "webdav": {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      const headers: Record<string, string> = {
        Authorization: `Basic ${msg.authBase64}`
      }
      if (msg.contentType) headers["Content-Type"] = msg.contentType
      fetch(msg.url, {
        method: msg.method ?? "GET",
        headers,
        body: msg.body ?? null,
        signal: controller.signal
      })
        .then(async (res) => {
          clearTimeout(timer)
          const body = await res.text()
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
    const item = createItem({
      type: payload.type,
      content: payload.content,
      title: payload.title,
      source: payload.source,
      projectId: targetProject.id
    })
    const saved = await addItem(item)
    if (saved) touchProject(targetProject.id).catch(() => {})
    notifyTab(senderTab?.id, saved, item.type)
    sendResponse({ ok: true, saved })
    return
  }

  // No recent projects: open the new-project popup (reuses right-click flow)
  await chrome.storage.session.set({
    pendingCapture: {
      type: payload.type,
      content: payload.content,
      source: payload.source
    },
    pendingTabId: senderTab?.id
  })
  chrome.windows.create({
    url: chrome.runtime.getURL("tabs/new-project.html"),
    type: "popup",
    width: 480,
    height: 460
  })
  sendResponse({ ok: true })
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
