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

/** What the A button does next: take over playback, or activate whatever has focus. */
export type ActivateIntent = "media" | "focus";

/**
 * A is play/pause only when the active tab is playing media and the page answers that a playing, unmuted element is
 * there; a muted background video, a paused player or no player at all keep A as the focus activator. The decision
 * comes from the injected script and is normalized here, so a missing or garbled answer never becomes a media action.
 */
export function activateIntent(decision: unknown): ActivateIntent {
  return decision === "media" ? "media" : "focus";
}
