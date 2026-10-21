import { internalPageFile, isWebUrl } from "./pages";
import type { WindowMode } from "./platform";

/**
 * What a launcher (ConsoleMode, Playnite, Steam, a desktop shortcut) can ask for on the command line, for the first
 * launch and for a second launch handed to the running instance alike:
 *
 *   JoyChromium.exe [--tv | --window] [--new-tab] [https://… | joychromium://…]
 *
 * `--tv` (alias `--kiosk`, `--fullscreen`) and `--window` set the mode for this run only; the saved preference stays.
 * A URL opens in a new tab; `--new-tab` opens the new tab page. The OS hands `joychromium://` links here too, once the
 * installer registered the scheme: an internal page (`joychromium://history`) or `joychromium://open?url=<https URL>`,
 * which lets a launcher that only takes URIs open a site.
 */
export interface LaunchArgs {
  url?: string;
  mode?: WindowMode;
  newTab: boolean;
}

const TV_FLAGS = ["--tv", "--kiosk", "--fullscreen"];

/** A web address, a public internal page, or the site inside an open link. Anything else another app hands us is ignored. */
export function launchUrl(arg: string): string | undefined {
  if (isWebUrl(arg)) return arg;
  if (internalPageFile(arg, false)) return arg;
  if (!/^joychromium:\/\/open\b/i.test(arg)) return undefined;
  try {
    const target = new URL(arg).searchParams.get("url") ?? "";
    return isWebUrl(target) ? target : undefined;
  } catch {
    return undefined;
  }
}

export function parseLaunchArgs(argv: readonly string[]): LaunchArgs {
  const flags = argv.map((arg) => arg.toLowerCase());
  const tv = flags.some((arg) => TV_FLAGS.includes(arg));
  const window = flags.includes("--window");
  return {
    url: argv.map(launchUrl).find((url) => url !== undefined),
    // Both flags at once is a launcher's mistake: keep the saved mode rather than guess.
    mode: tv === window ? undefined : tv ? "tv" : "window",
    newTab: flags.includes("--new-tab"),
  };
}
