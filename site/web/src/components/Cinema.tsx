import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { BrowserMock } from "./BrowserMock";

const CHAPTERS = [
  { from: 0, kicker: "Cursor", title: "O analógico vira mouse.", body: <>Ele anda pelo app inteiro, das abas à página, e vira mão sobre o que dá para clicar. <kbd className="b-a">A</kbd> clica.</> },
  { from: 3.4, kicker: "Foco", title: "O D-pad pula de item em item.", body: <>Cada direção leva ao próximo link ou botão. O cursor vai junto, sem você mirar.</> },
  { from: 6.2, kicker: "Teclado", title: "Um teclado de console.", body: <><kbd className="b-y">Y</kbd> abre o teclado na barra. <kbd className="b-x">X</kbd> apaga, <kbd>LT</kbd> maiúsculas, <kbd>Start</kbd> envia.</> },
  { from: 9.6, kicker: "Assistir", title: "Depois, é só assistir.", body: <>O analógico direito rola. <kbd>LT</kbd> <kbd>RT</kbd> trocam de aba, <kbd className="b-b">B</kbd> volta.</> },
];
const SCENE_END = 13;

/**
 * The pinned sequence: the TV sits small in a dark room, the scroll pulls the camera in until the screen fills the view,
 * then the same scroll plays the app — one chapter per gesture.
 */
export function Cinema() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [t, setT] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => setT(Math.min(SCENE_END, Math.max(0, ((p - 0.16) / 0.8) * SCENE_END))));

  const scale = useTransform(scrollYProgress, [0, 0.16], [0.62, 1]);
  const tilt = useTransform(scrollYProgress, [0, 0.16], [16, 0]);
  const lift = useTransform(scrollYProgress, [0, 0.16], [60, 0]);
  const glow = useTransform(scrollYProgress, [0, 0.16], [0.25, 1]);
  const roomFade = useTransform(scrollYProgress, [0.04, 0.16], [1, 0]);
  const captionIn = useTransform(scrollYProgress, [0.13, 0.19], [0, 1]);

  const chapter = CHAPTERS.reduce((at, c, i) => (t >= c.from ? i : at), 0);
  const fill = (i: number) => {
    const end = CHAPTERS[i + 1]?.from ?? SCENE_END;
    return Math.min(1, Math.max(0, (t - CHAPTERS[i].from) / (end - CHAPTERS[i].from)));
  };

  return (
    <section className="cinema" ref={ref} id="como" aria-label="Como se usa o JoyChromium">
      <div className="cinema-pin">
        <motion.p className="cinema-intro" style={{ opacity: roomFade }}>
          Role. A câmera entra na TV.
        </motion.p>
        <motion.div className="cinema-tv" style={{ scale, rotateX: tilt, y: lift }}>
          <motion.div className="cinema-glow" style={{ opacity: glow }} aria-hidden="true" />
          <div className="cinema-bezel">
            <BrowserMock t={t} />
          </div>
        </motion.div>
        <motion.div className="cinema-floor" style={{ opacity: roomFade }} aria-hidden="true" />

        <motion.div className="cinema-caption" style={{ opacity: captionIn }}>
          <div className="cinema-rail" aria-hidden="true">
            {CHAPTERS.map((c, i) => (
              <span key={c.kicker}><i style={{ transform: `scaleX(${fill(i)})` }} /></span>
            ))}
          </div>
          <div className="cinema-text" key={chapter}>
            <p className="kicker">{CHAPTERS[chapter].kicker}</p>
            <h3>{CHAPTERS[chapter].title}</h3>
            <p className="body">{CHAPTERS[chapter].body}</p>
          </div>
        </motion.div>
      </div>
      {/* Screen readers and no-scroll readers get the four steps as plain text. */}
      <ol className="sr-only">
        {CHAPTERS.map((c) => <li key={c.kicker}><strong>{c.title}</strong> {c.body}</li>)}
      </ol>
    </section>
  );
}
