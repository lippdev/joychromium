import { useEffect, useRef, useState } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import { cmd } from "./bridge";
import { CloseIcon } from "./icons";

const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ABC = ["abcdefg", "hijklmn", "opqrstu", "vwxyz"];
const ACCENTS = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const URL_KEYS = [".com", ".br", "www.", "https://", "/", "-"];

/**
 * The controller keyboard: D-pad moves, A types, B closes. Two layouts and a row of accented letters. While the
 * address field is being typed, what the shell knows of the typed text comes back as suggestions: D-pad up leaves the
 * keys for them, and A on one opens it instead of typing another letter.
 */
export function Keyboard({ state }: { state: ShellState }) {
  const [layout, setLayout] = useState<"qwerty" | "abc">("qwerty");
  const [row, setRow] = useState<"letters" | "accents">("letters");
  const [shift, setShift] = useState(false);
  const [selected, setSelected] = useState(-1);
  const dialog = useRef<HTMLDivElement>(null);
  // Opened from the controller (Y) the dialog takes focus so the screen reader announces it; opened by focusing the
  // address field the field keeps it, because that is where the physical keyboard types.
  useEffect(() => {
    if (document.activeElement?.id !== "address") dialog.current?.focus();
  }, []);
  const target = state.keyboard?.target ?? "address";
  const suggestions = target === "address" ? state.suggestions : [];
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
    <div ref={dialog} tabindex={-1} class="overlay bottom" id="keyboard" role="dialog" aria-label={t(state.language, "a11y.keyboard")}>
      <div class="keyboard">
        <div class="keyboard-head">
          <span class="label">{target === "address" ? t(state.language, "input.address") : t(state.language, "input.page")}</span>
          <span class="hint">{t(state.language, "input.hint")}</span>
          <button class="icon-btn" aria-label={t(state.language, "nav.close")} onClick={() => cmd({ type: "keyboard-close" })}><CloseIcon /></button>
        </div>

        {suggestions.length > 0 && (
          <div class="suggestions" role="listbox" aria-label={t(state.language, "input.suggestions")}>
            {suggestions.map((suggestion, index) => (
              <button
                class="chip"
                role="option"
                aria-selected={index === selected}
                onFocus={() => setSelected(index)}
                onClick={() => {
                  cmd({ type: "search-or-navigate", text: suggestion.url });
                  cmd({ type: "keyboard-close" });
                }}
              >
                <span class="chip-title">
                  {suggestion.kind === "favorite" && <span aria-hidden="true">★ </span>}
                  {suggestion.title || suggestion.url}
                </span>
                {suggestion.title && suggestion.title !== suggestion.url && <span class="chip-url">{suggestion.url}</span>}
              </button>
            ))}
          </div>
        )}

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
          <button class="key wide" onClick={backspace} aria-label={t(state.language, "input.delete")}>⌫</button>
          <button
            class="key wide primary"
            onClick={() => { if (target === "page") cmd({ type: "keyboard-submit" }); else (document.getElementById("address") as HTMLInputElement | null)?.form?.requestSubmit(); }}
          >
            {t(state.language, "input.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
