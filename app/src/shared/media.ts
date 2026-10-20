/** What the page's media element is asked to do, from a controller button, a media key or the quick menu. */
export const MEDIA_ACTIONS = ["toggle", "next", "previous"] as const;
export type MediaAction = (typeof MEDIA_ACTIONS)[number];

/** The `KeyboardEvent.key` values Chromium reports for the hardware media keys. */
const MEDIA_KEYS: Record<string, MediaAction> = {
  mediaplaypause: "toggle",
  play: "toggle",
  pause: "toggle",
  medianexttrack: "next",
  mediatracknext: "next",
  mediaprevioustrack: "previous",
  mediatrackprevious: "previous",
};

export function isMediaAction(value: unknown): value is MediaAction {
  return MEDIA_ACTIONS.some((action) => action === value);
}

export function mediaActionForKey(key: string): MediaAction | undefined {
  return MEDIA_KEYS[key.toLowerCase()];
}

export function mediaCommandForKey(key: string): { type: "media"; action: MediaAction } | undefined {
  const action = mediaActionForKey(key);
  return action ? { type: "media", action } : undefined;
}

/**
 * A is play/pause whenever the page has media to act on; without one it stays the focus activator, so browsing a page
 * with no player is unchanged.
 */
export function activateIntent(mediaHandled: boolean): "media" | "focus" {
  return mediaHandled ? "media" : "focus";
}
