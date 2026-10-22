import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

const TEXT =
  "Navegar na TV sempre foi um castigo. Teclado na tela que pula letra, cursor que se arrasta, site que pede mouse. " +
  "O JoyChromium foi desenhado ao contrário: primeiro o controle, depois o resto.";
const STRONG = new Set(["castigo.", "controle,", "resto."]);

/** One paragraph that lights up word by word as it crosses the screen. */
export function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = TEXT.split(" ");
  return (
    <section className="manifesto" aria-label="Por que o JoyChromium existe">
      <p ref={ref} aria-label={TEXT}>
        {words.map((w, i) => (
          <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} strong={STRONG.has(w)}>{w}</Word>
        ))}
      </p>
    </section>
  );
}

function Word({ children, progress, range, strong }: { children: string; progress: MotionValue<number>; range: [number, number]; strong: boolean }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span aria-hidden="true" className={strong ? "strong" : undefined} style={{ opacity }}>
      {children}{" "}
    </motion.span>
  );
}
