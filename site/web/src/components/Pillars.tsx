import { motion } from "motion/react";

const rise = (i: number) => ({
  initial: { opacity: 0, y: 48, filter: "blur(10px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.3 },
  transition: { type: "spring", bounce: 0, duration: 1, delay: i * 0.08 },
}) as const;

/** What the product commits to, each with a small drawing of the idea instead of an icon from a set. */
export function Pillars() {
  return (
    <section className="pillars" id="promessas">
      <motion.h2 {...rise(0)}>Feito para a sala, <span className="dim">não adaptado para ela.</span></motion.h2>

      <div className="bento">
        <motion.article className="cell cell-wide cell-distance" {...rise(1)}>
          <div className="distance" aria-hidden="true">
            <span className="d-sofa" />
            <span className="d-ruler"><i /><b>3 m</b></span>
            <span className="d-tv"><em>Aa</em></span>
          </div>
          <h3>Legível a três metros.</h3>
          <p>Letras grandes, foco azul que se enxerga do sofá, tela cheia desde a primeira abertura. Nada de UI de notebook esticada na TV.</p>
        </motion.article>

        <motion.article className="cell cell-block" {...rise(2)}>
          <div className="block-art" aria-hidden="true">
            <span className="ad">AD</span><span className="ad">AD</span><span className="ad">AD</span>
            <span className="shield">⛉</span>
          </div>
          <h3>Sem anúncios. Sem rastreadores.</h3>
          <p>Bloqueio integrado, ligado por padrão, com listas atualizadas sozinhas. HTTPS estrito.</p>
        </motion.article>

        <motion.article className="cell cell-tall cell-pads" {...rise(3)}>
          <ul className="pads" aria-label="Controles compatíveis">
            <li>Xbox</li><li>PlayStation</li><li>Switch Pro</li><li>8BitDo</li><li>Genéricos</li>
          </ul>
          <h3>O controle que você já tem.</h3>
          <p>Troque de controle no meio da sessão: o último que você usar assume, sem reiniciar nada.</p>
        </motion.article>

        <motion.article className="cell cell-code" {...rise(4)}>
          <pre aria-hidden="true"><span className="c-dim">$</span> git clone lippdev/joychromium</pre>
          <h3>Grátis, com o código à vista.</h3>
          <p>Sem conta, sem assinatura. O código é público no GitHub.</p>
        </motion.article>

        <motion.article className="cell cell-launch" {...rise(5)}>
          <div className="launch" aria-hidden="true"><span>joychromium://</span></div>
          <h3>Abre de onde você joga.</h3>
          <p>Atalhos e um link próprio para lançar do Steam Big Picture, do Playnite ou de um launcher de console.</p>
        </motion.article>
      </div>
    </section>
  );
}
