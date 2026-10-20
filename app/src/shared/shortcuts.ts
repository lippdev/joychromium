import type { ShellCommand } from "./ipc";
import { mediaCommandForKey } from "./media";

/**
 * Turns a keyboard event into a shell command. Pure, so every platform mapping is covered by a unit test instead of
 * by launching the app. `mod` is the platform modifier: Ctrl everywhere and Cmd on macOS, where the event carries meta.
 */
export interface ShortcutInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
}

export function commandForShortcut(input: ShortcutInput, historyUrl: string, favoritesUrl: string): ShellCommand | undefined {
  if (input.type !== "keyDown") return undefined;
  const mod = input.control || input.meta;
  const key = input.key.toLowerCase();
  if (key === "escape") return { type: "escape" };
  const media = mediaCommandForKey(key);
  if (media) return media;
  if (key === "f11") return { type: "window-mode" };
  if (!mod) return undefined;
  if (key === "t") return input.shift ? { type: "reopen-tab" } : { type: "new-tab" };
  if (key === "n" && input.shift) return { type: "new-tab", isPrivate: true };
  if (key === "w") return { type: "close-tab" };
  if (key === "tab") return { type: "switch-tab", offset: input.shift ? -1 : 1 };
  if (key === ",") return { type: "settings" };
  if (key === "d") return { type: "toggle-favorite" };
  if (key === "r") return { type: "reload" };
  if (key === "h") return { type: "navigate", url: historyUrl };
  if (key === "b") return { type: "navigate", url: favoritesUrl };
  if (key === "m") return { type: "mute-tab" };
  if (key === "=" || key === "+") return { type: "zoom", delta: 0.1 };
  if (key === "-") return { type: "zoom", delta: -0.1 };
  if (key === "0") return { type: "zoom", delta: 0 };
  return undefined;
}
