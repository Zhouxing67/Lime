import React, { useRef, useMemo, useEffect } from 'react'
import { usePdfViewer, type UseViewerOptions } from '../hooks/usePdfViewer'
import { PdfViewerContext, type PdfViewerContextValue } from './pdf_viewer_context'
import { UserContext, UserContextValue } from './user_context'
import { PdfScale, User } from '@/types'
import styles from './styles.module.scss'
import { Flex, Box } from '@radix-ui/themes'
import { LoadingIndicator } from '@/components/loading_indicator'
import { ErrorDisplay } from '@/components/error_display'
import { usePinchZoom } from '@/hooks/usePinchZoom'

export interface PdfViewerProviderProps extends Omit<UseViewerOptions, 'eventBus'> {
    children: React.ReactNode
    toolbar?: React.ReactNode
    title?: React.ReactNode
    actions?: React.ReactNode
    style?: React.CSSProperties
    initialScale?: PdfScale
    user?: User
}

export const PdfViewerProvider: React.FC<PdfViewerProviderProps> = ({
    children,
    toolbar,
    title,
    actions,
    style = { width: '100vw', height: '100vh' },
    initialScale = 'auto',
    user,
    ...viewerOptions
}) => {
    const viewerContainerRef = useRef<HTMLDivElement>(null)
    const { loading, progress, pdfDocument, pdfViewer, eventBus, loadError } = usePdfViewer(viewerContainerRef, viewerOptions)

    useEffect(() => {
        if (!pdfViewer || !eventBus) return

        const handlePagesLoaded = () => {
            pdfViewer.currentScaleValue = initialScale
        }

        eventBus.on('pagesloaded', handlePagesLoaded)

        return () => {
            eventBus.off('pagesloaded', handlePagesLoaded)
        }
    }, [pdfViewer, eventBus, initialScale])

    const isReady = !!(pdfViewer && eventBus && viewerContainerRef.current && !loading)

    // Pinch zoom: Ctrl+wheel and trackpad pinch zoom with anchor point
    const { cancelPendingZoom } = usePinchZoom({
        pdfViewer: pdfViewer ?? null,
        containerRef: viewerContainerRef as React.RefObject<HTMLElement>,
        minScale: 0.1,
        maxScale: 10,
    })

    const contextValue = useMemo<PdfViewerContextValue>(
        () => ({
            pdfDocument,
            pdfViewer,
            eventBus,
            viewerContainerRef,
            isReady,
            cancelPendingZoom
        }),
        [pdfDocument, pdfViewer, eventBus, isReady, cancelPendingZoom]
    )

    const userContextValue = useMemo<UserContextValue>(
        () => ({
            user: user || null
        }),
        [user]
    )

    useEffect(() => {
        if (!pdfViewer || !eventBus) {
            return
        }
        const handleResize = () => {
            const currentScaleValue = pdfViewer.currentScaleValue
            if (currentScaleValue === 'auto' || currentScaleValue === 'page-fit' || currentScaleValue === 'page-width') {
                pdfViewer.currentScaleValue = currentScaleValue
            }
            pdfViewer.update()
        }

        window.addEventListener('resize', handleResize)
        handleResize()
        return () => {
            window.removeEventListener('resize', handleResize)
        }
    }, [pdfViewer, eventBus])

    return (
        <UserContext.Provider value={userContextValue}>
            <PdfViewerContext.Provider value={contextValue}>
                <Flex id="InkLayer" className={styles.InkLayerViewer} style={style} direction="column" width="100%" position="relative">
                    <LoadingIndicator progress={progress} loading={loading} />
                    {loadError && <ErrorDisplay error={loadError} />}
                    <Flex pl="2" pr="2" className={styles.viewerHeader}>
                        <div className={styles['viewerHeader-title']}>
                            <Flex align="center" gap="2" className={styles['viewerHeader-title-left']}>
                                <div className={styles['viewerHeader-title-name']}>{title || 'PDF Viewer'}</div>
                            </Flex>
                            <div className={styles['viewerHeader-title-actions']}>
                                <Flex direction="row" gap="3" justify="between" align="center">
                                    {actions}
                                </Flex>
                            </div>
                        </div>
                    </Flex>
                    <Flex flexGrow="1" minHeight="0" className={styles.viewerBody}>
                        <Flex flexGrow="1" minHeight="0" className={styles.viewerWrapper}>
                            <Flex className={styles.viewerContainer} direction="column" flexGrow="1">
                                {toolbar && (
                                    <Flex align="center" justify="center" className={styles['viewerContainer-header']}>
                                        {toolbar}
                                    </Flex>
                                )}
                                <Box position="relative" flexGrow="1" className={styles['viewerContainer-content']}>
                                    <div ref={viewerContainerRef} className={styles.pdfjsViewerContainer}>
                                        <div className="pdfViewer"></div>
                                    </div>
                                </Box>
                            </Flex>
                        </Flex>
                    </Flex>
                    {children}
                </Flex>
            </PdfViewerContext.Provider>
        </UserContext.Provider>
    )
}
