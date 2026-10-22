import { motion } from "motion/react";
import { useRef } from "react";
import { useSceneClock } from "../hooks/useSceneClock";
import { BrowserMock } from "./BrowserMock";
import { GitHubIcon } from "./Icons";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", bounce: 0, duration: 0.9, delay },
}) as const;

/** Centered statement, two actions, then the app itself framed over a Whistler nocturne. */
export function Hero({ padConnected }: { padConnected: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const t = useSceneClock(frame, 0, 12.6, 1.6);
  return (
    <section className="hero" id="topo">
      <motion.h1 {...rise(0.05)}>
        A internet inteira, <span className="accent">do sofá.</span>
      </motion.h1>
      <motion.p className="hero-sub" {...rise(0.15)}>
        Um navegador para a TV que você usa só com o controle.{" "}<br />
        Cursor no analógico, foco no D-pad, teclado de console.
      </motion.p>
      <motion.div className="hero-actions" {...rise(0.25)}>
        <a className="btn btn-dark" href="#beta">Entrar no beta <span aria-hidden="true">→</span></a>
        <a className="btn btn-soft" href="https://github.com/lippdev/joychromium" target="_blank" rel="noreferrer"><GitHubIcon /> Ver no GitHub</a>
      </motion.div>
      <motion.p className="hero-note" {...rise(0.35)}>
        {padConnected
          ? <><span className="pad-live" aria-hidden="true" /> Controle conectado: use o D-pad e o A para navegar por esta página.</>
          : "Windows 10 e 11 · grátis · com um controle conectado, esta página também responde a ele."}
      </motion.p>

      <motion.div
        className="frame frame-hero"
        ref={frame}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 1.2, delay: 0.4 }}
        style={{ backgroundImage: "url(/img/nocturne-chelsea.jpg)" }}
      >
        <div className="frame-window"><BrowserMock t={t} /></div>
        <span className="frame-credit">James McNeill Whistler, <i>Nocturne: Blue and Silver – Chelsea</i>, 1871</span>
      </motion.div>
    </section>
  );
}
