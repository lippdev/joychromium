import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BTN, usePad } from "../hooks/pad";

type Part = "ls" | "rs" | "dpad" | "a" | "b" | "x" | "y" | "lt" | "start";
const LEGEND: { part: Part; key: React.ReactNode; label: string; detail: string }[] = [
  { part: "ls", key: "L", label: "Analógico esquerdo", detail: "Move o cursor pelo app inteiro." },
  { part: "dpad", key: "✚", label: "D-pad", detail: "Pula de link em link. O cursor acompanha." },
  { part: "a", key: <kbd className="b-a">A</kbd>, label: "Clicar", detail: "Dois toques rápidos: clique direito." },
  { part: "b", key: <kbd className="b-b">B</kbd>, label: "Voltar", detail: "Fecha menus, sai da tela cheia." },
  { part: "y", key: <kbd className="b-y">Y</kbd>, label: "Teclado", detail: "Abre o teclado na barra de endereço." },
  { part: "x", key: <kbd className="b-x">X</kbd>, label: "Recarregar", detail: "No teclado, apaga a última letra." },
  { part: "rs", key: "R", label: "Analógico direito", detail: "Rola a página, nas duas direções." },
  { part: "lt", key: "LT · RT", label: "Gatilhos", detail: "Trocam de aba." },
];

/** The buttons a real pad is holding down right now, in legend terms. */
function livePart(pressed: ReadonlySet<number>, lx: number, ly: number, rx: number, ry: number): Part | null {
  if (pressed.has(BTN.A)) return "a";
  if (pressed.has(BTN.B)) return "b";
  if (pressed.has(BTN.X)) return "x";
  if (pressed.has(BTN.Y)) return "y";
  if (pressed.has(BTN.LT) || pressed.has(BTN.RT)) return "lt";
  if ([BTN.Up, BTN.Down, BTN.Left, BTN.Right].some((b) => pressed.has(b))) return "dpad";
  if (lx || ly) return "ls";
  if (rx || ry) return "rs";
  if (pressed.has(BTN.Start)) return "start";
  return null;
}

export function PadLab() {
  const pad = usePad();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [hovered, setHovered] = useState<Part | null>(null);
  const [tour, setTour] = useState(0);
  const live = pad.connected ? livePart(pad.pressed, pad.lx, pad.ly, pad.rx, pad.ry) : null;
  const touring = inView && !hovered && !pad.connected && !matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!touring) return;
    const id = setInterval(() => setTour((i) => (i + 1) % LEGEND.length), 1500);
    return () => clearInterval(id);
  }, [touring]);
  const lit: Part | null = live ?? hovered ?? (touring ? LEGEND[tour].part : null);
  const on = (part: Part) => (lit === part ? "is-lit" : "");
  const stick = { x: pad.lx * 7, y: pad.ly * 7 };
  const rstick = { x: pad.rx * 7, y: pad.ry * 7 };

  return (
    <section className="padlab" id="controle" ref={ref}>
      <div className="padlab-head">
        <h2>Seu controle, <span className="dim">mapeado inteiro.</span></h2>
        <p>
          {pad.connected
            ? "Seu controle está conectado. Aperte qualquer botão e veja o que ele faz no JoyChromium."
            : "Xbox, PlayStation, Switch Pro, 8BitDo. Cada botão tem um papel, e é o mesmo em qualquer site."}
        </p>
      </div>

      <div className="padlab-stage">
        <motion.svg
          className="padlab-pad"
          viewBox="0 0 330 230"
          role="img"
          aria-label="Controle com a função de cada botão no JoyChromium"
          initial={{ opacity: 0, rotateX: 40, y: 60, scale: 0.9 }}
          whileInView={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: "spring", bounce: 0, duration: 1.2 }}
        >
          <defs>
            <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--pad-shell-top)" />
              <stop offset="1" stopColor="var(--pad-shell-bottom)" />
            </linearGradient>
            <filter id="lit" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g className={`p-part ${on("lt")}`}><rect x="46" y="8" width="64" height="22" rx="10" /><rect x="220" y="8" width="64" height="22" rx="10" /></g>
          <path className="p-body" d="M70 40 C 30 40 14 90 10 140 C 6 190 30 222 58 218 C 84 214 96 178 118 168 L 212 168 C 234 178 246 214 272 218 C 300 222 324 190 320 140 C 316 90 300 40 260 40 Z" />
          <circle className="p-well" cx="82" cy="96" r="26" />
          <g className={`p-part ${on("ls")}`} style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}><circle cx="82" cy="96" r="18" /><circle className="p-cap" cx="82" cy="96" r="11" /></g>
          <circle className="p-well" cx="124" cy="140" r="26" />
          <g className={`p-part ${on("dpad")}`}><path d="M116 118h16v14h14v16h-14v14h-16v-14h-14v-16h14z" /></g>
          <circle className="p-well" cx="206" cy="140" r="26" />
          <g className={`p-part ${on("rs")}`} style={{ transform: `translate(${rstick.x}px, ${rstick.y}px)` }}><circle cx="206" cy="140" r="18" /><circle className="p-cap" cx="206" cy="140" r="11" /></g>
          <g className={`p-face y ${on("y")}`}><circle cx="250" cy="72" r="12" /><text x="250" y="77">Y</text></g>
          <g className={`p-face x ${on("x")}`}><circle cx="226" cy="96" r="12" /><text x="226" y="101">X</text></g>
          <g className={`p-face b ${on("b")}`}><circle cx="274" cy="96" r="12" /><text x="274" y="101">B</text></g>
          <g className={`p-face a ${on("a")}`}><circle cx="250" cy="120" r="12" /><text x="250" y="125">A</text></g>
          <circle className="p-key" cx="146" cy="84" r="7" />
          <g className={`p-part ${on("start")}`}><circle cx="184" cy="84" r="7" /></g>
          <circle className="p-key" cx="165" cy="60" r="11" /><circle className="p-home" cx="165" cy="60" r="5" />
        </motion.svg>

        <ul className="padlab-legend">
          {LEGEND.map((item) => (
            <li
              key={item.part}
              className={lit === item.part ? "is-lit" : ""}
              onPointerEnter={() => setHovered(item.part)}
              onPointerLeave={() => setHovered(null)}
            >
              <span className="padlab-key">{item.key}</span>
              <span><strong>{item.label}</strong><span className="padlab-detail">{item.detail}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
