import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useSceneClock } from "../hooks/useSceneClock";
import { BrowserMock } from "./BrowserMock";

const FEATURES = [
  { title: "Cursor no analógico", text: "O analógico esquerdo move um cursor pelo app inteiro, das abas à página. Ele vira mão sobre o que dá para clicar, e o A clica.", from: 0, to: 3.2 },
  { title: "Foco no D-pad", text: "Cada direção do D-pad leva ao próximo link ou botão, e o cursor vai junto. Nada de mirar com o analógico em link pequeno.", from: 3.2, to: 6.1 },
  { title: "Teclado de console", text: "O Y abre um teclado no estilo do Xbox na barra de endereço. X apaga, LT liga as maiúsculas, Start envia.", from: 6.1, to: 9.6 },
  { title: "Assistir sem levantar", text: "O analógico direito rola a página, LT e RT trocam de aba e B volta. O YouTube de TV ganha as setas nativas do site.", from: 9.5, to: 12.6 },
];

/** Zen-style: a list of features on the left; the one picked plays in the framed app on the right. */
export function Features() {
  const [active, setActive] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const f = FEATURES[active];
  const t = useSceneClock(frame, f.from, f.to, 1);
  return (
    <section className="features" id="como">
      <header className="section-head left">
        <h2>Feito para o controle</h2>
        <p>Navegador de TV costuma ser um navegador de PC esticado. O JoyChromium começou pelo gamepad: cada gesto tem um papel, e ele é o mesmo em qualquer site.</p>
      </header>
      <div className="features-body">
        <div className="features-list" role="tablist" aria-label="Recursos">
          {FEATURES.map((item, i) => (
            <button
              key={item.title}
              role="tab"
              aria-selected={active === i}
              aria-controls="features-panel"
              className={active === i ? "is-active" : ""}
              onClick={() => setActive(i)}
            >
              {active === i && <motion.span className="features-bg" layoutId="features-bg" transition={{ type: "spring", bounce: 0, duration: 0.4 }} />}
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
        <div className="frame frame-feature" id="features-panel" role="tabpanel" ref={frame} style={{ backgroundImage: "url(/img/nocturne-bridge.jpg)" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="frame-window"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            >
              <BrowserMock t={t} />
            </motion.div>
          </AnimatePresence>
          <span className="frame-credit">Whistler, <i>Nocturne: Blue and Gold – Old Battersea Bridge</i>, c. 1872</span>
        </div>
      </div>
    </section>
  );
}
