import { useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/**
 * A plain browser-vendor header (Helium, Brave, Vivaldi): mark and name, text links beside them, one solid action on the
 * right. It stays put; once the page scrolls under it, it takes a translucent ground and a hairline.
 */
export function Nav({ padConnected }: { padConnected: boolean }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="nav-inner">
        <a className="nav-brand" href="#topo" aria-label="JoyChromium, início">
          <img src="/img/mark.png" alt="" width={30} height={30} />
          <span>JoyChromium</span>
        </a>
        <nav className="nav-links" aria-label="Seções">
          <a href="#como">Como funciona</a>
          <a href="#controle">Controle</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#faq">Perguntas</a>
          <a href="https://github.com/lippdev/joychromium" target="_blank" rel="noreferrer">
            GitHub
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </nav>
        <div className="nav-end">
          <ThemeToggle />
          {padConnected && <span className="nav-pad"><span className="pad-live" aria-hidden="true" />Controle conectado</span>}
          <a className="nav-cta" href="#baixar">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7h9a5 5 0 0 1 4.9 6l-.9 4.4a2.3 2.3 0 0 1-4 .9L14.6 16H9.4l-1.9 2.3a2.3 2.3 0 0 1-4-.9L2.6 13A5 5 0 0 1 7.5 7Z M8 10v3M6.5 11.5h3M15.5 11h.01M17.5 12.5h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Baixar alpha
          </a>
        </div>
      </div>
    </header>
  );
}
