import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { usePdfViewerContext } from '../../context/pdf_viewer_context'
import { Painter } from './painter'
import { useUserContext } from '@/context/user_context'
import { usePainter } from './context/use_painter'
import { PDFPageView } from 'pdfjs-dist/types/web/pdf_page_view'
import { useOptionsContext } from './context/options_context'
import { annotationDefinitions, IAnnotationStore } from './const/definitions'
import { FREE_TEXT_EDITOR } from './painter/const'
import { useAnnotationStore } from './store'
import { debounce } from '@/utils'
import type { AnnotationPermissions } from './types/annotator'

interface AnnotatorExtensionProps {
    annotations?: IAnnotationStore[]
    annotationPermissions?: AnnotationPermissions
    defaultShowAnnotationAuthorLabels?: boolean

    onLoad: () => void

    onAnnotationAdd: (annotation: IAnnotationStore) => void
    onAnnotationDelete: (id: string) => void
    onAnnotationSelected: (annotation: IAnnotationStore | null, isClick: boolean) => void
    onAnnotationChanged: (annotation: IAnnotationStore) => void
    /** Text selection made inside the PDF — our own selection bar listens. */
    onTextSelected?: (range: Range | null) => void
}

export const AnnotatorExtension: React.FC<AnnotatorExtensionProps> = ({
    annotations,
    annotationPermissions,
    defaultShowAnnotationAuthorLabels = false,
    onLoad,
    onAnnotationAdd,
    onAnnotationDelete,
    onAnnotationSelected,
    onAnnotationChanged,
    onTextSelected
}) => {
    const { isReady, pdfViewer, eventBus, isSidebarCollapsed } = usePdfViewerContext()
    const { user } = useUserContext()
    const { refreshPainter, setPainter } = usePainter()
    const { defaultOptions, primaryColor } = useOptionsContext()

    const clearAnnotations = useAnnotationStore(state => state.clearAnnotations)


    const latestPropsRef = useRef({
        annotations: annotations ?? [],
        onLoad,
        onAnnotationAdd,
        onAnnotationDelete,
        onAnnotationSelected,
        onAnnotationChanged,
        onTextSelected
    })
    latestPropsRef.current = {
        annotations: annotations ?? [],
        onLoad,
        onAnnotationAdd,
        onAnnotationDelete,
        onAnnotationSelected,
        onAnnotationChanged,
        onTextSelected
    }

    const painterRef = useRef<Painter | null>(null)
    const latestUserRef = useRef(user)
    const latestPermissionsRef = useRef(annotationPermissions)
    const defaultShowAnnotationAuthorLabelsRef = useRef(defaultShowAnnotationAuthorLabels)
    latestUserRef.current = user
    latestPermissionsRef.current = annotationPermissions

    const debouncedViewAreaChanged = useRef(
        debounce(
            () => {
                const element = document.querySelector(`#${FREE_TEXT_EDITOR}`)
                if (element?.parentNode) {
                    try {
                        element.parentNode.removeChild(element)
                    } catch {
                        // ignore
                    }
                }
            },
            100,
            true
        )
    ).current

    const handleViewAreaChanged = useCallback(() => {
        debouncedViewAreaChanged()
    }, [debouncedViewAreaChanged])

    useEffect(() => {
        clearAnnotations()

        if (!isReady || !pdfViewer || !eventBus || !latestUserRef.current) return

        let disposed = false
        let documentLoadStarted = false
        let rerenderTimer: ReturnType<typeof setTimeout> | null = null

        const painterInstance = new Painter({
            primaryColor,
            defaultOptions,
            currentUser: latestUserRef.current,
            annotationPermissions: latestPermissionsRef.current,
            defaultShowAnnotationAuthorLabels: defaultShowAnnotationAuthorLabelsRef.current,
            PDFViewerApplication: pdfViewer,

            onTextSelected: (range) => {
                latestPropsRef.current.onTextSelected?.(range)
            },

            onAnnotationAdd: (annotation) => {
                latestPropsRef.current.onAnnotationAdd(annotation)
            },

            onAnnotationDelete: (id) => {
                latestPropsRef.current.onAnnotationDelete(id)
            },

            onAnnotationSelected: (annotation, isClick, _selectorRect) => {
                latestPropsRef.current.onAnnotationSelected(annotation ?? null, isClick)
            },

            onAnnotationChanged: (annotation) => {
                latestPropsRef.current.onAnnotationChanged(annotation)
            }
        })

        painterRef.current = painterInstance
        setPainter(painterInstance)
        // Default to SELECT mode so the selector (mark click → onAnnotationSelected)
        // is live from the first render — activate(null) would leave it dormant.
        painterInstance.activate(annotationDefinitions[0], null)

        const handlePageRendered = ({ source, cssTransform, pageNumber }: { source: PDFPageView; cssTransform: boolean; pageNumber: number }) => {
            painterInstance.initCanvas({
                pageView: source,
                cssTransform,
                pageNumber
            })
        }

        eventBus.on('pagerendered', handlePageRendered)

        // NOTE: private pdfjs event API, version-sensitive
        eventBus._on('updateviewarea', handleViewAreaChanged)

        painterInstance.initWebSelection(pdfViewer.viewer as HTMLDivElement)

        // 检查文档是否已经加载
        const handleDocumentLoaded = async () => {
            if (disposed || documentLoadStarted) return
            documentLoadStarted = true

            try {
                const { annotations: latestAnnotations } = latestPropsRef.current
                await painterInstance.initAnnotationsOnce(latestAnnotations)
            } catch (error) {
                if (!disposed) {
                    console.error('[Annotator] Failed to initialize annotations', error)
                }
                return
            }

            if (disposed) return

            rerenderTimer = setTimeout(() => {
                rerenderTimer = null
                if (disposed) return

                for (let i = 0; i < pdfViewer.pagesCount; i++) {
                    const pageView = pdfViewer.getPageView(i)
                    if (pageView && pageView.div && pageView.canvas) {
                        const konvaCanvasStore = painterInstance.getKonvaCanvasStore()
                        if (konvaCanvasStore && konvaCanvasStore.has(i + 1)) {
                            painterInstance.reRenderAnnotations(i + 1)
                        }
                    }
                }
            }, 0)
            latestPropsRef.current.onLoad?.()

        }

        if (pdfViewer.pdfDocument) {
            void handleDocumentLoaded()
        } else {
            eventBus.on('documentloaded', handleDocumentLoaded)
        }

        return () => {
            disposed = true
            if (rerenderTimer) {
                clearTimeout(rerenderTimer)
                rerenderTimer = null
            }
            eventBus.off('pagerendered', handlePageRendered)
            eventBus.off('updateviewarea', handleViewAreaChanged)
            eventBus.off('documentloaded', handleDocumentLoaded)
            painterInstance.destroy()
            if (painterRef.current === painterInstance) {
                painterRef.current = null
            }
            setPainter(null)
        }

    }, [clearAnnotations, defaultOptions, eventBus, handleViewAreaChanged, isReady, pdfViewer, primaryColor, setPainter])

    useLayoutEffect(() => {
        if (latestUserRef.current) {
            painterRef.current?.setPermissionContext(latestUserRef.current, latestPermissionsRef.current)
            if (painterRef.current) refreshPainter()
        }
    }, [annotationPermissions, refreshPainter, user])

    useEffect(() => {
        handleViewAreaChanged()
    }, [handleViewAreaChanged, isSidebarCollapsed])

    // Sync the in-memory marks with the persisted annotation list: annotations
    // deleted in the cards panel (broadcast via _dbpdf → reloaded annotations
    // prop) must drop their Konva marks immediately, without a viewer remount.
    const annotationsKeyRef = useRef('')
    useEffect(() => {
        const key = JSON.stringify((annotations ?? []).map((a) => a.id))
        if (key === annotationsKeyRef.current) return
        annotationsKeyRef.current = key
        const painter = painterRef.current
        if (!painter) return
        const ids = new Set((annotations ?? []).map((a) => a.id))
        useAnnotationStore.getState().annotations.forEach((_a, id) => {
            if (!ids.has(id)) {
                painter.removeAnnotationFromPanel(id)
            }
        })
    }, [annotations])

    return <></>
}
