import Lenis from "lenis";
import { useEffect, useRef, useState } from "react";
import { Cinema } from "./components/Cinema";
import { Closing } from "./components/Closing";
import { Hero } from "./components/Hero";
import { Nav } from "./components/Nav";
import { PadLab } from "./components/PadLab";
import { Pillars } from "./components/Pillars";
import { Arrow, Hand } from "./components/Pointer";
import { startPad, usePadConnected } from "./hooks/pad";

export function App() {
  const padConnected = usePadConnected();
  const pointer = useRef<HTMLDivElement>(null);
  const [hand, setHand] = useState(false);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduced ? null : new Lenis({ duration: 1.15, anchors: { offset: -80 } });
    let frame = 0;
    const raf = (time: number) => { lenis?.raf(time); frame = requestAnimationFrame(raf); };
    if (lenis) frame = requestAnimationFrame(raf);
    const stopPad = pointer.current ? startPad(lenis, pointer.current, setHand) : () => {};
    return () => { cancelAnimationFrame(frame); lenis?.destroy(); stopPad(); };
  }, []);

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav padConnected={padConnected} />
      <main>
        <Hero padConnected={padConnected} />
        <Cinema />
        <PadLab />
        <Pillars />
        <Closing />
      </main>
      <div className={`pad-pointer ${hand ? "hand" : ""}`} ref={pointer} aria-hidden="true">{hand ? <Hand /> : <Arrow />}</div>
    </>
  );
}
