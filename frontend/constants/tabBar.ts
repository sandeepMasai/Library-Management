/**
 * Keep in sync with `FloatingTabBar` visual layout.
 * Use `scrollPaddingBottom()` for list/scroll content that sits under the tab bar.
 */
export const FLOATING_TAB_BAR_INNER_HEIGHT = 64;
export const FLOATING_TAB_BAR_BOTTOM_MARGIN = 0;
export const FLOATING_TAB_BAR_TOP_BUFFER = 8;

export function scrollPaddingBottom(insetBottom = 0): number {
  const safe = Math.max(insetBottom, 0);
  return safe + FLOATING_TAB_BAR_INNER_HEIGHT + FLOATING_TAB_BAR_TOP_BUFFER;
}
