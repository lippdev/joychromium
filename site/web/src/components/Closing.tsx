import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SignupForm } from "./SignupForm";

const FAQ = [
  { q: "Em que sistema funciona?", a: "Windows 10 e 11, em PCs x64 e ARM. Linux, Steam Deck e macOS estão no roteiro, depois do beta." },
  { q: "Quanto custa?", a: "Nada. O JoyChromium é gratuito, sem conta e sem assinatura." },
  { q: "Netflix, Prime Video e Disney+ funcionam?", a: "O motor tem o Widevine, o DRM desses serviços, com a assinatura que eles exigem no Windows. Validar cada serviço na TV é justamente parte do beta." },
  { q: "E o YouTube?", a: "Funciona, inclusive a versão de TV do YouTube, em que o D-pad vira as setas nativas do site." },
  { q: "Preciso de um controle específico?", a: "Não. Xbox, PlayStation, Switch Pro, 8BitDo e controles genéricos funcionam. Mouse e teclado continuam funcionando também." },
  { q: "O que eu recebo ao entrar no beta?", a: "Um e-mail com o instalador quando cada build de teste sair, e um canal para mandar o que achou. Nada além disso." },
];

export function Closing() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="faq" id="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Perguntas honestas.</h2>
        <div className="faq-list">
          {FAQ.map((item, i) => (
            <div className={`faq-item ${open === i ? "open" : ""}`} key={item.q}>
              <h3>
                <button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                  {item.q}<span className="faq-sign" aria-hidden="true" />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    id={`faq-${i}`}
                    className="faq-answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.45 }}
                  >
                    <p>{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      <section className="beta" id="beta">
        <div className="beta-halo" aria-hidden="true" />
        <motion.img
          className="beta-mark"
          src="/img/mark.png"
          alt=""
          width={112}
          height={112}
          initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ type: "spring", bounce: 0.25, duration: 1.1 }}
        />
        <h2>Entre no beta.</h2>
        <p>As vagas de cada rodada de teste são liberadas por ordem de inscrição. Deixe o e-mail e pegue o seu lugar na fila.</p>
        <SignupForm id="beta" />
      </section>

      <footer className="foot">
        <p className="foot-line">Feito para quem prefere o sofá.</p>
        <div className="foot-meta">
          <span>© 2026 JoyChromium</span>
          <a href="https://github.com/lippdev/joychromium">GitHub</a>
          <a href="#topo">Voltar ao topo</a>
        </div>
      </footer>
    </>
  );
}
