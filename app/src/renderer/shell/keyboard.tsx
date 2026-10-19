import { useState } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import { cmd } from "./bridge";
import { CloseIcon } from "./icons";

const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ABC = ["abcdefg", "hijklmn", "opqrstu", "vwxyz"];
const ACCENTS = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const URL_KEYS = [".com", ".br", "www.", "https://", "/", "-"];

/** The controller keyboard: D-pad moves, A types, B closes. Two layouts and a row of accented letters. */
export function Keyboard({ state }: { state: ShellState }) {
  const [layout, setLayout] = useState<"qwerty" | "abc">("qwerty");
  const [row, setRow] = useState<"letters" | "accents">("letters");
  const [shift, setShift] = useState(false);
  const target = state.keyboard?.target ?? "address";
  const rows = row === "accents" ? [ACCENTS.slice(0, 14), ACCENTS.slice(14)] : layout === "qwerty" ? QWERTY : ABC;

  const type = (text: string) => {
    const value = shift ? text.toUpperCase() : text;
    if (shift) setShift(false);
    if (target === "page") {
      cmd({ type: "keyboard-insert", text: value });
      return;
    }
    const input = document.getElementById("address") as HTMLInputElement | null;
    if (!input) return;
    input.value += value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  };

  const backspace = () => {
    if (target === "page") { cmd({ type: "keyboard-backspace" }); return; }
    const input = document.getElementById("address") as HTMLInputElement | null;
    if (!input) return;
    input.value = input.value.slice(0, -1);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  };

  return (
    <div class="overlay bottom" id="keyboard" role="dialog" aria-modal="true" aria-label="Teclado do controle">
      <div class="keyboard">
        <div class="keyboard-head">
          <span class="label">{target === "address" ? t(state.language, "input.address") : t(state.language, "input.page")}</span>
          <span class="hint">{t(state.language, "input.hint")}</span>
          <button class="icon-btn" aria-label={t(state.language, "nav.close")} onClick={() => cmd({ type: "keyboard-close" })}><CloseIcon /></button>
        </div>

        <div class="keyboard-rows">
          {rows.map((letters) => (
            <div class="key-row">
              {[...letters].map((letter) => (
                <button class="key" onClick={() => type(letter)}>{shift ? letter.toUpperCase() : letter}</button>
              ))}
              {letters === rows[rows.length - 1] && (
                <button class="key wide" onClick={backspace} aria-label={t(state.language, "input.delete")}>⌫</button>
              )}
            </div>
          ))}
          <div class="key-row url-keys">
            {URL_KEYS.map((k) => <button class="key small" onClick={() => type(k)}>{k}</button>)}
          </div>
        </div>

        <div class="key-row actions">
          <button class={`key wide ${shift ? "on" : ""}`} onClick={() => setShift(!shift)}>{t(state.language, "input.shift")}</button>
          <button class="key wide" onClick={() => setRow(row === "letters" ? "accents" : "letters")}>
            {row === "letters" ? "á ç" : "abc"}
          </button>
          <button class="key wide" onClick={() => setLayout(layout === "qwerty" ? "abc" : "qwerty")}>
            {layout === "qwerty" ? "ABC" : "QWERTY"}
          </button>
          <button class="key wider" onClick={() => type(" ")}>{t(state.language, "input.space")}</button>
          <button class="key wide" onClick={backspace}>⌫</button>
          <button
            class="key wide primary"
            onClick={() => { if (target === "page") cmd({ type: "keyboard-submit" }); else document.getElementById("go")?.click(); }}
          >
            {t(state.language, "input.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
