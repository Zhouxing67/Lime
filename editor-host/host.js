const fs = require("fs")
const path = require("path")
const os = require("os")
const { spawn } = require("child_process")

const TEMP_DIR = path.join(os.tmpdir(), "lime-edit")
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

let buffer = Buffer.alloc(0)

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  while (buffer.length >= 4) {
    const msgLen = buffer.readUInt32LE(0)
    if (buffer.length < 4 + msgLen) break

    const msgBytes = buffer.slice(4, 4 + msgLen)
    buffer = buffer.slice(4 + msgLen)

    try {
      handle(JSON.parse(msgBytes.toString("utf8")))
    } catch {
      // ignore malformed messages
    }
  }
})

const pollers = {}

function handle(msg) {
  switch (msg.action) {
    case "open": {
      const { content, title, images, itemId, editorCommand } = msg

      let md = ""
      if (title) md += `# ${title}\n\n`
      md += content
      if (images && images.length > 0) {
        md += "\n\n"
        images.forEach((url) => (md += `![](${url})\n`))
      }

      const filePath = path.join(TEMP_DIR, `${itemId}.md`)
      fs.writeFileSync(filePath, md, "utf8")

      const [cmd, ...args] = editorCommand.split(" ")
      const proc = spawn(cmd, [...args, filePath], {
        detached: true,
        stdio: "ignore"
      })
      proc.unref()

      let mtime = fs.statSync(filePath).mtimeMs
      const poll = setInterval(() => {
        try {
          const st = fs.statSync(filePath)
          if (st.mtimeMs > mtime) {
            mtime = st.mtimeMs
            post({
              action: "saved",
              itemId,
              content: fs.readFileSync(filePath, "utf8")
            })
          }
        } catch {
          clearInterval(poll)
          delete pollers[itemId]
        }
      }, 2000)
      pollers[itemId] = poll
      break
    }
    case "ping":
      post({ action: "pong" })
      break
  }
}

function post(obj) {
  const bytes = Buffer.from(JSON.stringify(obj), "utf8")
  const header = Buffer.alloc(4)
  header.writeUInt32LE(bytes.length, 0)
  process.stdout.write(Buffer.concat([header, bytes]))
}
