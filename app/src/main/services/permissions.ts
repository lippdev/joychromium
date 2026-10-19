import type { PermissionPrompt } from "../../shared/ipc";

/** The words a TV audience understands, in place of the Chromium permission names. */
export const PERMISSION_TEXT: Record<string, string> = {
  media: "your camera or microphone",
  geolocation: "your location",
  notifications: "notifications",
  midi: "MIDI devices",
  midiSysex: "MIDI devices",
  pointerLock: "locking the pointer",
  fullscreen: "full screen",
  openExternal: "opening another app",
  "clipboard-read": "reading the clipboard",
  "display-capture": "capturing the screen",
  "idle-detection": "idle detection",
  "window-management": "window placement",
  "speaker-selection": "audio outputs",
};

export function describePermission(kind: string): string {
  return PERMISSION_TEXT[kind] ?? kind;
}

export interface PendingPermission {
  prompt: PermissionPrompt;
  resolve: (allow: boolean) => void;
}

/**
 * Serialises permission prompts: one at a time, so a page that asks for five things cannot stack five panels on a
 * TV screen. Anything arriving while a prompt is open is denied for that request.
 */
export class PermissionQueue {
  private pending: PendingPermission | undefined;

  get current(): PendingPermission | undefined {
    return this.pending;
  }

  get prompt(): PermissionPrompt | undefined {
    return this.pending?.prompt;
  }

  /** Opens a prompt unless one is already waiting; returns the promise the page is blocked on, or undefined. */
  ask(prompt: PermissionPrompt): Promise<boolean> | undefined {
    if (this.pending) return undefined;
    return new Promise<boolean>((resolve) => {
      this.pending = { prompt, resolve };
    });
  }

  settle(allow: boolean): PermissionPrompt | undefined {
    const pending = this.pending;
    if (!pending) return undefined;
    this.pending = undefined;
    pending.resolve(allow);
    return pending.prompt;
  }
}
