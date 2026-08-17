export interface User {
    id: string
    name: string
    avatarUrl?: string
}


export type PdfScale = 'auto' | 'page-actual' | 'page-fit' | 'page-width' | string
