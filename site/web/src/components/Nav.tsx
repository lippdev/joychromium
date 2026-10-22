import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";

const LINKS = [
  { id: "como", label: "Como funciona" },
  { id: "controle", label: "Controle" },
  { id: "promessas", label: "Por que" },
  { id: "faq", label: "Perguntas" },
];
const spring = { type: "spring", bounce: 0, duration: 0.5 } as const;

/**
 * At the top the header is open and transparent, part of the hero. Once the page moves it gathers into a glass capsule;
 * a highlight slides to the section on screen (or the link under the pointer) and a hairline shows how far you've read.
 */
export function Nav({ padConnected }: { padConnected: boolean }) {
  const { scrollY, scrollYProgress } = useScroll();
  const [docked, setDocked] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const progress = useSpring(scrollYProgress, { bounce: 0, duration: 0.4 });
  useMotionValueEvent(scrollY, "change", (y) => setDocked(y > 24));

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => Boolean(el));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
    const top = () => { if (window.scrollY < innerHeight * 0.5) setActive(null); };
    addEventListener("scroll", top, { passive: true });
    return () => { io.disconnect(); removeEventListener("scroll", top); };
  }, []);

  const lit = hovered ?? active;
  return (
    <motion.header
      className="nav"
      data-docked={docked}
      initial={{ opacity: 0, y: -20, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", bounce: 0, duration: 1 }}
    >
      <motion.div className="nav-shell" layout transition={spring}>
        <a className="nav-brand" href="#topo" aria-label="JoyChromium, início">
          <span className="nav-mark"><img src="/img/mark.png" alt="" width={24} height={24} /></span>
          <span className="nav-word">Joy<b>Chromium</b></span>
          <span className="nav-tag">Beta</span>
        </a>

        <nav className="nav-links" aria-label="Seções" onPointerLeave={() => setHovered(null)}>
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              aria-current={active === l.id ? "true" : undefined}
              className={lit === l.id ? "is-lit" : ""}
              onPointerEnter={() => setHovered(l.id)}
              onFocus={() => setHovered(l.id)}
              onBlur={() => setHovered(null)}
            >
              {lit === l.id && <motion.span className="nav-highlight" layoutId="nav-highlight" transition={spring} />}
              <span className="nav-label">{l.label}</span>
            </a>
          ))}
        </nav>

        <div className="nav-end">
          {padConnected && (
            <span className="nav-pad" title="Controle conectado: use o D-pad e o A">
              <span className="pad-live" aria-hidden="true" /><span className="nav-pad-text">Controle</span>
            </span>
          )}
          <a className="nav-cta" href="#beta">
            Entrar no beta
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>

        <motion.span className="nav-progress" style={{ scaleX: progress }} aria-hidden="true" />
      </motion.div>
    </motion.header>
  );
}
