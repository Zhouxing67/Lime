import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded"
import FormatQuoteRoundedIcon from "@mui/icons-material/FormatQuoteRounded"
import ImageRoundedIcon from "@mui/icons-material/ImageRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import {
  Box,
  Chip,
  Stack,
  Typography
} from "@mui/material"

import MarkdownRenderer from "./MarkdownRenderer"
import type { Item } from "../types"
import { prettyUrl, truncateText } from "../utils"

interface CardRendererProps {
  item: Item
  mode: "front" | "back" | "full" | "preview"
  truncateTo?: number
  contentAlign?: "top" | "center"
}

const TYPE_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  link: "链接"
}

const typeIcon = (type: string) => {
  switch (type) {
    case "text": return <FormatQuoteRoundedIcon fontSize="small" />
    case "image": return <ImageRoundedIcon fontSize="small" />
    case "link": return <LinkRoundedIcon fontSize="small" />
    default: return <ArticleRoundedIcon fontSize="small" />
  }
}

function ContentBlock({ item }: { item: Item }) {
  if (item.type === "image") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
        <img
          src={item.content}
          alt={item.source?.title || ""}
          style={{ maxWidth: "100%", maxHeight: 340, borderRadius: "8px", objectFit: "contain" }}
        />
      </Box>
    )
  }
  if (item.type === "link" && item.source?.url) {
    return (
      <Typography
        component="a"
        href={item.source.url}
        target="_blank"
        onClick={(e) => e.stopPropagation()}
        sx={{
          fontSize: "1.1rem", lineHeight: 1.8, wordBreak: "break-word",
          color: "primary.main", textDecoration: "none",
          "&:hover": { textDecoration: "underline" }
        }}>
        {item.source.title || prettyUrl(item.source.url)}
      </Typography>
    )
  }
  return (
    <Box sx={{ pl: 2, borderLeft: "4px solid", borderLeftColor: "primary.main" }}>
      <Typography
        sx={{
          fontSize: "1.1rem", lineHeight: 1.9, whiteSpace: "pre-wrap",
          wordBreak: "break-word", textAlign: "justify", textJustify: "inter-word",
          WebkitHyphens: "auto", hyphens: "auto",
          fontFamily: '"Times New Roman", "LXGW WenKai", "Noto Serif SC", "Songti SC", serif',
          color: "text.primary"
        }}>
        {item.content}
      </Typography>
    </Box>
  )
}

/** Dynamic preview line count based on content source lines */
function previewMaxLines(content: string): number {
  const lines = content.split("\n").length
  if (lines <= 5) return 2
  if (lines <= 10) return 3
  if (lines <= 20) return 4
  return 5
}

export default function CardRenderer({ item, mode, truncateTo, contentAlign }: CardRendererProps) {
  if (mode === "preview") {
    return (
      <Box sx={{ mb: 2 }}>
        {item.title ? (
          <Box>
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 700,
                wordBreak: "break-word",
                color: "text.primary",
                mb: 0.5
              }}>
              {truncateTo ? truncateText(item.title, truncateTo) : item.title}
            </Typography>
            <Box sx={{ maxHeight: `${previewMaxLines(item.content) * 1.8}rem`, overflow: "hidden", position: "relative" }}>
              {item.type === "text" ? (
                <MarkdownRenderer content={item.content} maxLines={previewMaxLines(item.content)} />
              ) : item.type === "link" ? (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem", fontStyle: "italic" }}>
                  {prettyUrl(item.content)}
                </Typography>
              ) : (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem", fontStyle: "italic" }}>
                  点击查看图片
                </Typography>
              )}
              <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 20, background: "linear-gradient(transparent, background.paper)" }} />
            </Box>
          </Box>
        ) : (
          <>
            {item.type === "text" && (
              <Box sx={{ position: "relative" }}>
                <Box
                  sx={{
                    position: "absolute",
                    top: -6,
                    left: -6,
                    fontSize: "2rem",
                    color: "text.disabled",
                    opacity: 0.3,
                    fontFamily: "Georgia, serif"
                  }}>
                  "
                </Box>
                <Box sx={{ pl: 2, pr: 1 }}>
                  <MarkdownRenderer content={item.content} maxLines={previewMaxLines(item.content)} />
                </Box>
              </Box>
            )}
            {item.type === "image" && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                <img
                  src={item.content}
                  alt={item.source?.title || (item.source ? prettyUrl(item.source.url) : "")}
                  draggable={false}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 200,
                    borderRadius: "8px"
                  }}
                />
              </Box>
            )}
            {item.type === "link" && (
              <Stack spacing={0.5}>
                <Typography variant="body2" sx={{ fontSize: "0.9rem" }}>
                  <Box
                    component="a"
                    href={item.content}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      color: "primary.main",
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" }
                    }}>
                    {prettyUrl(item.content)}
                  </Box>
                </Typography>
              </Stack>
            )}
          </>
        )}
      </Box>
    )
  }

  if (mode === "front") {
    return (
      <>
        <Chip
          label={TYPE_LABEL[item.type] ?? "文本"} size="small" variant="outlined"
          sx={{
            position: "absolute", top: 12, right: 12,
            height: 20, fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.04em"
          }}
        />
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0, display: "flex", flexDirection: "column",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 1 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" }
        }}>
          <Box sx={(contentAlign ?? "center") === "center" ? { marginTop: "auto", marginBottom: "auto" } : undefined}>
            {item.title ? (
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  fontWeight: 700,
                  wordBreak: "break-word",
                  textAlign: "center",
                  color: "text.primary",
                  px: 2
                }}>
                {item.title}
              </Typography>
            ) : (
              <ContentBlock item={item} />
            )}
          </Box>
        </Box>
        {item.source?.url && (
          <>
            <Box sx={{ mx: -5, borderTop: "1px solid", borderColor: "divider", mb: 1 }} />
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem", textAlign: "center", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
              ↗ {item.source.title || prettyUrl(item.source.url)}
            </Typography>
          </>
        )}
        <Typography variant="caption" sx={{ mt: 0.5, color: "text.disabled", textAlign: "center", fontSize: "0.7rem", letterSpacing: "0.04em", flexShrink: 0 }}>
          ⌄ 点击翻转
        </Typography>
      </>
    )
  }

  if (mode === "back") {
    return (
      <>
        <Typography variant="subtitle2" sx={{ color: "text.disabled", mb: 1, fontSize: "0.75rem", letterSpacing: "0.04em" }}>
          原文
        </Typography>
        <Box sx={{ mb: 2.5 }}>
          {item.type === "text" ? (
            <Box sx={{ pl: 2, borderLeft: "4px solid", borderLeftColor: "primary.main" }}>
              <MarkdownRenderer content={item.content} />
            </Box>
          ) : (
            <ContentBlock item={item} />
          )}
        </Box>
        {item.source?.url && (
          <Typography
            variant="body2" component="a" href={item.source.url} target="_blank"
            onClick={(e) => e.stopPropagation()}
            sx={{
              color: "primary.main", textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
              fontSize: "0.8rem", wordBreak: "break-word",
              mt: "auto", pt: 2, borderTop: "1px solid", borderColor: "divider"
            }}>
            ↗ {item.source.title || prettyUrl(item.source.url)}
          </Typography>
        )}
      </>
    )
  }

  // mode === "full"
  return (
    <>
      {item.title && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
              mb: 0.5,
              display: "block"
            }}>
            摘要
          </Typography>
          <Typography
            variant="h5"
            component="h2"
            sx={{
              fontWeight: 700,
              wordBreak: "break-word",
              color: "text.primary",
              mb: 3,
              pb: 2,
              borderBottom: "1px solid",
              borderColor: "divider"
            }}>
            {item.title}
          </Typography>
        </Box>
      )}
      <Box>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontSize: "0.75rem",
            letterSpacing: "0.05em",
            mb: 0.5,
            display: "block"
          }}>
          原文
        </Typography>
        {item.type === "text" ? (
          <Box sx={{ pl: 2, borderLeft: "4px solid", borderLeftColor: "primary.main" }}>
            <MarkdownRenderer content={item.content} />
          </Box>
        ) : (
          <ContentBlock item={item} />
        )}
      </Box>
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
          <Box sx={{ color: "text.secondary", opacity: 0.7 }}>{typeIcon(item.type)}</Box>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem", letterSpacing: "0.03em" }}>
            {item.type.toUpperCase()} ·{" "}
            {new Date(item.createdAt).toLocaleDateString("zh-CN", {
              year: "numeric", month: "long", day: "numeric"
            })}
          </Typography>
        </Box>
      </Box>
      {item.context?.paragraph && (
        <Box sx={{ mt: 4, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem", letterSpacing: "0.05em", mb: 1.5, display: "block" }}>
            所在段落
          </Typography>
          <Box sx={{ pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.9, textAlign: "justify", color: "text.secondary", fontSize: "0.9rem" }}>
              {item.context.paragraph}
            </Typography>
          </Box>
        </Box>
      )}

      {item.source?.url && (
        <>
          <Box sx={{ mx: -5, borderTop: "1px solid", borderColor: "divider", mb: 1 }} />
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem", textAlign: "center", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ↗ {item.source.title || prettyUrl(item.source.url)}
          </Typography>
        </>
      )}
    </>
  )
}
