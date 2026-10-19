import { useEffect, useRef } from "preact/hooks";
import { controllerFamily, buttonGlyphs } from "../../shared/controllerGlyphs";
import { directionOf, stickToScroll, stickToVelocity, type Direction } from "../../shared/controllerInput";
import type { ShellState } from "../../shared/ipc";
import { bridge, cmd } from "./bridge";

const Button = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, RightStick: 10,
  DpadUp: 12, DpadDown: 13, DpadLeft: 14, DpadRight: 15,
} as const;

type Overlay = "none" | "tabs" | "menu";

/**
 * Gamepad handling for the shell. The tab of a web page owns the focus while the user reads it, so the shell keeps
 * polling with requestAnimationFrame and only acts when it is visible; a page that needs the D-pad in Arrows mode gets
 * it through the main process.
 */
export function useGamepad(state: ShellState, overlay: Overlay, setOverlay: (o: Overlay) => void): void {
  const pressed = useRef(new Set<number>());
  const connected = useRef(false);
  const lastDirection = useRef(0);
  const lastTick = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - lastTick.current < 50) return;
      lastTick.current = now;
      const pads = navigator.getGamepads();
      const pad = pads.find((p) => p && p.mapping === "standard") ?? pads.find((p) => p) ?? null;
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
          pressed.current.clear();
          bridge().controller({ type: "connected", connected: false });
        }
        return;
      }
      if (!connected.current) {
        connected.current = true;
        bridge().controller({ type: "connected", connected: true, family: controllerFamily(pad.id) });
      }
      const glyphs = buttonGlyphs(controllerFamily(pad.id));

      const s = stateRef.current;
      const overlayOpen = overlay !== "none" || Boolean(s.keyboard) || Boolean(s.permission);
      if (justPressed(Button.Start)) {
        setOverlay(overlay === "menu" ? "none" : "menu");
        return;
      }
      if (justPressed(Button.Back)) {
        setOverlay("none");
        cmd({ type: "close-tab" });
        return;
      }
      if (justPressed(Button.B)) {
        if (overlay !== "none") setOverlay("none");
        else if (s.permission) cmd({ type: "permission", allow: false, remember: false });
        else if (s.keyboard) cmd({ type: "keyboard-close" });
        else cmd({ type: "back" });
        return;
      }
      if (justPressed(Button.A)) {
        if (overlay !== "none" || s.permission || s.keyboard) (document.activeElement as HTMLElement | null)?.click();
        else bridge().controller({ type: "activate" });
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

      if (cursorMode) {
        const velocity = stickToVelocity(lx, ly);
        if (velocity.dx !== 0 || velocity.dy !== 0) bridge().controller({ type: "cursor-move", dx: velocity.dx, dy: velocity.dy });
        const notches = stickToScroll(ry);
        if (notches !== 0) bridge().controller({ type: "scroll", notches });
      }

      const direction: Direction | undefined = cursorMode ? directionOf(dpad, 0, 0) : directionOf(dpad, lx, ly);
      if (direction && now - lastDirection.current >= 180) {
        lastDirection.current = now;
        if (overlay !== "none" || s.permission || s.keyboard) moveOverlayFocus(direction);
        else bridge().controller({ type: "direction", direction });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [overlay, setOverlay]);
}

/** Spatial focus among the shell's own buttons, used while a dialog or the keyboard is open. */
function moveOverlayFocus(direction: Direction): void {
  const group = (document.querySelector('.overlay[aria-modal="true"]') as HTMLElement | null) ?? document.body;
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
