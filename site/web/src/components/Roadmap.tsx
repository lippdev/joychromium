import { motion } from "motion/react";
import { REPO, RELEASE, SHORT } from "../release";
import { Check } from "./Icons";

type Item = { text: string; issue?: number };
const STAGES: { id: string; when: string; title: string; text: string; items: Item[]; link?: { href: string; label: string } }[] = [
  {
    id: "now", when: "Agora", title: `Alpha ${SHORT}`, text: "A primeira build pública, para Windows 10 e 11.",
    items: [
      { text: "Cursor no analógico, foco no D-pad e um teclado de controle no estilo do Xbox" },
      { text: "Anúncios e rastreadores bloqueados desde a primeira página" },
      { text: "Abas, favoritos, histórico, picture-in-picture e quatro temas" },
      { text: "Instaladores para PCs x64 e ARM" },
    ],
    link: { href: RELEASE, label: "Notas da versão" },
  },
  {
    id: "next", when: "Próximas versões", title: "Ainda no Windows", text: "O que falta para o alpha virar o navegador de todo dia.",
    items: [
      { text: "Atualização automática, sem baixar cada versão na mão" },
      { text: "Netflix, Prime Video e os outros serviços com Widevine" },
      { text: "Correções do que vocês relatarem nas issues" },
    ],
    link: { href: `${REPO}/issues`, label: "Relatar um problema" },
  },
  {
    id: "later", when: "Depois", title: "Outras plataformas", text: "Cada uma entra quando estiver pronta; nenhuma segura o Windows.",
    items: [
      { text: "macOS", issue: 108 },
      { text: "Linux, com Wayland e Flathub", issue: 109 },
      { text: "Steam Deck e o modo Gaming do SteamOS", issue: 110 },
      { text: "Leitores de tela: Orca no Linux, VoiceOver no Mac" },
    ],
    link: { href: `${REPO}/blob/main/docs/ROADMAP.md`, label: "Roadmap completo" },
  },
];

/** Where the project stands and where it goes: three stops on one line, the first one lit. */
export function Roadmap() {
  return (
    <section className="roadmap" id="roadmap" aria-labelledby="roadmap-title">
      <header className="section-head">
        <h2 id="roadmap-title">Roadmap</h2>
        <p>O alpha saiu. Daqui em diante, o caminho é este, sem datas prometidas.</p>
      </header>
      <ol className="road">
        {STAGES.map((s, i) => (
          <motion.li
            key={s.id}
            className={`road-stop road-${s.id}`}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ type: "spring", bounce: 0, duration: 0.8, delay: i * 0.08 }}
          >
            <span className="road-dot" aria-hidden="true" />
            <p className="road-when">{s.when}</p>
            <h3>{s.title}</h3>
            <p className="road-text">{s.text}</p>
            <ul>
              {s.items.map((it) => (
                <li key={it.text}>
                  {s.id === "now" ? <Check /> : <span className="road-tick" aria-hidden="true" />}
                  <span>
                    {it.text}
                    {it.issue && <> <a href={`${REPO}/issues/${it.issue}`} target="_blank" rel="noreferrer">#{it.issue}</a></>}
                  </span>
                </li>
              ))}
            </ul>
            {s.link && <a className="road-link" href={s.link.href} target="_blank" rel="noreferrer">{s.link.label} <span aria-hidden="true">↗</span></a>}
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
