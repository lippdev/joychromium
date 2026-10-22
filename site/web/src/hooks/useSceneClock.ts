import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Plays the app scene between `from` and `to` seconds and loops, only while `ref` is on screen. Reduced motion holds a
 * single, representative frame instead.
 */
export function useSceneClock(ref: RefObject<HTMLElement | null>, from: number, to: number, hold = 1.2): number {
  const [t, setT] = useState(from + (to - from) * 0.6);
  const start = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setT(from + (to - from) * 0.6); return; }
    let frame = 0;
    let visible = false;
    start.current = performance.now();
    const tick = (now: number) => {
      const span = to - from + hold;
      const elapsed = ((now - start.current) / 1000) % span;
      setT(Math.min(to, from + elapsed));
      frame = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) { start.current = performance.now(); frame = requestAnimationFrame(tick); }
    });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [ref, from, to, hold]);
  return t;
}
