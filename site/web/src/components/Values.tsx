import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Check } from "./Icons";

const VALUES = [
  { label: "Grátis e com o código à vista", title: "Sem conta, sem assinatura.", text: "O JoyChromium é gratuito e o código é público no GitHub. Dá para ver como cada parte funciona, abrir uma issue ou mandar uma correção." },
  { label: "Sem anúncios nem rastreadores", title: "A TV é sua, não do anunciante.", text: "O bloqueio de anúncios e rastreadores vem ligado desde a primeira página, com listas que se atualizam sozinhas, e as conexões ficam em HTTPS estrito." },
  { label: "Feito para a sala", title: "Legível a três metros.", text: "Letras grandes, um foco azul que se enxerga do sofá e tela cheia desde a primeira abertura. E abre de onde você joga: Steam, Playnite ou um launcher de console." },
];

/** Zen's core values: chips that switch the panel under them. */
export function Values() {
  const [active, setActive] = useState(0);
  const v = VALUES[active];
  return (
    <section className="values" id="valores">
      <header className="section-head">
        <h2>O que não muda</h2>
        <p>Três compromissos que valem para toda versão, da primeira alpha em diante.</p>
      </header>
      <div className="chips" role="tablist" aria-label="Compromissos">
        {VALUES.map((item, i) => (
          <button key={item.label} role="tab" aria-selected={active === i} className={active === i ? "is-active" : ""} onClick={() => setActive(i)}>
            <Check /> {item.label}
          </button>
        ))}
      </div>
      <div className="frame frame-values" role="tabpanel" style={{ backgroundImage: "url(/img/nocturne-silver.jpg)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="values-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          >
            <h3>{v.title}</h3>
            <p>{v.text}</p>
          </motion.div>
        </AnimatePresence>
        <span className="frame-credit">Whistler, <i>Nocturne in Blue and Silver</i>, 1871–72</span>
      </div>
    </section>
  );
}
