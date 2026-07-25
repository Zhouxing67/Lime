export interface CaptureMessage {
  kind: "capture"
  payload: {
    type: "text" | "image" | "link"
    content: string
    title?: string
    source: { title: string; url: string; site: string }
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
}

export interface SaveFeedbackMessage {
  kind: "save-feedback"
  tabId: number
  saved: boolean
  type: string
  projectName?: string
}

export interface SetRecentProjectMessage {
  kind: "set-recent-project"
  projectId: string
}

export interface ListProjectsMessage {
  kind: "list-projects"
}

export type ExtensionMessage =
  | CaptureMessage
  | ToastMessage
  | WebDavMessage
  | SaveFeedbackMessage
  | SetRecentProjectMessage
  | ListProjectsMessage

export function sendMessage<T = any>(msg: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(response as T)
      }
    })
  })
}
