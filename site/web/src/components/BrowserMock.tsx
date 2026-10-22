import { useLayoutEffect, useRef, useState } from "react";
import { Arrow, Hand } from "./Pointer";

/**
 * JoyChromium's own UI, rebuilt as a live scene. `t` is the scene clock in seconds (0 → 13): the scroll drives it, so
 * every frame is the app as it really looks at that moment of the story — cursor, D-pad focus, keyboard, video.
 * The scene is laid out on the app's 816×459 screen and scaled to whatever box it sits in.
 */
const W = 816;
const H = 459;
const TILES = [
  { name: "YouTube", letter: "▶", color: "#ff0033" },
  { name: "Twitch", letter: "T", color: "#9146ff" },
  { name: "Netflix", letter: "N", color: "#e50914" },
  { name: "GitHub", letter: "G", color: "#2b95ff" },
  { name: "Wikipédia", letter: "W", color: "#3a3a3a" },
];
type Rect = { x: number; y: number; w: number; h: number };
const tile = (i: number): Rect => ({ x: 176 + i * 96, y: 250, w: 80, h: 80 });
const ADDR: Rect = { x: 106, y: 40, w: 590, h: 28 };
const TYPE = ["y", "o", "u", "t", "u", "b", "e", ".com"];
const typeAt = (i: number) => 6.9 + i * 0.27;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const mix = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const pulse = (t: number, at: number, len = 0.3) => (t >= at && t < at + len ? Math.sin((Math.PI * (t - at)) / len) : 0);

/** The whole choreography as a pure function of time. */
export function sceneAt(t: number) {
  const start = { x: 408, y: 300 };
  const t0 = center(tile(0)), t1 = center(tile(1)), t2 = center(tile(2)), addr = { x: 330, y: 54 };
  let p = start;
  if (t >= 0.2) { const q = ease(seg(t, 0.2, 1.8)); p = { x: lerp(start.x, t0.x, q), y: lerp(start.y, t0.y, q) }; }
  if (t >= 3.7) p = { x: lerp(t0.x, t1.x, ease(seg(t, 3.7, 4.0))), y: t0.y };
  if (t >= 4.5) p = { x: lerp(t1.x, t2.x, ease(seg(t, 4.5, 4.8))), y: t0.y };
  if (t >= 5.3) { const q = ease(seg(t, 5.3, 5.65)); p = { x: lerp(t2.x, addr.x, q), y: lerp(t0.y, addr.y, q) }; }
  if (t >= 10.2) { const q = ease(seg(t, 10.2, 10.7)); p = { x: lerp(addr.x, 300, q), y: lerp(addr.y, 200, q) }; }

  let focus: Rect | null = null;
  if (t >= 3.4 && t < 3.7) focus = tile(0);
  if (t >= 3.7 && t < 4.5) focus = mix(tile(0), tile(1), ease(seg(t, 3.7, 4.0)));
  if (t >= 4.5 && t < 5.3) focus = mix(tile(1), tile(2), ease(seg(t, 4.5, 4.8)));
  if (t >= 5.3 && t < 9.9) focus = mix(tile(2), ADDR, ease(seg(t, 5.3, 5.65)));

  let typed = "";
  let keyOn: string | null = null;
  TYPE.forEach((ch, i) => {
    if (t >= typeAt(i)) typed += ch;
    if (Math.abs(t - typeAt(i)) < 0.12) keyOn = ch;
  });
  if (t >= 9.15 && t < 9.45) keyOn = "go";

  const video = ease(seg(t, 9.55, 9.95)) * (1 - ease(seg(t, 12.2, 12.5)));
  return {
    pointer: p,
    hand: t > 1.4 && t < 5.4,
    press: pulse(t, 2.35),
    ripple: t >= 2.4 && t < 2.9 ? seg(t, 2.4, 2.9) : 0,
    hover: t > 1.4 && t < 3.7,
    focus,
    pointerHidden: t > 6.7 && t < 10.1,
    keyboard: ease(seg(t, 6.35, 6.8)) * (1 - ease(seg(t, 9.55, 9.9))),
    keyOn: keyOn as string | null,
    typed,
    typing: t >= 6.4 && t < 9.5,
    caret: Math.floor(t * 2.5) % 2 === 0,
    video,
    onVideo: t >= 9.5 && t < 12.2,
    scroll: ease(seg(t, 10.7, 11.7)) * 150,
    progress: clamp((t - 9.9) / 6),
    secondTab: t >= 12.2,
  };
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm."];

export function BrowserMock({ t }: { t: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = sceneAt(t);
  const address = s.onVideo ? (
    <><span className="m-dim">https://</span>youtube.com/watch</>
  ) : s.typing ? (
    <>{s.typed}<span className="m-caret" style={{ opacity: s.caret ? 1 : 0.2 }} /></>
  ) : (
    <span className="m-dim">Pesquisar ou digitar endereço</span>
  );
  const tip = s.hand ? { x: 11.5, y: 2 } : { x: 2.4, y: 2.4 };

  return (
    <div className="mock" ref={box} aria-hidden="true">
      <div className="mock-screen" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div className="m-tabs">
          <div className={`m-tab ${s.secondTab ? "" : "on"}`}>
            <i style={{ background: s.onVideo || t >= 9.6 ? "#ff0033" : "#2b95ff" }} />
            <span>{t >= 9.6 ? "YouTube" : "Nova aba"}</span><b>✕</b>
          </div>
          <div className={`m-tab ${s.secondTab ? "on" : ""}`}><i /><span>Nova aba</span><b>✕</b></div>
          <div className="m-plus">+</div>
        </div>
        <div className="m-bar">
          <span className="m-ib">‹</span><span className="m-ib">›</span><span className="m-ib">⟳</span>
          <div className="m-addr">{address}</div>
          <span className="m-ib">☆</span><span className="m-ib m-shield">⛉</span><span className="m-ib">•••</span>
        </div>

        <div className="m-page m-home" style={{ opacity: s.secondTab ? 1 : 1 - s.video }}>
          <div className="m-logo"><img src="/img/mark.png" alt="" /><span>Joy<b>Chromium</b></span></div>
          <div className="m-search">Pesquisar ou digitar endereço</div>
          {TILES.map((tl, i) => (
            <div key={tl.name} className={`m-tile ${i === 0 && s.hover ? "hover" : ""}`} style={{ left: tile(i).x }}>
              <i style={{ background: tl.color }}>{tl.letter}</i>{tl.name}
            </div>
          ))}
        </div>

        <div className="m-page m-video" style={{ opacity: s.secondTab ? 0 : s.video }}>
          <div style={{ transform: `translateY(${-s.scroll}px)` }}>
            <div className="m-player"><div className="m-play" /><div className="m-prog" style={{ width: `${s.progress * 100}%` }} /></div>
            {[[322, 420, 16], [348, 260, 12], [380, 500, 12], [402, 470, 12], [424, 380, 12], [470, 520, 60], [544, 520, 60]].map(([y, w, h]) => (
              <div key={y} className="m-line" style={{ top: y, width: w, height: h }} />
            ))}
            {["#7a2bff,#2b95ff", "#ff3b3b,#ffb02b", "#1fb36b,#2b95ff", "#ffb02b,#ff3b8b", "#2b95ff,#0b1a33", "#9146ff,#ff3b3b", "#1fb36b,#ffb02b"].map((g, i) => (
              <div key={g} className="m-thumb" style={{ top: 14 + i * 84 }}>
                <i style={{ background: `linear-gradient(135deg,${g})` }} /><span><em /><em style={{ width: "65%" }} /></span>
              </div>
            ))}
          </div>
        </div>

        {s.focus && (
          <div className="m-focus" style={{ left: s.focus.x - 4, top: s.focus.y - 4, width: s.focus.w + 8, height: s.focus.h + 8, borderRadius: s.focus.h < 40 ? 18 : 13 }} />
        )}

        <div className="m-keyboard" style={{ transform: `translateY(${(1 - s.keyboard) * 190}px)` }}>
          {ROWS.map((row) => (
            <div className="m-row" key={row}>
              {[...row].map((ch) => <div key={ch} className={`m-key ${s.keyOn === ch ? "on" : ""}`}>{ch}</div>)}
            </div>
          ))}
          <div className="m-row">
            <div className={`m-key wide ${s.keyOn === ".com" ? "on" : ""}`}>.com</div>
            <div className="m-key wide" style={{ width: 180 }}>espaço</div>
            <div className="m-key">⌫</div>
            <div className={`m-key wide go ${s.keyOn === "go" ? "on" : ""}`}>Ir ➜</div>
          </div>
        </div>

        {s.ripple > 0 && (
          <div className="m-ripple" style={{ width: 10 + s.ripple * 60, height: 10 + s.ripple * 60, left: s.pointer.x, top: s.pointer.y, opacity: 1 - s.ripple }} />
        )}
        <div
          className="m-pointer"
          style={{ opacity: s.pointerHidden ? 0 : 1, transform: `translate(${s.pointer.x - tip.x}px, ${s.pointer.y - tip.y}px) scale(${1 - s.press * 0.18})` }}
        >
          {s.hand ? <Hand /> : <Arrow />}
        </div>
      </div>
    </div>
  );
}
