/**
 * The short messages the shell shows in a toast (E7-01).
 *
 * They are raised deep in the main process — a download refused, a page crashed, a popup cut off — and used to travel as
 * English literals, so a Portuguese session read English toasts. Each message now carries an id and, when it needs one,
 * a detail the caller already has in hand; the text is built from the dictionary at the moment it is shown, with the
 * language in effect.
 */
import { t } from "./i18n";

export const STATUS_IDS = [
  "blockedScheme",
  "blockedHost",
  "popupBlocked",
  "pageCrashed",
  "pageUnresponsive",
  "pageResponsive",
  "downloadBlocked",
  "downloading",
  "downloaded",
  "downloadFailed",
  "tabMuted",
  "tabUnmuted",
  "zoom",
  "favoriteAdded",
  "favoriteRemoved",
  "inputMode",
  "browsingDataCleared",
  "restoredAfterCrash",
] as const;

export type StatusId = (typeof STATUS_IDS)[number];

/** The message for `id`, with an optional detail appended the same way for every kind of message. */
export function statusText(id: StatusId, language: string | undefined, detail?: string): string {
  const base = t(language, `status.${id}`);
  return detail ? `${base} · ${detail}` : base;
}
