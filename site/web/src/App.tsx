import Lenis from "lenis";
import { useEffect, useRef, useState } from "react";
import { Closing } from "./components/Closing";
import { Features } from "./components/Features";
import { Hero } from "./components/Hero";
import { Nav } from "./components/Nav";
import { PadLab } from "./components/PadLab";
import { Arrow, Hand } from "./components/Pointer";
import { Values } from "./components/Values";
import { startPad, usePadConnected } from "./hooks/pad";

export function App() {
  const padConnected = usePadConnected();
  const pointer = useRef<HTMLDivElement>(null);
  const [hand, setHand] = useState(false);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduced ? null : new Lenis({ duration: 1.1, anchors: { offset: -72 } });
    let frame = 0;
    const raf = (time: number) => { lenis?.raf(time); frame = requestAnimationFrame(raf); };
    if (lenis) frame = requestAnimationFrame(raf);
    const stopPad = pointer.current ? startPad(lenis, pointer.current, setHand) : () => {};
    return () => { cancelAnimationFrame(frame); lenis?.destroy(); stopPad(); };
  }, []);

  return (
    <>
      <Nav padConnected={padConnected} />
      <main>
        <Hero padConnected={padConnected} />
        <Features />
        <PadLab />
        <Values />
        <Closing />
      </main>
      <div className={`pad-pointer ${hand ? "hand" : ""}`} ref={pointer} aria-hidden="true">{hand ? <Hand /> : <Arrow />}</div>
    </>
  );
}
