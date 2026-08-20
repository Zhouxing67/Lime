import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded"
import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded"
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded"
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded"
import FormatQuoteRoundedIcon from "@mui/icons-material/FormatQuoteRounded"
import ImageRoundedIcon from "@mui/icons-material/ImageRounded"
import { alpha, Box, Typography } from "@mui/material"

import type { DisplayCard } from "../types"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"
import {
  extractMarkdownImages,
  prettyUrl,
  truncateText
} from "../utils"
import { occurrenceForTranslation } from "../utils/cards"
import MarkdownRenderer from "./MarkdownRenderer"
import PdfQuoteCard from "./PdfQuoteCard"

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
  placed: "置入",
  todo: "待办"
}

export const typeIcon = (type: string) => {
  switch (type) {
    case "text":
      return <FormatQuoteRoundedIcon fontSize="small" />
    case "image":
      return <ImageRoundedIcon fontSize="small" />
    case "placed":
      return <BookmarkRoundedIcon fontSize="small" />
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
  if (item.pdfSource && !item.image && !item.content && !legacyImages(item).length) {
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
  if (item.vocabularyEntries) return <VocabularyBlock item={item} />
  if (item.image || item.type === "image") {
    const src = item.image || item.content
    if (!src) return <PdfQuoteCard text={item.content} />
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 200
        }}>
        <img
          src={src}
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
  return <PdfQuoteCard text={item.content} />
}

function VocabularyBlock({
  item,
  onOpenPdfSource,
  maxEntries,
  maxHeight
}: {
  item: DisplayCard
  onOpenPdfSource?: (item: DisplayCard) => void
  maxEntries?: number
  maxHeight?: number
}) {
  const entries = item.vocabularyEntries ?? []
  const visibleEntries = maxEntries ? entries.slice(0, maxEntries) : entries
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        暂无生词
      </Typography>
    )
  }
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        maxHeight,
        overflowY: maxHeight ? "auto" : undefined,
        pr: maxHeight ? 0.5 : 0
      }}>
      {item.pdfSource?.pdfName && (
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontSize: "0.68rem", mb: 0.25 }}>
          {item.pdfSource.pdfName}
        </Typography>
      )}
      {visibleEntries.map((entry) => (
        <Box
          key={entry.id}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.35,
            px: 1,
            py: 0.75,
            borderRadius: 1,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
            borderLeft: "2px solid",
            borderColor: "primary.light"
          }}>
          <Typography sx={{ fontSize: "0.82rem", fontWeight: 650 }}>
            {entry.term}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {entry.translations.map((translation) => {
              const occurrence = occurrenceForTranslation(entry, translation)
              return (
                <Typography
                  component="button"
                  type="button"
                  key={translation.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!occurrence || !item.pdfSource) return
                    onOpenPdfSource?.({
                      ...item,
                      pdfSource: {
                        ...item.pdfSource,
                        page: occurrence.page
                      },
                      vocabularySource: {
                        entryId: entry.id,
                        occurrenceId: occurrence.id,
                        rects: occurrence.rects
                      }
                    })
                  }}
                  sx={{
                    border: 0,
                    p: 0,
                    bgcolor: "transparent",
                    fontFamily: "inherit",
                    fontSize: "0.74rem",
                    lineHeight: 1.45,
                    color: "text.secondary",
                    textAlign: "left",
                    cursor: occurrence && onOpenPdfSource ? "pointer" : "default",
                    wordBreak: "break-word",
                    "&:hover": occurrence && onOpenPdfSource
                      ? { color: "primary.main" }
                      : undefined
                  }}>
                  {translation.text}
                </Typography>
              )
            })}
          </Box>
        </Box>
      ))}
      {visibleEntries.length < entries.length && (
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", textAlign: "center", py: 0.5 }}>
          另有 {entries.length - visibleEntries.length} 个词条，打开卡片查看全部
        </Typography>
      )}
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
    // `item.images`. Layout is UNIFIED across types: [摘要] [内容] [备注] — the
    // 摘要 sits on top for image cards too; a placed region card (content="")
    // skips the empty image box.
    const previewGallery = allImages(item)
    const renderBody = () => (
      <>
        {item.image ? (
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
              src={item.image}
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
        ) : item.type === "image" && item.content ? (
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
        ) : item.vocabularyEntries ? (
          <VocabularyBlock
            item={item}
            onOpenPdfSource={onOpenPdfSource}
            maxEntries={5}
          />
        ) : item.type === "placed" && item.content ? (
          <PdfQuoteCard text={item.content} maxLines={previewMaxLines(item.content)} />
        ) : item.type === "text" ? (
          <MarkdownRenderer
            content={item.content}
            maxLines={previewMaxLines(item.content)}
          />
        ) : null}
        {item.type !== "text" && item.comment && (
          <Box sx={{ mt: 1 }}>
            <MarkdownRenderer content={item.comment} maxLines={1} />
          </Box>
        )}
      </>
    )
    return (
      <Box>
        {item.title ? (
          <Box>
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 700,
                wordBreak: "break-word",
                color: "text.primary",
                mb: 1.5,
                pb: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider"
              }}>
              {truncateTo ? truncateText(item.title, truncateTo) : item.title}
            </Typography>
            {renderBody()}
          </Box>
        ) : (
          renderBody()
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 28,
            color: "text.disabled",
            flexShrink: 0
          }}>
          {typeIcon(item.type)}
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.72rem",
              letterSpacing: "0.03em",
              color: "text.secondary"
            }}>
            {TYPE_LABEL[item.type] ?? "文本"}
          </Typography>
        </Box>
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
                  borderLeft: "3px solid",
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
        <Box
          sx={{
            mt: 0.75,
            color: "text.disabled",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.25,
            flexShrink: 0
          }}>
          <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />
          <Typography
            variant="caption"
            sx={{ fontSize: "0.7rem", letterSpacing: "0.03em" }}>
            点击翻转
          </Typography>
        </Box>
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
      {/* 内容 (text) */}
      {item.type === "text" && item.content && (
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
            内容
          </Typography>
          <MarkdownRenderer content={item.content} />
        </Box>
      )}

      {/* 只读原始内容 (image/placed) */}
      {(item.type === "image" || item.type === "placed") && (
        <Box sx={{ mt: item.title ? 2 : 0 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
              mb: 0.5,
              display: "block"
            }}>
            {item.vocabularyEntries ? "生词" : "只读原始内容"}
          </Typography>
          {item.vocabularyEntries ? (
            <VocabularyBlock
              item={item}
              onOpenPdfSource={onOpenPdfSource}
              maxHeight={420}
            />
          ) : item.image || (item.type === "image" && item.content) ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                p: 1,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "action.hover"
              }}>
              <img
                src={item.image || item.content}
                alt={item.source?.title || ""}
                style={{
                  maxWidth: "100%",
                  maxHeight: 420,
                  objectFit: "contain",
                  borderRadius: 1
                }}
              />
            </Box>
          ) : item.type === "placed" && item.content ? (
            <PdfQuoteCard text={item.content} />
          ) : item.content ? (
            <MarkdownRenderer content={item.content} />
          ) : null}
        </Box>
      )}

      {/* 备注 (image/placed only) */}
      {item.type !== "text" && item.comment && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
              mb: 0.5,
              display: "block"
            }}>
            备注
          </Typography>
          <MarkdownRenderer content={item.comment} />
        </Box>
      )}
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
