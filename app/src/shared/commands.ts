import type { ShellCommand } from "./ipc";
import { isMediaAction } from "./media";

/**
 * Validation for commands arriving from the chrome renderer. The renderer is our own code, but a compromised or
 * crashing renderer must not be able to push a malformed command into the main process, and a typo in a new command
 * should fail loudly in the log instead of silently doing nothing.
 */

const actions = ["minimize", "maximize", "close"] as const;

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

/** Type guard for the whole command union. Unknown types are refused. */
export function isShellCommand(raw: unknown): raw is ShellCommand {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case "navigate":
      return typeof c.url === "string" && (c.allowHttp === undefined || typeof c.allowHttp === "boolean");
    case "search-or-navigate":
    case "find":
    case "keyboard-insert":
    case "address-input":
      return typeof c.text === "string";
    case "close-tab":
    case "mute-tab":
      return optionalNumber(c.id);
    case "activate-tab":
    case "duplicate-tab":
    case "close-other-tabs":
      return typeof c.id === "number";
    case "switch-tab":
      return typeof c.offset === "number";
    case "permission":
      return typeof c.allow === "boolean" && typeof c.remember === "boolean";
    case "window":
      return actions.includes(c.action as (typeof actions)[number]);
    case "zoom":
      return typeof c.delta === "number";
    case "media":
      return isMediaAction(c.action);
    case "chrome-height":
      return typeof c.height === "number" && c.height >= 0 && c.height < 1000;
    case "ui-settings":
      return (c.uiScale === undefined || typeof c.uiScale === "number")
        && (c.overscan === undefined || typeof c.overscan === "number")
        && (c.highContrast === undefined || typeof c.highContrast === "boolean")
        && (c.language === undefined || c.language === "pt-BR" || c.language === "en")
        && (c.crashReports === undefined || typeof c.crashReports === "boolean");
    case "keyboard-open":
      return c.target === "address" || c.target === "page";
    case "back":
    case "forward":
    case "reload":
    case "home":
    case "settings":
    case "new-tab":
    case "reopen-tab":
    case "toggle-favorite":
    case "fullscreen-toggle":
    case "window-mode":
    case "find-close":
    case "keyboard-close":
    case "keyboard-backspace":
    case "keyboard-submit":
    case "cycle-input-mode":
    case "escape":
      return true;
    default:
      return false;
  }
}
