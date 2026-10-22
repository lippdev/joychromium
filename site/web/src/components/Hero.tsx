import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { SignupForm } from "./SignupForm";

const spring = { type: "spring", bounce: 0, duration: 1.1 } as const;
const line = (i: number) => ({
  initial: { y: "110%", opacity: 0 },
  animate: { y: "0%", opacity: 1 },
  transition: { ...spring, delay: 0.15 + i * 0.09 },
});

export function Hero({ padConnected }: { padConnected: boolean }) {
  // The room light follows the pointer, softly, like the glow of a screen on a wall.
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.3);
  const sx = useSpring(mx, { bounce: 0, duration: 1.2 });
  const sy = useSpring(my, { bounce: 0, duration: 1.2 });
  const light = useTransform([sx, sy], ([x, y]: number[]) => `radial-gradient(60vmax 40vmax at ${x * 100}% ${y * 100}%, var(--glow-1), transparent 62%)`);
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };

  return (
    <section className="hero" onPointerMove={onMove} id="topo">
      <motion.div className="hero-light" style={{ background: light }} aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />

      <motion.p className="hero-badge" initial={{ opacity: 0, y: 12, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ ...spring, delay: 0.05 }}>
        <span className="pulse-dot" aria-hidden="true" /> Beta fechado · Windows 10 e 11
      </motion.p>

      <h1 className="hero-title">
        <span className="mask"><motion.span {...line(0)}>A internet inteira,</motion.span></span>
        <span className="mask"><motion.span className="accent" {...line(1)}>do sofá.</motion.span></span>
      </h1>

      <motion.p className="hero-lede" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.45 }}>
        Um navegador desenhado do zero para o controle. Cursor no analógico, foco no D-pad, teclado de console. Sem mouse,
        sem teclado, sem levantar.
      </motion.p>

      <motion.div className="hero-form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.58 }}>
        <SignupForm id="hero" />
      </motion.div>

      <motion.a
        className="hero-github"
        href="https://github.com/lippdev/joychromium"
        target="_blank"
        rel="noreferrer"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.7 }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
        Ver o projeto no GitHub
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </motion.a>

      <motion.p className="hero-try" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.1 }}>
        {padConnected ? (
          <><span className="pad-live" aria-hidden="true" /> Controle conectado. Use o D-pad e o <kbd className="b-a">A</kbd> para navegar por esta página.</>
        ) : (
          <>Tem um controle aí? Conecte e aperte qualquer botão: esta página também é navegável pelo gamepad.</>
        )}
      </motion.p>

      <motion.a href="#como" className="hero-scroll" aria-label="Ver como funciona" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.4 }}>
        <span />
      </motion.a>
    </section>
  );
}
