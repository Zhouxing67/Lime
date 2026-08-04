import { downloadPdfFiles, listRemotePdfs, uploadPdfFiles } from "./sync"

// jest's jsdom doesn't expose DOMParser globally — take it from jsdom.
const { JSDOM } = require("jsdom")
;(global as any).DOMParser = new JSDOM().window.DOMParser

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
