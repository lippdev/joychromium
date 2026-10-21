import { useEffect, useRef } from "preact/hooks";
import { controllerFamily, type ControllerFamily } from "../../shared/controllerGlyphs";
import { Button, directionOf, stickToScroll, stickToVelocity, type Direction } from "../../shared/controllerInput";
import { activePad, padsInUse, startedUsing, type PadSample } from "../../shared/controllerSelection";
import { GAMEPAD_POLL_MS, gamepadPoll, STICK_INTERVAL_MS } from "../../shared/gamepadLoop";
import type { ShellState } from "../../shared/ipc";
import { bridge, cmd } from "./bridge";
import { trackActivePad, vibrate } from "./haptics";


type Overlay = "none" | "tabs" | "menu";

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
  const lastTick = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Read through a ref so the loop below is created once and keeps a single activity subscription for its lifetime.
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

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

      const s = stateRef.current;
      const openOverlay = overlayRef.current;
      const overlayOpen = openOverlay !== "none" || Boolean(s.keyboard) || Boolean(s.permission);
      if (justPressed(Button.Start)) {
        setOverlay(openOverlay === "menu" ? "none" : "menu");
        return;
      }
      if (justPressed(Button.Back)) {
        setOverlay("none");
        cmd({ type: "close-tab" });
        return;
      }
      if (justPressed(Button.B)) {
        if (openOverlay !== "none") setOverlay("none");
        else if (s.permission) cmd({ type: "permission", allow: false, remember: false });
        else if (s.keyboard) cmd({ type: "keyboard-close" });
        else cmd({ type: "back" });
        return;
      }
      if (justPressed(Button.A)) {
        if (openOverlay !== "none" || s.permission || s.keyboard) (document.activeElement as HTMLElement | null)?.click();
        else bridge().controller({ type: "activate" });
        vibrate("confirm");
        return;
      }
      if (justPressed(Button.X)) cmd({ type: "reload" });
      if (justPressed(Button.Y)) {
        if (down(Button.LB)) cmd({ type: "toggle-favorite" });
        else cmd({ type: "keyboard-open", target: "address" });
      }
      if (justPressed(Button.LB) && !overlayOpen) cmd({ type: "back" });
      if (justPressed(Button.RB)) cmd({ type: "forward" });
      if (justPressed(Button.LT)) cmd({ type: "switch-tab", offset: -1 });
      if (justPressed(Button.RT)) cmd({ type: "switch-tab", offset: 1 });
      if (justPressed(Button.RightStick)) cmd({ type: "cycle-input-mode" });

      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      const ry = pad.axes[3] ?? 0;
      const dpad = { up: down(Button.DpadUp), down: down(Button.DpadDown), left: down(Button.DpadLeft), right: down(Button.DpadRight) };
      const cursorMode = s.inputMode === "Cursor" && !overlayOpen;

      // Buttons follow the poll rate; the stick keeps its own, slower cadence so the cursor moves at the same speed.
      if (cursorMode && now - lastStick.current >= STICK_INTERVAL_MS) {
        lastStick.current = now;
        const velocity = stickToVelocity(lx, ly);
        if (velocity.dx !== 0 || velocity.dy !== 0) bridge().controller({ type: "cursor-move", dx: velocity.dx, dy: velocity.dy });
        const notches = stickToScroll(ry);
        if (notches !== 0) bridge().controller({ type: "scroll", notches });
      }

      const direction: Direction | undefined = cursorMode ? directionOf(dpad, 0, 0) : directionOf(dpad, lx, ly);
      if (direction && now - lastDirection.current >= 180) {
        lastDirection.current = now;
        if (moveSuggestionFocus(direction)) { /* the D-pad walked the address suggestions */ }
        else if (openOverlay !== "none" || s.permission || s.keyboard) moveOverlayFocus(direction);
        else bridge().controller({ type: "direction", direction });
      }
    }
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

/** Spatial focus among the shell's own buttons, used while a dialog or the keyboard is open. */
function moveOverlayFocus(direction: Direction): void {
  const group = (document.querySelector('.overlay[role="dialog"]') as HTMLElement | null) ?? document.body;
  const buttons = [...group.querySelectorAll<HTMLElement>("button:not([disabled])")];
  const current = document.activeElement as HTMLElement | null;
  const index = current ? buttons.indexOf(current) : -1;
  if (index < 0) { buttons[0]?.focus(); return; }
  const rect = current!.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const button of buttons) {
    if (button === current) continue;
    const r = button.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const ahead = direction === "up" ? -dy : direction === "down" ? dy : direction === "left" ? -dx : dx;
    if (ahead <= 4) continue;
    const off = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
    const score = ahead + off * 2;
    if (score < bestScore) { best = button; bestScore = score; }
  }
  best?.focus();
}
