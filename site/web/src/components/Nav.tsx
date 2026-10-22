import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";

/** A floating glass pill; it tightens once the page starts moving under it. */
export function Nav({ padConnected }: { padConnected: boolean }) {
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setCompact(y > 40));
  return (
    <motion.header
      className={`nav ${compact ? "compact" : ""}`}
      initial={{ opacity: 0, y: -16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", bounce: 0, duration: 0.9 }}
    >
      <a className="nav-brand" href="#topo" aria-label="JoyChromium, início">
        <img src="/img/mark.png" alt="" width={26} height={26} /><span>Joy<b>Chromium</b></span>
      </a>
      <nav aria-label="Seções">
        <a href="#como">Como funciona</a>
        <a href="#controle">Controle</a>
        <a href="#promessas">Por que</a>
      </nav>
      {padConnected && <span className="nav-pad" title="Controle conectado: use o D-pad"><span className="pad-live" aria-hidden="true" />Controle</span>}
      <a className="nav-cta" href="#beta">Entrar no beta</a>
    </motion.header>
  );
}
