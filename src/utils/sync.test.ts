import {
  countPayloadRecords,
  downloadImageFiles,
  downloadPdfFiles,
  downloadRemote,
  hydratePayloadImages,
  listRemotePdfs,
  pruneRemoteImages,
  sanitizeSyncPayload,
  uploadPdfFiles,
  wouldWipeRemote
} from "./sync"

const PROPFIND_XML = (names: string[]) => `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Apps/lime/pdfs/</D:href>
  </D:response>
  ${names.map((n) => `<D:response><D:href>/Apps/lime/pdfs/${n}.pdf</D:href></D:response>`).join("")}
</D:multistatus>`

const cred = { username: "u", appPassword: "p" }

function mockWebDav(
  routes: Record<string, { body?: string; status?: number }>
) {
  ;(chrome.runtime as any).sendMessage = jest.fn(
    (msg: { method?: string; url: string; body?: string }, cb: any) => {
      const key = `${msg.method ?? "GET"} ${msg.url}`
      const route = routes[key]
      cb(
        route
          ? {
              ok: (route.status ?? 200) < 400,
              status: route.status ?? 200,
              body: route.body ?? ""
            }
          : { ok: false, status: 404, body: "" }
      )
    }
  )
}

const b64 = (s: string) => btoa(s)

describe("PDF file sync (multi-file layer)", () => {
  it("listRemotePdfs parses the WebDAV PROPFIND hrefs", async () => {
    mockWebDav({
      "PROPFIND https://dav.jianguoyun.com/dav/Apps/lime/pdfs/": {
        body: PROPFIND_XML(["abc123", "def456"])
      }
    })
    const names = await listRemotePdfs(cred)
    expect(names).toContain("abc123.pdf")
    expect(names).toContain("def456.pdf")
    expect(names).not.toContain("")
    expect(names).toHaveLength(2)
  })

  it("listRemotePdfs returns [] when the folder doesn't exist (404)", async () => {
    mockWebDav({})
    const names = await listRemotePdfs(cred)
    expect(names).toEqual([])
  })

  it("uploadPdfFiles only PUTs files the remote lacks", async () => {
    const puts: string[] = []
    mockWebDav({
      "PROPFIND https://dav.jianguoyun.com/dav/Apps/lime/pdfs/": {
        body: PROPFIND_XML(["abc123"])
      },
      "MKCOL https://dav.jianguoyun.com/dav/Apps/lime/pdfs/": {
        status: 405
      },
      "PUT https://dav.jianguoyun.com/dav/Apps/lime/pdfs/xyz789.pdf": {
        body: "ok"
      }
    })
    ;(chrome.runtime.sendMessage as jest.Mock).mockImplementation(
      (msg: any, cb: any) => {
        if (msg.method === "PUT") {
          puts.push(msg.body)
          cb({ ok: true, status: 201, body: "" })
          return
        }
        const key = `${msg.method ?? "GET"} ${msg.url}`
        const route =
          key === "PROPFIND https://dav.jianguoyun.com/dav/Apps/lime/pdfs/"
            ? { ok: true, status: 207, body: PROPFIND_XML(["abc123"]) }
            : { ok: true, status: 200, body: "ok" }
        cb({ ok: route.ok, status: route.status, body: route.body })
      }
    )
    const localPdfs = [
      { id: "abc123", bytes: new Blob(["a"]), name: "a.pdf" },
      { id: "xyz789", bytes: new Blob(["b"]), name: "b.pdf" }
    ] as any
    await uploadPdfFiles(cred, localPdfs)
    // abc123 is already on the remote → skipped; only xyz789 is uploaded.
    expect(puts).toHaveLength(1)
    expect(puts[0]).toBe(b64("b"))
  })

  it("downloadPdfFiles fetches missing files and skips local ones", async () => {
    ;(chrome.runtime.sendMessage as jest.Mock).mockImplementation(
      (msg: any, cb: any) => {
        if (msg.method === "GET" && msg.url.includes("/pdfs/xyz789.pdf")) {
          cb({ ok: true, status: 200, body: b64("pdf-bytes") })
          return
        }
        cb({ ok: true, status: 207, body: PROPFIND_XML(["abc123", "xyz789"]) })
      }
    )
    const remote = [
      { id: "abc123", name: "a.pdf", pageCount: 1, addedAt: 1 },
      { id: "xyz789", name: "b.pdf", pageCount: 1, addedAt: 2 }
    ] as any
    const local = [{ id: "abc123", bytes: new Blob(["have"]) }] as any
    const fetched = await downloadPdfFiles(cred, remote, local)
    // abc123 already local → skipped; xyz789 downloaded.
    expect(fetched).toHaveLength(1)
    expect(fetched[0].meta.id).toBe("xyz789")
    const { blobToUint8 } = require("./index")
    const bytes = await blobToUint8(fetched[0].bytes)
    expect(String.fromCharCode(...bytes)).toBe("pdf-bytes")
  })
})

// ---- Image file layer (A1 / A9) ----

const IMAGES_XML = (names: string[]) => `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Apps/lime/images/</D:href>
  </D:response>
  ${names.map((n) => `<D:response><D:href>/Apps/lime/images/${n}.png</D:href></D:response>`).join("")}
</D:multistatus>`

const IMG = "/dav/Apps/lime/images/"

describe("Image file sync (multi-file layer)", () => {
  it("downloadImageFiles returns the data-URLs for the referenced files", async () => {
    mockWebDav({
      [`PROPFIND https://dav.jianguoyun.com${IMG}`]: {
        body: IMAGES_XML(["aaa111"])
      },
      [`GET https://dav.jianguoyun.com${IMG}aaa111.png`]: {
        body: b64("img-bytes")
      }
    })
    const payload = {
      images: { card1: "aaa111" },
      projectCards: []
    } as any
    const { files, unresolved } = await downloadImageFiles(cred, payload)
    expect(files.get("aaa111")).toBe("data:image/png;base64," + b64("img-bytes"))
    expect(unresolved.size).toBe(0)
  })

  it("downloadImageFiles THROWS on a non-404 failure (abort, no partial apply)", async () => {
    mockWebDav({
      [`PROPFIND https://dav.jianguoyun.com${IMG}`]: {
        body: IMAGES_XML(["aaa111"])
      },
      [`GET https://dav.jianguoyun.com${IMG}aaa111.png`]: {
        status: 500
      }
    })
    const payload = { images: { card1: "aaa111" }, projectCards: [] } as any
    await expect(downloadImageFiles(cred, payload)).rejects.toThrow(/下载失败/)
  })

  it("downloadImageFiles records a 404 (dangling ref) as unresolved, not a throw", async () => {
    mockWebDav({
      [`PROPFIND https://dav.jianguoyun.com${IMG}`]: {
        body: IMAGES_XML([])
      }
    })
    const payload = { images: { card1: "aaa111" }, projectCards: [] } as any
    const { files, unresolved } = await downloadImageFiles(cred, payload)
    expect(files.size).toBe(0)
    expect(unresolved.has("aaa111")).toBe(true)
  })

  it("hydratePayloadImages restores images for resolved refs, leaves others blank", async () => {
    const payload = {
      images: { a: "h1", b: "h2" },
      projectCards: [
        { id: "a", image: undefined },
        { id: "b", image: undefined }
      ],
      pdfCards: [],
      pdfAnnotations: []
    } as any
    const hydrated = hydratePayloadImages(payload, new Map([["h1", "data:image/png;base64,x"]]))
    expect(hydrated.projectCards[0].image).toBe("data:image/png;base64,x")
    expect(hydrated.projectCards[1].image).toBeUndefined()
  })

  it("pruneRemoteImages keeps files the REMOTE payload still references (union)", async () => {
    const deletes: string[] = []
    mockWebDav({
      [`PROPFIND https://dav.jianguoyun.com${IMG}`]: {
        body: IMAGES_XML(["aaa111", "bbb222", "ccc333"])
      }
    })
    ;(chrome.runtime.sendMessage as jest.Mock).mockImplementation(
      (msg: any, cb: any) => {
        if (msg.method === "DELETE") {
          deletes.push(msg.url)
          cb({ ok: true, status: 204, body: "" })
          return
        }
        cb({ ok: true, status: 207, body: IMAGES_XML(["aaa111", "bbb222", "ccc333"]) })
      }
    )
    // local references aaa111; the REMOTE payload still references bbb222.
    await pruneRemoteImages(
      cred,
      new Map([["aaa111", "data:image/png;base64,x"]]),
      new Set(["bbb222"])
    )
    // Only the genuinely-orphaned ccc333 is deleted.
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain("ccc333.png")
  })

  it("sanitizeSyncPayload keeps valid records unchanged and skips corrupt ones", () => {
    const payload = {
      version: 6,
      syncedAt: 123,
      contentHash: "abc",
      deviceInfo: { version: "0.1.0" },
      projects: [{ id: "p1", name: "ok", createdAt: 1 }],
      projectCards: [
        { id: "c1", type: "text", content: "ok", projectId: "p1", createdAt: 1 },
        { id: "c2", type: "bogus", content: "bad", projectId: "p1", createdAt: 1 }
      ],
      pdfCards: [],
      todos: [{ id: "t1", content: "ok", createdAt: 1 }],
      reviews: [],
      pdfAnnotations: [
        { id: "a1", pdfId: "f1", page: 1, kind: "text", type: "highlight", createdAt: 1 },
        { id: "a2", pdfId: "f1", page: "NaN", kind: "text", type: "highlight", createdAt: 1 }
      ],
      pdfs: [{ id: "f1", name: "ok.pdf", pageCount: 3, addedAt: 1 }],
      images: { c1: "aaa111" }
    } as any

    const { payload: clean, skipped } = sanitizeSyncPayload(payload)

    expect(skipped).toBe(2)
    // Valid records pass through UNCHANGED (unknown fields survive).
    expect(clean.projectCards).toHaveLength(1)
    expect(clean.projectCards[0]).toEqual(payload.projectCards[0])
    expect(clean.pdfAnnotations).toHaveLength(1)
    expect(clean.pdfAnnotations[0].id).toBe("a1")
    // projects / todos / pdfs intact.
    expect(clean.projects).toHaveLength(1)
    expect(clean.todos).toHaveLength(1)
    expect(clean.pdfs).toHaveLength(1)
  })

  it("sanitizeSyncPayload drops a malformed images map", () => {
    const payload = {
      version: 6,
      syncedAt: 123,
      contentHash: "abc",
      deviceInfo: { version: "0.1.0" },
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: [],
      images: { c1: 42 }
    } as any
    const { payload: clean } = sanitizeSyncPayload(payload)
    expect(clean.images).toBeUndefined()
  })

  it("wouldWipeRemote blocks a never-synced empty local vs a populated remote", () => {
    const empty: any = {
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: []
    }
    const full: any = {
      ...empty,
      todos: [{ id: "t1", content: "x", createdAt: 1 }]
    }
    expect(wouldWipeRemote(null, empty, full)).toBe(true)
    expect(countPayloadRecords(full)).toBe(1)
  })

  it("wouldWipeRemote allows an empty upload once the user HAS synced", () => {
    const empty: any = {
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: []
    }
    const full: any = { ...empty, todos: [{ id: "t1", content: "x", createdAt: 1 }] }
    expect(wouldWipeRemote(123, empty, full)).toBe(false)
  })

  it("wouldWipeRemote does not block first sync (no remote) or richer local", () => {
    const one: any = {
      projects: [],
      projectCards: [{ id: "c1", type: "text", content: "x", projectId: "p", createdAt: 1 }],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: []
    }
    const empty: any = {
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: []
    }
    expect(wouldWipeRemote(null, one, null)).toBe(false)
    expect(wouldWipeRemote(null, one, empty)).toBe(false)
  })
})

// ---- SyncPayload v7: readLater ----

describe("SyncPayload v7 (readLater)", () => {
  it("sanitizeSyncPayload keeps valid readLater and skips invalid ones", () => {
    const payload = {
      version: 7,
      syncedAt: 123,
      contentHash: "abc",
      deviceInfo: { version: "0.1.0" },
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: [],
      readLater: [
        { id: "rl1", title: "ok", status: "unread", addedAt: 1 },
        { id: "rl2", title: "bad", status: "bogus", addedAt: 1 }
      ]
    } as any

    const { payload: clean, skipped } = sanitizeSyncPayload(payload)
    expect(skipped).toBe(1)
    expect(clean.readLater).toHaveLength(1)
    expect(clean.readLater[0].id).toBe("rl1")
  })

  it("countPayloadRecords counts readLater records", () => {
    const payload: any = {
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [{ id: "t1", content: "x", createdAt: 1 }],
      reviews: [],
      pdfAnnotations: [],
      pdfs: [],
      readLater: [{ id: "rl1", title: "a", status: "unread", addedAt: 1 }]
    }
    expect(countPayloadRecords(payload)).toBe(2)
  })

  it("downloadRemote accepts a v7 payload (version gate <=7)", async () => {
    const remotePayload = {
      version: 7,
      syncedAt: 1,
      contentHash: "remote-hash",
      deviceInfo: { version: "0.1.0" },
      projects: [],
      projectCards: [],
      pdfCards: [],
      todos: [],
      reviews: [],
      pdfAnnotations: [],
      pdfs: [],
      readLater: [{ id: "rl1", title: "a", status: "unread", addedAt: 1 }]
    }
    mockWebDav({
      "GET https://dav.jianguoyun.com/dav/Apps/lime/lime-sync.json": {
        body: JSON.stringify(remotePayload)
      }
    })
    const result = await downloadRemote(
      cred,
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      []
    )
    expect(result.success).toBe(true)
    expect(result.direction).toBe("download")
    expect(result.payload?.readLater).toHaveLength(1)
  })
})
