import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ShellState } from "../../shared/ipc";
import { buttonGlyphs } from "../../shared/controllerGlyphs";
import { t } from "../../shared/i18n";
import { cmd } from "./bridge";
import { CloseIcon } from "./icons";

type Layer = "letters" | "symbols" | "accents";
const NEXT_LAYER: Record<Layer, Layer> = { letters: "symbols", symbols: "accents", accents: "letters" };
/** What the layer key shows: the layer it switches to, as Xbox's "&123" does. */
const LAYER_LABEL: Record<Layer, string> = { letters: "&123", symbols: "áç", accents: "abc" };
const LAYER_NAME: Record<Layer, string> = { letters: "input.symbols", symbols: "input.accents", accents: "input.letters" };

/** The three rows between the digits and the space bar, ten keys each so the grid lines up, as on Xbox. */
const ROWS: Record<Layer, string[][]> = {
  letters: [[..."qwertyuiop"], [..."asdfghjkl", "-"], [..."zxcvbnm", ",", ".", "?"]],
  symbols: [
    ["!", "@", "#", "$", "%", "&", "*", "(", ")", "_"],
    ["+", "=", "/", "\\", ":", ";", "\"", "'", "€", "£"],
    ["[", "]", "{", "}", "<", ">", "^", "`", "~", "|"],
  ],
  accents: [
    [..."áàâãéêíóôõ"],
    [..."úüçñäëïöèì"],
    [..."òùîû¿¡ªº°§"],
  ],
};
/** The keys either side of the space bar: what an address needs most, per layer. */
const SIDES: Record<Layer, [string, string]> = { letters: ["/", ".com"], symbols: ["www.", ".br"], accents: ["@", ".com.br"] };

/**
 * The controller keyboard, after Xbox's: one clean grid, no instructions on screen. The controller's own buttons are
 * the shortcuts, and each key that has one shows its glyph in the corner: X deletes, Y is the space, the left trigger
 * shifts, the menu button confirms, the left stick's click changes the layer (letters, symbols, accents) and B closes.
 * The D-pad and the left stick walk the keys and A presses one. While the address is typed, the shell's suggestions
 * sit above the keys: D-pad up from the top row enters them, and A opens one.
 */
export function Keyboard({ state, onInset }: { state: ShellState; onInset: (bottom: number) => void }) {
  const [layer, setLayer] = useState<Layer>("letters");
  const [shift, setShift] = useState(false);
  const [selected, setSelected] = useState(-1);
  const dialog = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tr = (key: string) => t(state.language, key);
  const glyphs = buttonGlyphs(state.controllerFamily);
  // The page shrinks to end above the keyboard, so the field being typed into stays in sight and live.
  useEffect(() => {
    const report = () => {
      const top = panel.current?.getBoundingClientRect().top;
      if (top !== undefined) onInset(Math.max(0, Math.round(window.innerHeight - top)));
    };
    const observer = new ResizeObserver(report);
    if (panel.current) observer.observe(panel.current);
    report();
    return () => { observer.disconnect(); onInset(0); };
  }, []);
  // Opened from the controller the dialog takes focus so the screen reader announces it (the first D-pad press then
  // lands on "q"); opened by clicking the address field the field keeps it, because that is where a physical keyboard types.
  useEffect(() => {
    if (document.activeElement?.id !== "address") dialog.current?.focus();
  }, []);
  const target = state.keyboard?.target ?? "address";
  const suggestions = target === "address" ? state.suggestions : [];

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

  const submit = () => {
    if (target === "page") cmd({ type: "keyboard-submit" });
    else (document.getElementById("address") as HTMLInputElement | null)?.form?.requestSubmit();
  };

  const letter = (key: string) => (shift ? key.toUpperCase() : key);
  const [left, right] = SIDES[layer];

  return (
    <div ref={dialog} tabindex={-1} class="overlay bottom" id="keyboard" role="dialog" aria-label={tr("a11y.keyboard")} aria-describedby="keyboard-hint">
      <div class="keyboard" ref={panel}>
        <p id="keyboard-hint" class="sr-only">{tr("input.hint")}</p>

        {suggestions.length > 0 && (
          <div class="suggestions" role="listbox" aria-label={tr("input.suggestions")}>
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

        <div class="keys">
          <Key col={1} pad="layer" glyph={glyphs.layer} label={tr(LAYER_NAME[layer])} onPress={() => setLayer(NEXT_LAYER[layer])}>{LAYER_LABEL[layer]}</Key>
          {[..."1234567890"].map((digit) => <Key onPress={() => type(digit)}>{digit}</Key>)}
          <Key pad="delete" glyph={glyphs.reload} label={tr("input.delete")} onPress={backspace}>⌫</Key>

          {ROWS[layer].map((keys, row) => (
            <>
              {row === 2
                ? <Key col={1} pad="shift" glyph={glyphs.shift} label={tr("input.shift")} on={shift} onPress={() => setShift(!shift)}>⇧</Key>
                : <span class="key-gap" aria-hidden="true" />}
              {keys.map((key) => <Key start={key === "q"} onPress={() => type(letter(key))}>{letter(key)}</Key>)}
              {row === 2
                ? <Key pad="submit" glyph={glyphs.menu} label={tr("input.ok")} primary onPress={submit}>→</Key>
                : <span class="key-gap" aria-hidden="true" />}
            </>
          ))}

          <span class="key-gap" aria-hidden="true" />
          <Key span={2} onPress={() => type(left)}>{left}</Key>
          <Key span={6} pad="space" glyph={glyphs.keyboard} label={tr("input.space")} onPress={() => type(" ")}>␣</Key>
          <Key span={2} onPress={() => type(right)}>{right}</Key>
          <Key pad="close" glyph={glyphs.back} label={tr("nav.close")} onPress={() => cmd({ type: "keyboard-close" })}><CloseIcon size={18} /></Key>
        </div>
      </div>
    </div>
  );
}

/**
 * One key. `pad` names the controller shortcut that presses it (gamepad.ts clicks `[data-pad=…]`), and `glyph` is that
 * button as the connected controller labels it, drawn in the corner and hidden from screen readers: the key's own name
 * is what they read.
 */
function Key(props: {
  children: ComponentChildren; onPress: () => void; label?: string; pad?: string; glyph?: string;
  span?: number; col?: number; on?: boolean; primary?: boolean; start?: boolean;
}) {
  const style = props.span || props.col ? { gridColumn: `${props.col ?? "auto"} / span ${props.span ?? 1}` } : undefined;
  return (
    <button
      class={`key${props.on ? " on" : ""}${props.primary ? " primary" : ""}`}
      style={style}
      aria-label={props.label}
      aria-pressed={props.on}
      data-pad={props.pad}
      data-start={props.start ? "" : undefined}
      onClick={props.onPress}
    >
      <span class="key-label">{props.children}</span>
      {props.glyph && <span class="key-glyph" aria-hidden="true">{props.glyph}</span>}
    </button>
  );
}
