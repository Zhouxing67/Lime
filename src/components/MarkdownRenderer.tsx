import {
  Box,
  Divider,
  Link,
  Typography
} from "@mui/material"
import type { ReactNode } from "react"
import Markdown from "marked-react"
import type { ReactRenderer } from "marked-react"

type CustomRenderer = Partial<ReactRenderer>

interface MarkdownRendererProps {
  content: string
  maxLines?: number
}

const renderer: CustomRenderer = {
  heading(children: ReactNode, level: number) {
    const variant =
      level === 1 ? "h5" as const
        : level === 2 ? "h6" as const
          : "subtitle1" as const
    return (
      <Typography key={this.elementId} variant={variant} sx={{ my: 1.5, fontWeight: 600 }}>
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
    return (
      <Box key={this.elementId} component={ordered ? "ol" : "ul"} sx={{ pl: 2.5, my: 1 }}>
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
  }
}

export default function MarkdownRenderer({ content, maxLines }: MarkdownRendererProps) {
  return (
    <Box
      sx={
        maxLines
          ? {
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
          : undefined
      }>
      <Markdown value={content} renderer={renderer} gfm />
    </Box>
  )
}
