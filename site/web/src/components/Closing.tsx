import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { DOWNLOADS, RELEASE, REPO, SHORT } from "../release";
import { GitHubIcon } from "./Icons";
import { SignupForm } from "./SignupForm";

const FAQ = [
  { q: "Em que sistema funciona?", a: "Windows 10 e 11, em PCs x64 e ARM. macOS, Linux e Steam Deck estão no roadmap, logo acima." },
  { q: "Quanto custa?", a: "Nada. O JoyChromium é gratuito, sem conta e sem assinatura." },
  { q: "O Windows mostrou um aviso ao abrir o instalador. É normal?", a: "É. O instalador não tem assinatura digital, então o SmartScreen avisa. Clique em \"Mais informações\" e depois em \"Executar assim mesmo\"." },
  { q: "Netflix, Prime Video e Disney+ funcionam?", a: "Ainda não. Esses serviços usam o Widevine, e o módulo de DRM ainda não vem assinado nesta build. Está nas próximas versões do roadmap." },
  { q: "E o YouTube?", a: "Funciona, inclusive a versão de TV do YouTube, em que o D-pad vira as setas nativas do site." },
  { q: "Preciso de um controle específico?", a: "Não. Xbox, PlayStation, Switch Pro, 8BitDo e controles genéricos funcionam. Mouse e teclado continuam funcionando também." },
  { q: "Como eu atualizo?", a: "O alpha ainda não se atualiza sozinho: cada versão nova sai nas releases do GitHub e se instala por cima. Deixe o e-mail no fim da página para saber quando sair." },
];

const STORY = "https://filipemoreira.top/blog/joychromium-web-com-controle";

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

      <section className="get" id="baixar" aria-labelledby="get-title">
        <p className="get-badge"><span className="pad-live" aria-hidden="true" /> Alpha {SHORT} · Windows 10 e 11</p>
        <h2 id="get-title">Baixe o alpha</h2>
        <p>É a primeira build pública: espere arestas e conte o que quebrar. Escolha o instalador do seu PC.</p>
        <div className="get-options">
          {DOWNLOADS.map((d) => (
            <a key={d.id} className={`get-card ${d.id === "x64" ? "get-main" : ""}`} href={d.href}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span><strong>{d.name}</strong><span>{d.note}</span></span>
            </a>
          ))}
        </div>
        <ul className="get-notes">
          <li>Não se atualiza sozinho ainda: as versões novas saem nas <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">releases</a>.</li>
          <li>Netflix, Prime e outros serviços com Widevine ainda não tocam.</li>
          <li>O SmartScreen pode avisar: <b>Mais informações → Executar assim mesmo</b>.</li>
        </ul>
        <div className="get-notify">
          <h3>Avise-me da próxima versão</h3>
          <p>Um e-mail quando cada build nova sair. Nada além disso.</p>
          <SignupForm id="avisos" />
        </div>
      </section>

      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-brand">
            <p className="foot-name">JoyChromium</p>
            <p className="foot-tagline">Um navegador para a TV que você usa só com o controle. Grátis, com o código à vista.</p>
            <a className="btn btn-light" href="#baixar">Baixar o alpha <span aria-hidden="true">→</span></a>
          </div>
          <nav className="foot-cols" aria-label="Rodapé">
            <div>
              <h2>Projeto</h2>
              <a href={REPO} target="_blank" rel="noreferrer"><GitHubIcon size={14} /> GitHub</a>
              <a href={RELEASE} target="_blank" rel="noreferrer">Notas da versão {SHORT}</a>
              <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Releases</a>
              <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Reportar um problema</a>
            </div>
            <div>
              <h2>Conhecer</h2>
              <a href="#como">Como funciona</a>
              <a href="#controle">Controle</a>
              <a href="#roadmap">Roadmap</a>
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
