export const IconGrip = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 14, height: 14, fill: "currentColor" }}>
    <path d="M7 5h2v2H7zm0 6h2v2H7zm0 6h2v2H7zm4-12h2v2h-2zm0 6h2v2h-2zm0 6h2v2h-2z" />
  </svg>
)

export const IconPushPin = ({ rotated }: { rotated: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={{
      display: "block",
      width: 16,
      height: 16,
      transition: "transform 0.2s",
      fill: "currentColor",
      transform: rotated ? "rotate(45deg)" : "rotate(0deg)"
    }}>
    <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.63-.84 1-1.88 1-3V4h4zm-3-2c-.55 0-1 .45-1 1v1h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1V3c0-.55-.45-1-1-1h-2zm-4 4v1c0 1.5.5 2.8 1.3 3.7.5.6 1.1 1 1.7 1.3V15h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1v-3c.6-.3 1.2-.7 1.7-1.3.8-.9 1.3-2.2 1.3-3.7V7H7z" />
  </svg>
)

export const IconClose = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
)

export const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 14, height: 14, fill: "currentColor" }}>
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
  </svg>
)

export const IconSidebar = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4V4z" />
  </svg>
)

export const IconBack = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
  </svg>
)
