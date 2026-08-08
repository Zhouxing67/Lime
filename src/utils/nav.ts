import type { SidebarTab } from "../components/NavRail"

/** Pure decision for a NavRail view-button click: clicking the CURRENT tab's
 *  icon toggles the sidebar; clicking a different tab switches the view (and
 *  opens the sidebar). Extracted from handleSetSidebarTab so the branch logic
 *  is unit-testable + closure-free. */
export function nextSidebarAction(
  tab: SidebarTab,
  currentTab: SidebarTab
): "toggle" | "switch" {
  return tab === currentTab ? "toggle" : "switch"
}
