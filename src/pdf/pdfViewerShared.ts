import { EventBus, LinkTarget, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs"

/** Shared per-PDF pdf.js viewer infrastructure: one EventBus + one official
 *  PDFLinkService (handles internal + external link navigation). The viewer
 *  stub maps the pdf.js "scroll to page" to Lime's own page jump. External
 *  links open in a NEW TAB (externalLinkTarget = BLANK). */
export function createPdfViewerShared(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  onNavigateTo?: (page: number) => void
) {
  const eventBus = new EventBus()
  const linkService = new PDFLinkService({
    eventBus,
    externalLinkTarget: LinkTarget.BLANK,
    externalLinkRel: "noopener"
  })
  const viewerStub = {
    scrollPageIntoView: ({ pageNumber }: { pageNumber: number }) => {
      onNavigateTo?.(pageNumber)
    },
    currentPageNumber: 1,
    currentScale: 1,
    get isInPresentationMode() {
      return false
    }
  }
  linkService.setViewer(viewerStub as never)
  linkService.setDocument(doc)
  return { eventBus, linkService }
}
