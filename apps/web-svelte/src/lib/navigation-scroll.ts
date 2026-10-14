export interface ScrollGeometry {
  y: number;
  extent: number;
}

/**
 * When document height changes without a scroll (async content, accordion),
 * refresh the stored extent so the next user gesture is not treated as a
 * padding-induced anchor. Skip when scrollY already moved — that pair is
 * handled by mobileNavHiddenAfterScroll on the scroll event.
 */
export function shouldSyncScrollExtent(previous: ScrollGeometry, current: ScrollGeometry): boolean {
  return current.extent !== previous.extent && current.y === previous.y;
}

/** Padding changes can clamp or anchor the scroll position without a user gesture. */
export function mobileNavHiddenAfterScroll(
  hidden: boolean,
  previous: ScrollGeometry,
  current: ScrollGeometry
): boolean {
  if (current.y < 24) return false;
  if (previous.extent > 0 && previous.extent !== current.extent) return hidden;
  const delta = current.y - previous.y;
  if (delta > 8 && current.y > 80) return true;
  if (delta < -8) return false;
  return hidden;
}
