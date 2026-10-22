import { useSyncExternalStore } from "react";
import type Lenis from "lenis";

/**
 * The site answers a gamepad the way JoyChromium does: the left stick drives a pointer, the D-pad walks the links and
 * buttons (and the pointer follows), A clicks, B lets go, the right stick scrolls. Standard-mapping indices.
 */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, LS: 10, RS: 11, Up: 12, Down: 13, Left: 14, Right: 15 } as const;
const DEADZONE = 0.18;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not(.hp), summary, [tabindex]:not([tabindex="-1"])';

type PadState = { connected: boolean; pressed: ReadonlySet<number>; lx: number; ly: number; rx: number; ry: number };
let state: PadState = { connected: false, pressed: new Set(), lx: 0, ly: 0, rx: 0, ry: 0 };
const listeners = new Set<() => void>();
const emit = (next: PadState) => { state = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const usePad = () => useSyncExternalStore(subscribe, () => state, () => state);
/** Only re-renders when a pad comes or goes, not on every stick movement. */
export const usePadConnected = () => useSyncExternalStore(subscribe, () => state.connected, () => false);

type Rect = { left: number; top: number; width: number; height: number };
const centerOf = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The candidate whose centre lies furthest along `dir` and least off its axis, as in the app's spatial navigation. */
function nextFocus(from: Element | null, dir: "up" | "down" | "left" | "right"): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden='true']");
  });
  if (!from || !all.includes(from as HTMLElement)) {
    return all.find((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }) ?? all[0] ?? null;
  }
  const a = centerOf(from.getBoundingClientRect());
  let best: HTMLElement | null = null;
  let score = Infinity;
  for (const el of all) {
    if (el === from) continue;
    const b = centerOf(el.getBoundingClientRect());
    const dx = b.x - a.x, dy = b.y - a.y;
    const ahead = dir === "down" ? dy : dir === "up" ? -dy : dir === "right" ? dx : -dx;
    const off = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    if (ahead <= 4) continue;
    const s = ahead + off * 2.2;
    if (s < score) { score = s; best = el; }
  }
  return best;
}

export function startPad(lenis: Lenis | null, pointer: HTMLElement, setShape: (hand: boolean) => void) {
  let frame = 0;
  let last = performance.now();
  let lastDir = 0;
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  let pointing = false;
  let previous = new Set<number>();
  let shown = false;

  const show = (visible: boolean) => {
    if (visible === shown) return;
    shown = visible;
    pointer.style.opacity = visible ? "1" : "0";
    document.documentElement.classList.toggle("pad-mode", visible);
  };
  const place = () => {
    pointer.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    const el = document.elementFromPoint(pos.x, pos.y);
    setShape(Boolean(el?.closest(FOCUSABLE)) || (el ? getComputedStyle(el).cursor === "pointer" : false));
  };
  const glideTo = (el: HTMLElement) => {
    const c = centerOf(el.getBoundingClientRect());
    pos.x = c.x; pos.y = c.y;
    pointer.classList.add("glide");
    place();
    setTimeout(() => pointer.classList.remove("glide"), 260);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(now - last, 50) / 16.7;
    last = now;
    const pad = [...navigator.getGamepads()].find((p): p is Gamepad => Boolean(p && p.connected));
    if (!pad) {
      if (state.connected) { emit({ ...state, connected: false, pressed: new Set() }); show(false); }
      return;
    }
    const pressed = new Set<number>();
    pad.buttons.forEach((b, i) => { if (b.pressed) pressed.add(i); });
    const axis = (i: number) => { const v = pad.axes[i] ?? 0; return Math.abs(v) < DEADZONE ? 0 : v; };
    const [lx, ly, rx, ry] = [axis(0), axis(1), axis(2), axis(3)];
    const just = (b: number) => pressed.has(b) && !previous.has(b);
    const changed = !state.connected || pressed.size !== state.pressed.size || [...pressed].some((b) => !state.pressed.has(b))
      || lx !== state.lx || ly !== state.ly || rx !== state.rx || ry !== state.ry;
    if (changed) emit({ connected: true, pressed, lx, ly, rx, ry });
    if (pressed.size || lx || ly || rx || ry) show(true);

    // Left stick: the pointer, with the same acceleration curve feel as the app (faster the further you push).
    if (lx || ly) {
      pointing = true;
      const speed = 14 * dt;
      pos.x = Math.min(innerWidth - 2, Math.max(0, pos.x + Math.sign(lx) * lx * lx * speed * 1.6));
      pos.y = Math.min(innerHeight - 2, Math.max(0, pos.y + Math.sign(ly) * ly * ly * speed * 1.6));
      place();
    }
    // Right stick: the wheel.
    if (ry || rx) {
      const dy = Math.sign(ry) * ry * ry * 28 * dt;
      if (lenis) lenis.scrollTo(lenis.scroll + dy, { immediate: true }); else scrollBy(0, dy);
      if (pointing) place();
    }
    // D-pad: walk the focus; the pointer goes with it.
    const dir = pressed.has(BTN.Up) ? "up" : pressed.has(BTN.Down) ? "down" : pressed.has(BTN.Left) ? "left" : pressed.has(BTN.Right) ? "right" : null;
    if (dir && (now - lastDir > 190 || [BTN.Up, BTN.Down, BTN.Left, BTN.Right].some(just))) {
      lastDir = now;
      pointing = false;
      const next = nextFocus(document.activeElement, dir);
      if (next) {
        next.focus({ preventScroll: true });
        const r = next.getBoundingClientRect();
        if (r.top < 90 || r.bottom > innerHeight - 40) {
          const target = scrollY + r.top - innerHeight / 2 + r.height / 2;
          if (lenis) lenis.scrollTo(target, { duration: 0.6, onComplete: () => glideTo(next) }); else { scrollTo({ top: target }); glideTo(next); }
        } else glideTo(next);
      } else if (dir === "down" || dir === "up") {
        const dy = (dir === "down" ? 1 : -1) * innerHeight * 0.6;
        if (lenis) lenis.scrollTo(lenis.scroll + dy, { duration: 0.6 }); else scrollBy({ top: dy, behavior: "smooth" });
      }
    }
    if (just(BTN.A)) {
      pointer.classList.add("press");
      setTimeout(() => pointer.classList.remove("press"), 140);
      const target = pointing ? (document.elementFromPoint(pos.x, pos.y) as HTMLElement | null) : (document.activeElement as HTMLElement | null);
      const hit = target?.closest<HTMLElement>(FOCUSABLE) ?? target;
      if (hit) {
        if (hit.matches("input")) hit.focus(); else hit.click();
      }
    }
    if (just(BTN.B)) (document.activeElement as HTMLElement | null)?.blur();
    previous = pressed;
  };

  const onConnect = () => { if (!frame) frame = requestAnimationFrame(tick); };
  addEventListener("gamepadconnected", onConnect);
  // Some browsers only report a pad after its first press, which is itself a poll; keep polling lightly until then.
  frame = requestAnimationFrame(tick);
  const onMouse = () => show(false);
  addEventListener("mousemove", onMouse);
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("gamepadconnected", onConnect);
    removeEventListener("mousemove", onMouse);
  };
}
