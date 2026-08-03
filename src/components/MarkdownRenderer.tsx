import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import { Box, Divider, Link, Typography } from "@mui/material"
import katex from "katex"
import "katex/dist/katex.min.css"
import Markdown from "marked-react"
import type { ReactRenderer } from "marked-react"
import type { ReactNode } from "react"

// marked 16 emits a `checkbox` token for GFM task lists; marked-react 4's
// parser has no case for it and logs `Token with "checkbox" type was not found`
// (then renders nothing). The checkbox itself is rendered correctly via the
// renderer below, so this known-harmless warning is filtered at module load.
const ORIGINAL_WARN = console.warn.bind(console)
const IGNORED_MARKED_WARN = /Token with "checkbox" type was not found/
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && IGNORED_MARKED_WARN.test(args[0])) return
  ORIGINAL_WARN(...args)
}

type CustomRenderer = Partial<ReactRenderer>

/** True if the node subtree contains a task-list checkbox (data-task-checkbox). */
function containsTaskCheckbox(node: ReactNode): boolean {
  if (node == null || typeof node === "string" || typeof node === "number") {
    return false
  }
  if (Array.isArray(node)) {
    return node.some(containsTaskCheckbox)
  }
  if (typeof node === "object" && "props" in node) {
    const el = node as { props?: Record<string, unknown> }
    if (el.props?.["data-task-checkbox"]) return true
    return containsTaskCheckbox(el.props?.children as ReactNode)
  }
  return false
}

interface MarkdownRendererProps {
  content: string
  maxLines?: number
  /** Hide inline images (e.g. review-front prompt shows a gallery separately). */
  hideImages?: boolean
  /** Enable interactive task checkboxes; called with the task index in content. */
  onToggleTask?: (index: number) => void
}

/** Split on `$$…$$` (display) and `$…$` (inline) math. */
const MATH_RE = /(\$\$[^$]+\$\$|\$[^$\n]+\$)/g

function encodeTex(tex: string): string {
  return btoa(unescape(encodeURIComponent(tex)))
}
function decodeTex(b64: string): string {
  return decodeURIComponent(escape(atob(b64)))
}

/** Replace math with a self-closing `<lime-math/>` placeholder that marked
 *  parses as an inline html token — this keeps inline math INSIDE its
 *  paragraph (segment-splitting previously broke paragraphs into lines).
 *  Fenced code blocks are left untouched. */
function encodeMath(content: string): string {
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(MATH_RE, (m) => {
            const display = m.startsWith("$$")
            const tex = display ? m.slice(2, -2) : m.slice(1, -1)
            return `<lime-math data-t="${encodeTex(tex)}"${
              display ? ' data-d="1"' : ""
            }/>`
          })
    )
    .join("")
}

/** KaTeX-rendered math. The HTML comes from KaTeX's own escaped output (it
 *  is not user-authored raw HTML), so dangerouslySetInnerHTML is safe here. */
function MathSegment({
  tex,
  display
}: {
  tex: string
  display: boolean
}) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false
  })
  return (
    <Box
      component={display ? "div" : "span"}
      dangerouslySetInnerHTML={{ __html: html }}
      sx={
        display
          ? { my: 1.5, overflowX: "auto", textAlign: "center" }
          : {
              display: "inline-block",
              verticalAlign: "middle",
              maxWidth: "100%"
            }
      }
    />
  )
}

function createRenderer(
  preview: boolean,
  onToggleTask?: (index: number) => void
): CustomRenderer {
  let taskIndex = 0
  return {
    checkbox(checked: ReactNode) {
      const idx = taskIndex++
      const done = Boolean(checked)
      return (
        <Box
          key={`task-${idx}`}
          component="span"
          data-task-checkbox
          onClick={(e) => {
            e.stopPropagation()
            onToggleTask?.(idx)
          }}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 0.5,
            mr: 0.75,
            flexShrink: 0,
            verticalAlign: "middle",
            mt: -0.35,
            border: "1.5px solid",
            borderColor: done ? "primary.main" : "text.disabled",
            bgcolor: done ? "primary.main" : "transparent",
            cursor: onToggleTask ? "pointer" : "default",
            transition: "all 0.15s",
            "&:hover": onToggleTask
              ? { borderColor: "primary.main" }
              : undefined
          }}>
          {done && (
            <CheckRoundedIcon
              sx={{ fontSize: 12, color: "common.white", display: "block" }}
            />
          )}
        </Box>
      )
    },
    image(src: string, alt: string, title?: string | null) {
      // In preview (clamped) mode inline images are hidden — the card cover
      // is derived separately from the content's image URLs.
      if (preview) return null
      return (
        <Box
          key={this.elementId}
          component="img"
          src={src}
          alt={alt || title || ""}
          loading="lazy"
          sx={{
            maxWidth: "100%",
            height: "auto",
            borderRadius: 1,
            my: 1,
            display: "block"
          }}
        />
      )
    },
    heading(children: ReactNode, level: number) {
    const variant =
      level === 1
        ? ("h5" as const)
        : level === 2
          ? ("h6" as const)
          : ("subtitle1" as const)
    return (
      <Typography
        key={this.elementId}
        variant={variant}
        sx={{ my: 1.5, fontWeight: 600 }}>
        {children}
      </Typography>
    )
  },
  paragraph(children: ReactNode) {
    return (
      <Typography
        key={this.elementId}
        component="p"
        sx={{
          mb: 1,
          lineHeight: 1.9,
          "&:last-child": { mb: 0 }
        }}>
        {children}
      </Typography>
    )
  },
  link(href: string, children: ReactNode) {
    return (
      <Link
        key={this.elementId}
        href={href}
        target="_blank"
        rel="noreferrer"
        underline="hover"
        sx={{ color: "primary.main" }}>
        {children}
      </Link>
    )
  },
  codespan(code: ReactNode) {
    return (
      <Box
        key={this.elementId}
        component="code"
        sx={{
          bgcolor: "action.hover",
          px: 0.8,
          py: 0.2,
          borderRadius: 0.5,
          fontSize: "0.875em",
          fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace'
        }}>
        {code}
      </Box>
    )
  },
  code(code: ReactNode, lang?: string) {
    return (
      <Box
        key={this.elementId}
        component="pre"
        sx={{
          bgcolor: "action.hover",
          px: 2,
          py: 1.5,
          borderRadius: 1,
          fontSize: "0.875em",
          overflowX: "auto",
          my: 1,
          lineHeight: 1.6
        }}>
        <code
          className={lang ? `language-${lang}` : undefined}
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace'
          }}>
          {code}
        </code>
      </Box>
    )
  },
  blockquote(children: ReactNode) {
    return (
      <Box
        key={this.elementId}
        sx={{
          pl: 2,
          borderLeft: "3px solid",
          borderColor: "primary.main",
          my: 1,
          color: "text.secondary",
          fontStyle: "italic"
        }}>
        {children}
      </Box>
    )
  },
  list(children: ReactNode, ordered: boolean) {
    const isTaskList = containsTaskCheckbox(children)
    return (
      <Box
        key={this.elementId}
        component={ordered ? "ol" : "ul"}
        sx={{
          pl: isTaskList ? 0 : 2.5,
          my: 1,
          ...(isTaskList ? { listStyle: "none" } : {})
        }}>
        {children}
      </Box>
    )
  },
  listItem(children: ReactNode[]) {
    return (
      <Typography
        key={this.elementId}
        component="li"
        sx={{
          lineHeight: 1.9,
          "&::marker": { color: "text.secondary" }
        }}>
        {children}
      </Typography>
    )
  },
  strong(children: ReactNode) {
    return (
      <Box key={this.elementId} component="strong" sx={{ fontWeight: 700 }}>
        {children}
      </Box>
    )
  },
  em(children: ReactNode) {
    return (
      <Box key={this.elementId} component="em" sx={{ fontStyle: "italic" }}>
        {children}
      </Box>
    )
  },
  del(children: ReactNode) {
    return (
      <Box key={this.elementId} component="del" sx={{ color: "text.disabled" }}>
        {children}
      </Box>
    )
  },
  hr() {
    return <Divider key={this.elementId} sx={{ my: 2 }} />
  },
  html(html: ReactNode) {
    const raw = String(html ?? "")
    const m = /^<lime-math data-t="([^"]+)"(?: data-d="(\d)")?\/>$/.exec(raw)
    if (m) {
      const tex = decodeTex(m[1])
      if (!tex) return null
      return (
        <MathSegment
          key={this.elementId}
          tex={tex}
          display={m[2] === "1"}
        />
      )
    }
    return html
  }
  }
}

export default function MarkdownRenderer({
  content,
  maxLines,
  hideImages,
  onToggleTask
}: MarkdownRendererProps) {
  // Build the renderer per render: preview (clamped) or hideImages mode hides
  // inline images; otherwise they render constrained to the container width.
  const renderer = createRenderer(
    Boolean(maxLines) || Boolean(hideImages),
    onToggleTask
  )
  return (
    <Box
      sx={
        maxLines
          ? {
              fontFamily: (theme) => theme.custom.serif,
              maxHeight: `${maxLines * 1.8}rem`,
              overflow: "hidden",
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 24,
                background: (theme) =>
                  `linear-gradient(transparent, ${theme.palette.background.paper})`,
                pointerEvents: "none"
              }
            }
          : { fontFamily: (theme) => theme.custom.serif }
      }>
      <Markdown value={encodeMath(content)} renderer={renderer} gfm />
    </Box>
  )
}
