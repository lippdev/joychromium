import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { GitHubIcon } from "./Icons";
import { SignupForm } from "./SignupForm";

const FAQ = [
  { q: "Em que sistema funciona?", a: "Windows 10 e 11, em PCs x64 e ARM. Linux, Steam Deck e macOS estão no roteiro, depois do beta." },
  { q: "Quanto custa?", a: "Nada. O JoyChromium é gratuito, sem conta e sem assinatura." },
  { q: "Netflix, Prime Video e Disney+ funcionam?", a: "O motor tem o Widevine, o DRM desses serviços, com a assinatura que eles exigem no Windows. Validar cada serviço na TV é justamente parte do beta." },
  { q: "E o YouTube?", a: "Funciona, inclusive a versão de TV do YouTube, em que o D-pad vira as setas nativas do site." },
  { q: "Preciso de um controle específico?", a: "Não. Xbox, PlayStation, Switch Pro, 8BitDo e controles genéricos funcionam. Mouse e teclado continuam funcionando também." },
  { q: "O que eu recebo ao entrar no beta?", a: "Um e-mail com o instalador quando cada build de teste sair, e um canal para mandar o que achou. Nada além disso." },
];

const STORY = "https://filipemoreira.top/blog/joychromium-web-com-controle";
const REPO = "https://github.com/lippdev/joychromium";

export function Closing() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="faq" id="faq" aria-labelledby="faq-title">
        <header className="section-head left">
          <h2 id="faq-title">Perguntas frequentes</h2>
          <p>Não achou a sua? Abra uma <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">issue no GitHub</a>.</p>
        </header>
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
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
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
        <h2>Entre no beta</h2>
        <p>Os convites de cada rodada de teste saem por ordem de inscrição. Deixe o e-mail e guarde o seu lugar na fila.</p>
        <SignupForm id="beta" />
      </section>

      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-brand">
            <p className="foot-name">JoyChromium</p>
            <p className="foot-tagline">Um navegador para a TV que você usa só com o controle. Grátis, com o código à vista.</p>
            <a className="btn btn-light" href="#beta">Entrar no beta <span aria-hidden="true">→</span></a>
          </div>
          <nav className="foot-cols" aria-label="Rodapé">
            <div>
              <h2>Projeto</h2>
              <a href={REPO} target="_blank" rel="noreferrer"><GitHubIcon size={14} /> GitHub</a>
              <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Releases</a>
              <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Reportar um problema</a>
            </div>
            <div>
              <h2>Conhecer</h2>
              <a href="#como">Como funciona</a>
              <a href="#controle">Controle</a>
              <a href="#faq">Perguntas</a>
            </div>
            <div>
              <h2>Bastidores</h2>
              <a href={STORY} target="_blank" rel="noreferrer">Por que navegar com controle é difícil</a>
              <a href="https://filipemoreira.top/" target="_blank" rel="noreferrer">filipemoreira.top</a>
            </div>
          </nav>
          <p className="foot-made">
            Made by <a href="https://filipemoreira.top/" target="_blank" rel="noreferrer"><img src="/img/lippdev.png" alt="" width={20} height={20} /> lippdev</a>
            <span>© 2026 JoyChromium</span>
          </p>
        </div>
        <img className="foot-mark" src="/img/mark.png" alt="" aria-hidden="true" />
      </footer>
    </>
  );
}
