import type { SourceMeta } from "./index"

export interface CaptureMessage {
  kind: "capture"
  payload: {
    type: "text" | "image" | "link"
    content: string
    title?: string
    source: SourceMeta
    projectId?: string
  }
}

export interface ToastMessage {
  kind: "toast"
  text: string
}

export interface WebDavMessage {
  kind: "webdav"
  url: string
  method: string
  authBase64: string
  body?: string
  contentType?: string
  /** Binary mode: `body` is base64 (upload) and the response body is base64
   *  (download) instead of text. */
  binary?: boolean
}

export interface SetRecentProjectMessage {
  kind: "set-recent-project"
  projectId: string
}

export interface ListProjectsMessage {
  kind: "list-projects"
}

export interface AddProjectMessage {
  kind: "add-project"
  name: string
}

export interface CaptureVisibleTabMessage {
  kind: "capture-visible-tab"
}

/** Best-effort fetch of a web PDF's bytes through the background SW's
 *  privileged fetch (host permission <all_urls> — no CORS). */
export interface FetchPdfMessage {
  kind: "fetch-pdf"
  url: string
}

/** The PDF-saver content script hands the fetched bytes to the background to
 *  addPdf + notify (the background owns the DB write). */
export interface SaveWebPdfMessage {
  kind: "save-web-pdf"
  url: string
  name: string
  body: string
}

export type ExtensionMessage =
  | CaptureMessage
  | ToastMessage
  | WebDavMessage
  | SetRecentProjectMessage
  | ListProjectsMessage
  | AddProjectMessage
  | CaptureVisibleTabMessage
  | FetchPdfMessage
  | SaveWebPdfMessage

export function sendMessage<T = any>(
  msg: ExtensionMessage,
  timeoutMs = 0
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined
    if (timeoutMs > 0) {
      // A Service Worker that dies mid-handle never invokes the callback, so
      // without a timeout the caller hangs forever (A4).
      timer = globalThis.setTimeout(() => {
        reject(new Error(`sendMessage timeout: ${msg.kind}`))
      }, timeoutMs)
    }
    chrome.runtime.sendMessage(msg, (response) => {
      if (timer !== undefined) globalThis.clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(response as T)
      }
    })
  })
}
