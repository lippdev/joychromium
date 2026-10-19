import type { WebContents } from "electron";

/**
 * Text entry into the page for the controller keyboard: the on-screen keyboard drives the focused field of a web
 * page, which the shell cannot touch directly.
 */

const INSERT_SCRIPT = (text: string): string => {
  const literal = JSON.stringify(text);
  return `(() => {
    const text = ${literal};
    const field = document.activeElement;
    if (!field) return;
    if (field.isContentEditable) { document.execCommand(text === '' ? 'delete' : 'insertText', false, text === '' ? undefined : text); return; }
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const start = typeof field.selectionStart === 'number' ? field.selectionStart : field.value.length;
    const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start;
    const next = text === '' ? field.value.slice(0, Math.max(0, start - 1)) + field.value.slice(end) : field.value.slice(0, start) + text + field.value.slice(end);
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, next);
    const caret = text === '' ? Math.max(0, start - 1) : start + text.length;
    if (typeof field.setSelectionRange === 'function') field.setSelectionRange(caret, caret);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text === '' ? 'deleteContentBackward' : 'insertText', data: text === '' ? null : text }));
  })()`;
};

const SUBMIT_SCRIPT =
  "(() => { const f=document.activeElement; if(f && f.form && f.tagName !== 'TEXTAREA') f.form.requestSubmit(); else if(f) f.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()";

/** Types `text` into the focused field; an empty string is a backspace. */
export async function insertIntoPage(wc: WebContents | undefined, text: string): Promise<void> {
  if (!wc) return;
  await wc.executeJavaScript(INSERT_SCRIPT(text), true);
}

/** Submits the focused form, or sends Enter when the field is standalone. */
export async function submitPage(wc: WebContents | undefined): Promise<void> {
  if (!wc) return;
  await wc.executeJavaScript(SUBMIT_SCRIPT, true);
}

const MEDIA_SCRIPT: Record<string, string> = {
  toggle: `(() => {
    const media = [...document.querySelectorAll('video,audio')].filter((m) => !m.paused || m.readyState > 0);
    const target = media[0];
    if (!target) return;
    if (target.paused) void target.play(); else target.pause();
  })()`,
  next: `(() => { const next = document.querySelector('[aria-label*="ext"], .ytp-next-button'); if (next) next.click(); })()`,
  previous: `(() => { const back = document.querySelector('[aria-label*="revious"], .ytp-prev-button'); if (back) back.click(); })()`,
};

/** Play/pause and track skipping through the page's own media element and controls. */
export async function mediaControl(wc: WebContents | undefined, action: "toggle" | "next" | "previous"): Promise<void> {
  if (!wc) return;
  await wc.executeJavaScript(MEDIA_SCRIPT[action] ?? "", true).catch(() => undefined);
}
