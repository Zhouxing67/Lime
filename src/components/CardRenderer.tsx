import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded"
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded"
import FormatQuoteRoundedIcon from "@mui/icons-material/FormatQuoteRounded"
import ImageRoundedIcon from "@mui/icons-material/ImageRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import { Box, Chip, Typography } from "@mui/material"

import type { DisplayCard } from "../types"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"
import { extractMarkdownImages, prettyUrl, truncateText } from "../utils"
import MarkdownRenderer from "./MarkdownRenderer"

interface CardRendererProps {
  item: DisplayCard
  mode: "front" | "back" | "full" | "preview"
  truncateTo?: number
  contentAlign?: "top" | "center"
  /** PDF-sourced project card: the source footer click jumps to the PDF. */
  onOpenPdfSource?: (item: DisplayCard) => void
}

const TYPE_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  link: "链接",
  todo: "待办"
}

export const typeIcon = (type: string) => {
  switch (type) {
    case "text":
      return <FormatQuoteRoundedIcon fontSize="small" />
    case "image":
      return <ImageRoundedIcon fontSize="small" />
    case "link":
      return <LinkRoundedIcon fontSize="small" />
    case "todo":
      return <ChecklistRoundedIcon fontSize="small" />
    default:
      return <ArticleRoundedIcon fontSize="small" />
  }
}

/** All displayable images for a card: content-embedded Markdown images plus
 *  legacy `item.images` (image-type cards exclude their own content URL). */
function allImages(item: DisplayCard): string[] {
  return [...extractMarkdownImages(item.content), ...(item.images ?? [])].filter(
    (u, i, arr) =>
      arr.indexOf(u) === i && (item.type !== "image" || u !== item.content)
  )
}

/** Legacy-only images (pre-Markdown cards). Used where the Markdown body
 *  already renders content-embedded images inline, to avoid duplication. */
function legacyImages(item: DisplayCard): string[] {
  return (item.images ?? []).filter(
    (u) => item.type !== "image" || u !== item.content
  )
}

/** Shared "原文" section (label + quote block + images) used by both the full
 *  and review-back views so the back card reads like the full card. */
function OriginalBlock({ item }: { item: DisplayCard }) {
  // A placed PDF card no longer carries content — the PDF page shows the
  // annotation; render a compact marker instead of an empty/legacy block.
  if (item.pdfSource && !item.content && !legacyImages(item).length) {
    const mark = item.pdfSource.type
    return (
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
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            px: 1,
            py: 0.4,
            borderRadius: 1,
            bgcolor: "action.hover",
            color: "text.secondary",
            fontSize: "0.75rem"
          }}>
          {mark && (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: 1,
                background: MARK_DOT[mark],
                flexShrink: 0
              }}
            />
          )}
          <span>PDF 批注{mark ? ` · ${MARK_LABEL[mark]}` : ""} · 第 {item.pdfSource.page} 页</span>
        </Box>
      </Box>
    )
  }
  return (
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
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(item.type === "text" && item.content) || item.type !== "text" ? (
          item.type === "text" ? (
            <Box
              sx={{
                pl: 2,
                borderLeft: "4px solid",
                borderLeftColor: "primary.main"
              }}>
              <MarkdownRenderer content={item.content} />
            </Box>
          ) : (
            <ContentBlock item={item} />
          )
        ) : null}
        {legacyImages(item).length > 0 && (
          <ImageGallery images={legacyImages(item)} />
        )}
      </Box>
    </Box>
  )
}

function ImageGallery({ images }: { images: string[] }) {
  if (!images || images.length === 0) return null

  const count = images.length

  // Full variant: vertical flow, each image full-width preserving
  // its natural aspect ratio. No internal scrollbar — the dialog
  // scrolls as a whole so text and images read as one continuous flow.
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        width: "100%"
      }}>
      {images.map((url, i) => (
        <Box
          key={url + i}
          onClick={(e) => e.stopPropagation()}
          sx={{
            borderRadius: 1,
            overflow: "hidden",
            width: "100%",
            flexShrink: 0,
            bgcolor: "background.paper"
          }}>
          <img
            src={url}
            alt=""
            loading="lazy"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              objectFit: "contain"
            }}
          />
        </Box>
      ))}
    </Box>
  )
}

/** Placed-card source label: the PDF name when known (truncated by the
 *  caller's ellipsis), else a generic PDF marker. */
function pdfSourceLabel(item: DisplayCard): string {
  const s = item.pdfSource
  if (!s) return ""
  return s.pdfName ? `${s.pdfName} · 第 ${s.page} 页` : `PDF · 第 ${s.page} 页`
}

function ContentBlock({ item }: { item: DisplayCard }) {
  if (item.type === "image") {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 200
        }}>
        <img
          src={item.content}
          alt={item.source?.title || ""}
          style={{
            maxWidth: "100%",
            maxHeight: 340,
            borderRadius: "8px",
            objectFit: "contain"
          }}
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
          fontSize: "1.1rem",
          lineHeight: 1.8,
          wordBreak: "break-word",
          color: "primary.main",
          textDecoration: "none",
          "&:hover": { textDecoration: "underline" }
        }}>
        {item.source.title || prettyUrl(item.source.url)}
      </Typography>
    )
  }
  return (
    <Box
      sx={{ pl: 2, borderLeft: "4px solid", borderLeftColor: "primary.main" }}>
      <Typography
        sx={{
          fontSize: "1.1rem",
          lineHeight: 1.9,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textAlign: "justify",
          textJustify: "inter-word",
          WebkitHyphens: "auto",
          hyphens: "auto",
          fontFamily: (theme) => theme.custom.serif,
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

export default function CardRenderer({
  item,
  mode,
  truncateTo,
  contentAlign,
  onOpenPdfSource
}: CardRendererProps) {
  if (mode === "preview") {
    // Cover thumbnails: images embedded in content as Markdown, plus legacy
    // `item.images`.
    const previewGallery = allImages(item)
    return (
      <Box>
        {item.type === "image" && (
          <Box
            sx={{
              mb: 1.5,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "action.hover",
              display: "flex",
              justifyContent: "center",
              maxHeight: 220
            }}>
            <img
              src={item.content}
              alt={item.source?.title || ""}
              loading="lazy"
              style={{
                maxWidth: "100%",
                maxHeight: 220,
                objectFit: "contain",
                display: "block"
              }}
            />
          </Box>
        )}
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
            {item.type === "text" ? (
              <MarkdownRenderer
                content={item.content}
                maxLines={previewMaxLines(item.content)}
              />
            ) : item.type === "link" ? (
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  fontSize: "0.7rem",
                  fontStyle: "italic"
                }}>
                {prettyUrl(item.content)}
              </Typography>
            ) : null}
          </Box>
        ) : (
          <>
            {item.type === "text" && (
              <MarkdownRenderer
                content={item.content}
                maxLines={previewMaxLines(item.content)}
              />
            )}
            {item.type === "link" && (
              <Typography
                variant="body2"
                sx={{ fontSize: "0.9rem", wordBreak: "break-word" }}>
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
            )}
          </>
        )}
        {previewGallery.length > 0 && (
          <Box
            sx={{
              mt: 0.75,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: "text.disabled"
            }}>
            <ImageRoundedIcon sx={{ fontSize: 13 }} />
            <Typography
              variant="caption"
              sx={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
              {previewGallery.length} 张图片
            </Typography>
          </Box>
        )}
      </Box>
    )
  }

  if (mode === "front") {
    return (
      <>
        <Chip
          label={TYPE_LABEL[item.type] ?? "文本"}
          size="small"
          variant="outlined"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            height: 20,
            fontSize: "0.65rem",
            fontWeight: 500,
            letterSpacing: "0.04em"
          }}
        />
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "divider",
              borderRadius: 1
            },
            "&::-webkit-scrollbar-track": { bgcolor: "transparent" }
          }}>
          <Box
            sx={
              (contentAlign ?? "center") === "center"
                ? { marginTop: "auto", marginBottom: "auto" }
                : undefined
            }>
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
            ) : item.type === "text" ? (
              <Box
                sx={{
                  pl: 2,
                  borderLeft: "4px solid",
                  borderLeftColor: "primary.main",
                  textAlign: "left"
                }}>
                <MarkdownRenderer content={item.content} hideImages />
              </Box>
            ) : (
              <ContentBlock item={item} />
            )}
            {allImages(item).length > 0 && (
              <ImageGallery images={allImages(item)} />
            )}
          </Box>
        </Box>
        {(item.source?.url || item.pdfSource) && (
          <>
            <Box
              sx={{
                mx: -5,
                borderTop: "1px solid",
                borderColor: "divider",
                mb: 1
              }}
            />
            <Typography
              variant="caption"
              onClick={
                item.pdfSource
                  ? (e) => {
                      e.stopPropagation()
                      onOpenPdfSource?.(item)
                    }
                  : undefined
              }
              sx={{
                color: "text.disabled",
                fontSize: "0.7rem",
                textAlign: "center",
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
                ...(item.pdfSource
                  ? { cursor: "pointer", "&:hover": { color: "primary.main" } }
                  : {})
              }}>
              {item.pdfSource
                ? pdfSourceLabel(item)
                : `↗ ${item.source.title || prettyUrl(item.source.url)}`}
            </Typography>
          </>
        )}
        <Typography
          variant="caption"
          sx={{
            mt: 0.5,
            color: "text.disabled",
            textAlign: "center",
            fontSize: "0.7rem",
            letterSpacing: "0.04em",
            flexShrink: 0
          }}>
          ⌄ 点击翻转
        </Typography>
      </>
    )
  }

  if (mode === "back") {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column"
        }}>
        <Box sx={{ marginTop: "auto", marginBottom: "auto", width: "100%" }}>
          <OriginalBlock item={item} />
          {(item.source?.url || item.pdfSource) && (
            <Box
              sx={{
                mt: 2.5,
                pt: 2,
                borderTop: "1px solid",
                borderColor: "divider"
              }}>
              <Typography
                variant="body2"
                component={item.pdfSource ? "span" : "a"}
                href={item.pdfSource ? undefined : item.source?.url}
                target={item.pdfSource ? undefined : "_blank"}
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.pdfSource) onOpenPdfSource?.(item)
                }}
                sx={{
                  color: "primary.main",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                  fontSize: "0.8rem",
                  wordBreak: "break-word",
                  cursor: item.pdfSource ? "pointer" : "pointer"
                }}>
                {item.pdfSource
                  ? pdfSourceLabel(item)
                  : `↗ ${item.source?.title || prettyUrl(item.source?.url ?? "")}`}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
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
        <OriginalBlock item={item} />
      </Box>
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
          <Box sx={{ color: "text.secondary", opacity: 0.7 }}>
            {typeIcon(item.type)}
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: "0.75rem",
              letterSpacing: "0.03em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0
            }}>
            {item.type.toUpperCase()}
            {!item.source && !item.pdfSource && " · 自建卡片"}
            {item.pdfSource && ` · ${pdfSourceLabel(item)}`}
            {" · "}
            {new Date(item.createdAt).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </Typography>
        </Box>
      </Box>

      {(item.source?.url || item.pdfSource) && (
        <>
          <Box
            sx={{
              mx: -5,
              borderTop: "1px solid",
              borderColor: "divider",
              mb: 1
            }}
          />
          <Typography
            variant="caption"
            onClick={
              item.pdfSource
                ? (e) => {
                    e.stopPropagation()
                    onOpenPdfSource?.(item)
                  }
                : undefined
            }
            sx={{
              color: "text.disabled",
              fontSize: "0.7rem",
              textAlign: "center",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              ...(item.pdfSource
                ? { cursor: "pointer", "&:hover": { color: "primary.main" } }
                : {})
            }}>
            {item.pdfSource
              ? pdfSourceLabel(item)
              : `↗ ${item.source?.title || prettyUrl(item.source?.url ?? "")}`}
          </Typography>
        </>
      )}
    </>
  )
}
