import { useEffect, useRef } from "preact/hooks";
import { controllerFamily, type ControllerFamily } from "../../shared/controllerGlyphs";
import { Button, DOUBLE_PRESS_MS, STICK_DEADZONE, directionOf, stickToScroll, stickToVelocity, type Direction } from "../../shared/controllerInput";
import { activePad, padsInUse, startedUsing, type PadSample } from "../../shared/controllerSelection";
import { GAMEPAD_POLL_MS, gamepadPoll, STICK_INTERVAL_MS } from "../../shared/gamepadLoop";
import type { ShellState } from "../../shared/ipc";
import { bridge, cmd } from "./bridge";
import { trackActivePad, vibrate } from "./haptics";


type Overlay = "none" | "tabs" | "menu" | "adblock";

/** The controller keyboard's shortcuts (keyboard.tsx draws each glyph on the key it presses). */
const KEYBOARD_SHORTCUTS: readonly [number, string][] = [
  [Button.X, "delete"], [Button.Y, "space"], [Button.LT, "shift"], [Button.Start, "submit"], [Button.LeftStick, "layer"],
];

/**
 * Gamepad handling for the shell. The tab of a web page owns the focus while the user reads it, so the shell keeps
 * polling on its own timer; a page that needs the D-pad in Arrows mode gets it through the main process. A minimized
 * window stops the loop instead of letting it run on ticks nobody sees: the main process reports the window state, and
 * `gamepadPoll` decides per tick.
 *
 * The poll is a timer rather than an animation frame because a page in HTML fullscreen covers the shell's renderer and
 * Chromium stops its animation frames: with the old rAF loop a video in fullscreen froze every button, B included, so
 * the viewer could not even go back. Timers keep running while the renderer is merely occluded, and the activity gate
 * still parks the loop when the window really is out of sight.
 */
export function useGamepad(state: ShellState, overlay: Overlay, setOverlay: (o: Overlay) => void): void {
  const pressed = useRef(new Set<number>());
  const connected = useRef(false);
  const active = useRef<number | null>(null);
  const inUse = useRef<number[]>([]);
  const family = useRef<ControllerFamily | undefined>(undefined);
  const lastDirection = useRef(0);
  const lastStick = useRef(0);
  const lastPointerMove = useRef(0);
  /**
   * Who A answers to on a page: the stick's pointer once the stick moved it, the D-pad's focus once the D-pad moved.
   * The last one used wins, so both can be mixed on the same page.
   */
  const pointing = useRef(false);
  // D-pad navigation takes activation from the pointer. In Cursor mode the pointer remains visible, but A activates the
  // newly focused control after the D-pad has moved it.
  const focusDriven = useRef(false);
  /** A single A at the pointer waits here for a possible second one, which would make it a right click. */
  const pendingClick = useRef<number | undefined>(undefined);
  const lastTick = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Read through a ref so the loop below is created once and keeps a single activity subscription for its lifetime.
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  useEffect(() => {
    // A newly selected or navigated page has not been focused by this pad yet.
    pointing.current = false;
    focusDriven.current = false;
  }, [state.activeUrl, state.tabs.find((tab) => tab.isActive)?.id, state.inputMode]);

  useEffect(() => {
    let timer: number | undefined;
    const windowActive = { current: true };
    const stop = (): void => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const resume = (): void => {
      if (timer === undefined) timer = window.setInterval(tick, GAMEPAD_POLL_MS);
    };
    function tick(): void {
      const now = performance.now();
      const decision = gamepadPoll(now, lastTick.current, { hidden: document.hidden, active: windowActive.current });
      if (decision === "park") {
        stop();
        return;
      }
      if (decision === "wait") return;
      lastTick.current = now;
      const pads = [...navigator.getGamepads()].filter((p): p is Gamepad => Boolean(p));
      const samples: PadSample[] = pads.map((p) => ({ index: p.index, standard: p.mapping === "standard", buttons: p.buttons, axes: p.axes }));
      // A pad that starts being used takes the input from the one before it: the last controller used is the one the
      // shell listens to, so swapping controllers never needs a restart.
      const using = padsInUse(samples);
      const padIndex = activePad(active.current, samples, startedUsing(inUse.current, using));
      inUse.current = using;
      const pad = pads.find((p) => p.index === padIndex) ?? null;
      trackActivePad(pad);
      if (padIndex !== active.current) {
        active.current = padIndex;
        pressed.current.clear();
        lastDirection.current = 0;
      }
      const down = (i: number): boolean => pad?.buttons[i]?.pressed ?? false;
      const justPressed = (i: number): boolean => {
        const is = down(i);
        const was = pressed.current.has(i);
        if (is) pressed.current.add(i); else pressed.current.delete(i);
        return is && !was;
      };

      if (!pad) {
        if (connected.current) {
          connected.current = false;
          family.current = undefined;
          pressed.current.clear();
          bridge().controller({ type: "connected", connected: false });
        }
        return;
      }
      if (!connected.current) connected.current = true;
      // The swap reaches the shell as a new connection: same window, same tabs, new glyphs.
      if (family.current !== controllerFamily(pad.id)) {
        family.current = controllerFamily(pad.id);
        bridge().controller({ type: "connected", connected: true, family: family.current });
      }

      // The pad is what is driving: its focus moves must be drawn (tokens.css), whatever the mouse did before.
      if (pad.buttons.some((b) => b.pressed) || pad.axes.some((axis) => Math.abs(axis) > STICK_DEADZONE)) {
        document.documentElement.dataset.input = "pad";
      }
      const s = stateRef.current;
      const openOverlay = overlayRef.current;
      const overlayOpen = openOverlay !== "none" || Boolean(s.keyboard) || Boolean(s.permission);
      // The keyboard's shortcuts, as on Xbox: each presses the key that shows its glyph. While it is open these buttons
      // type; they never reload the page or switch tabs in the middle of a word.
      if (s.keyboard && openOverlay === "none" && !s.permission) {
        for (const [button, key] of KEYBOARD_SHORTCUTS) {
          if (!justPressed(button)) continue;
          document.querySelector<HTMLElement>(`#keyboard [data-pad="${key}"]`)?.click();
          vibrate("confirm");
          return;
        }
      }
      if (justPressed(Button.Start)) {
        setOverlay(openOverlay === "menu" ? "none" : "menu");
        return;
      }
      if (justPressed(Button.Back)) {
        setOverlay("none");
        cmd({ type: "close-tab" });
        return;
      }
      const chrome = !overlayOpen && inChrome();
      if (justPressed(Button.B)) {
        if (openOverlay !== "none") setOverlay("none");
        else if (s.permission) cmd({ type: "permission", allow: false, remember: false });
        else if (s.keyboard) cmd({ type: "keyboard-close" });
        else if (chrome) leaveChrome();
        else cmd({ type: "back" });
        return;
      }
      if (justPressed(Button.A)) {
        if (pointing.current) clickAtPointer();
        else if (openOverlay !== "none" || s.permission || s.keyboard) (document.activeElement as HTMLElement | null)?.click();
        else if (chrome) activateChrome();
        else if (pointing.current || (s.inputMode === "Cursor" && !focusDriven.current)) clickAtPointer();
        else bridge().controller({ type: "activate" });
        vibrate("confirm");
        return;
      }
      // The browser's own buttons belong to the page and the bar, not to an open keyboard, menu or prompt.
      if (!overlayOpen) {
        if (justPressed(Button.X)) cmd({ type: "reload" });
        if (justPressed(Button.Y)) {
          if (down(Button.LB)) cmd({ type: "toggle-favorite" });
          else cmd({ type: "keyboard-open", target: "address" });
        }
        if (justPressed(Button.LB)) cmd({ type: "back" });
        if (justPressed(Button.RB)) cmd({ type: "forward" });
        if (justPressed(Button.LT)) cmd({ type: "switch-tab", offset: -1 });
        if (justPressed(Button.RT)) cmd({ type: "switch-tab", offset: 1 });
        if (justPressed(Button.RightStick)) cmd({ type: "cycle-input-mode" });
      }

      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      const dpad = { up: down(Button.DpadUp), down: down(Button.DpadDown), left: down(Button.DpadLeft), right: down(Button.DpadRight) };
      // The pointer moves on every poll, so it glides at the screen's rate instead of jumping 20 times a second; the step
      // is scaled by the time since the last one, so the speed (set per STICK_INTERVAL_MS) does not depend on the rate.
      const sinceMove = Math.min(now - lastPointerMove.current, STICK_INTERVAL_MS) / STICK_INTERVAL_MS;
      lastPointerMove.current = now;
      // The stick is always the pointer, on every site; Arrows mode only turns the D-pad into arrow keys.
      const velocity = stickToVelocity(lx, ly);
      if (velocity.dx !== 0 || velocity.dy !== 0) {
        pointing.current = true;
        focusDriven.current = false;
        bridge().controller({ type: "cursor-move", dx: velocity.dx * sinceMove, dy: velocity.dy * sinceMove });
      }
      // The wheel keeps the slower cadence and follows the same pointer across the shell and page.
      if (now - lastStick.current >= STICK_INTERVAL_MS) {
        lastStick.current = now;
        const notches = stickToScroll(ry);
        const sideways = stickToScroll(rx);
        if (notches !== 0 || sideways !== 0) bridge().controller({ type: "scroll", notches, sideways });
      }

      const direction: Direction | undefined = directionOf(dpad, 0, 0);
      if (direction && now - lastDirection.current >= 180) {
        lastDirection.current = now;
        pointing.current = false;
        focusDriven.current = true;
        if (moveSuggestionFocus(direction)) syncShellPointer();
        else if (openOverlay !== "none" || s.permission || s.keyboard) { moveOverlayFocus(direction); syncShellPointer(); }
        // Down with nothing under the toolbar goes back into the page.
        else if (chrome) { if (!moveFocusAmong(chromeControls(), direction) && direction === "down") leaveChrome(); else syncShellPointer(); }
        else {
          bridge().controller({ type: "direction", direction });
        }
      }
    }
    /** A at the pointer: the second press within DOUBLE_PRESS_MS turns the pending left click into a right click. */
    function clickAtPointer(): void {
      if (pendingClick.current !== undefined) {
        clearTimeout(pendingClick.current);
        pendingClick.current = undefined;
        bridge().controller({ type: "cursor-click", button: "right" });
        return;
      }
      pendingClick.current = window.setTimeout(() => {
        pendingClick.current = undefined;
        bridge().controller({ type: "cursor-click", button: "left" });
      }, DOUBLE_PRESS_MS);
    }
    // Up from the top of the page: the main process hands the focus over and the address field takes it.
    bridge().onFocusChrome(() => document.getElementById("address")?.focus());
    // A click or a key on a real keyboard hands focus drawing back to the browser's own rules.
    const notPad = (): void => { delete document.documentElement.dataset.input; };
    const syncShellPointer = (): void => {
      if (!focusDriven.current) return;
      const target = document.activeElement as HTMLElement | null;
      if (!target || !target.closest("#chrome, .overlay")) return;
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      bridge().controller({ type: "cursor-focus", x, y });
    };
    addEventListener("focusin", syncShellPointer, true);
    addEventListener("resize", syncShellPointer);
    bridge().onFocusChrome(syncShellPointer);
    addEventListener("pointerdown", notPad, true);
    addEventListener("keydown", notPad, true);
    resume();
    const visibility = (): void => {
      if (!document.hidden) resume();
    };
    document.addEventListener("visibilitychange", visibility);
    const stopActivity = bridge().onActivity(({ active }) => {
      windowActive.current = active;
      if (active) resume();
    });
    return () => {
      stop();
      removeEventListener("pointerdown", notPad, true);
      removeEventListener("keydown", notPad, true);
      removeEventListener("focusin", syncShellPointer, true);
      removeEventListener("resize", syncShellPointer);
      document.removeEventListener("visibilitychange", visibility);
      stopActivity();
    };
  }, [setOverlay]);
}

/**
 * The D-pad inside the address suggestions: down from the address field enters the list, up from the on-screen keys
 * enters it too because the list sits above them, left and right walk it, and anything else falls through to the
 * overlay walker. Down on the keys belongs to the keyboard: jacking every down press into the chips left the bottom key
 * rows unreachable as soon as a suggestion appeared. Returns whether the list took the press.
 */
function moveSuggestionFocus(direction: Direction): boolean {
  const chips = [...document.querySelectorAll<HTMLElement>(".suggestions .chip")];
  if (chips.length === 0) return false;
  const current = document.activeElement as HTMLElement | null;
  const index = current ? chips.indexOf(current) : -1;
  if (index < 0) {
    if (current?.closest("#keyboard")) {
      // Up from the top key row means the list above it; from any lower row the D-pad is still walking the keys.
      const rowAbove = current.classList.contains("key")
        && [...document.querySelectorAll<HTMLElement>("#keyboard .key")]
          .some((key) => key !== current && key.getBoundingClientRect().bottom <= current.getBoundingClientRect().top + 1);
      if (rowAbove || direction !== "up") return false;
    } else if (direction !== "down") return false;
    chips[0].focus();
    return true;
  }
  if (direction !== "left" && direction !== "right") return false;
  const next = direction === "left" ? index - 1 : index + 1;
  if (next < 0 || next >= chips.length) return false;
  chips[next].focus();
  return true;
}

/**
 * The D-pad is on the tabs or the toolbar: one of their controls has the focus and the shell's document has the
 * window's. A click into the page leaves the shell's focused element in place, which is why the window focus counts too.
 */
function inChrome(): boolean {
  return document.hasFocus() && Boolean((document.activeElement as HTMLElement | null)?.closest("#chrome"));
}

/** What the D-pad walks on the tabs and the toolbar. Minimize, maximize and close stay off it: one A would close the app. */
function chromeControls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("#chrome button:not([disabled]), #chrome input")]
    .filter((el) => !el.closest("[inert], .window-controls") && el.getClientRects().length > 0);
}

/** A on the toolbar: the address field opens the controller keyboard, anything else is pressed. */
function activateChrome(): void {
  const el = document.activeElement as HTMLElement | null;
  if (el?.id === "address") cmd({ type: "keyboard-open", target: "address" });
  else el?.click();
}

function leaveChrome(): void {
  (document.activeElement as HTMLElement | null)?.blur();
  cmd({ type: "focus-page" });
}

/** Spatial focus among the shell's own buttons, used while a dialog or the keyboard is open. */
function moveOverlayFocus(direction: Direction): void {
  const group = (document.querySelector('.overlay[role="dialog"], .overlay [role="menu"]') as HTMLElement | null) ?? document.body;
  const buttons = [...group.querySelectorAll<HTMLElement>("button:not([disabled])")];
  const current = document.activeElement as HTMLElement | null;
  // Nothing focused inside yet (a dialog opens with the focus on itself): the first press lands on the keyboard's "q",
  // as on Xbox, or on the first button of any other dialog.
  if (!current || !buttons.includes(current)) { (group.querySelector<HTMLElement>(".key[data-start]") ?? buttons[0])?.focus(); return; }
  moveFocusAmong(buttons, direction);
}

/** Moves the focus to the nearest control in `direction`; false when there is none, so the caller decides what that means. */
function moveFocusAmong(controls: HTMLElement[], direction: Direction): boolean {
  const current = document.activeElement as HTMLElement | null;
  if (!current || !controls.includes(current)) {
    if (!controls[0]) return false;
    controls[0].focus();
    return true;
  }
  // Measured edge to edge, like the page's spatial.js: a wide control (the address field) has its centre far from its
  // neighbours, and centre distances sent the D-pad to the tab strip instead of the reload button beside it.
  const from = current.getBoundingClientRect();
  const fc = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const control of controls) {
    if (control === current) continue;
    const r = control.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const vertical = direction === "up" || direction === "down";
    // Ahead means its centre is ahead, so a control inside the current one (the close button on a tab card) is reachable;
    // the distance is edge to edge, and overlapping the current control along the way counts as distance too.
    const centreAhead = direction === "up" ? fc.y - c.y : direction === "down" ? c.y - fc.y : direction === "left" ? fc.x - c.x : c.x - fc.x;
    if (centreAhead <= 4) continue;
    const ahead = Math.abs(direction === "up" ? from.top - r.bottom : direction === "down" ? r.top - from.bottom
      : direction === "left" ? from.left - r.right : r.left - from.right);
    const off = vertical ? Math.abs(c.x - fc.x) : Math.abs(c.y - fc.y);
    const overlap = vertical
      ? Math.min(r.right, from.right) - Math.max(r.left, from.left)
      : Math.min(r.bottom, from.bottom) - Math.max(r.top, from.top);
    // Sharing the row or the column is what counts; the centres only break a tie between neighbours that both do.
    const score = ahead + off * (overlap > 0 ? 0.1 : 2.2);
    if (score < bestScore) { best = control; bestScore = score; }
  }
  best?.focus();
  return best !== undefined;
}
