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
