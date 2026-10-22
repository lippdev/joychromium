import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";

type State = { kind: "idle" | "loading" } | { kind: "error"; message: string } | { kind: "done"; position: number; already: boolean };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SignupForm({ id }: { id: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [honeypot, setHoneypot] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) return setState({ kind: "error", message: "Confira o e-mail: algo como voce@exemplo.com." });
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, website: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu para enviar. Tente de novo.");
      setState({ kind: "done", position: data.position, already: data.already });
    } catch (error) {
      const message = error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Sem conexão. Tente de novo.";
      setState({ kind: "error", message });
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.kind === "done" ? (
        <motion.div
          key="done"
          className="signup-done"
          role="status"
          initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", bounce: 0, duration: 0.6 }}
        >
          <span className="done-check" aria-hidden="true">✓</span>
          <div>
            <strong>{state.already ? "Você já está na lista." : "Você está dentro."}</strong>
            {state.position > 0 && <span> Sua posição na fila do beta: <b>nº {state.position}</b>.</span>}
            <span> O convite chega por e-mail quando a próxima build sair.</span>
          </div>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          className="signup"
          data-state={state.kind}
          onSubmit={submit}
          noValidate
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          <label className="sr-only" htmlFor={`email-${id}`}>Seu e-mail</label>
          <input
            id={`email-${id}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            aria-invalid={state.kind === "error"}
            aria-describedby={`msg-${id}`}
            onChange={(e) => { setEmail(e.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
          />
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          <button type="submit" disabled={state.kind === "loading"}>
            {state.kind === "loading" ? <span className="spinner" aria-label="Enviando" /> : "Quero testar"}
          </button>
          <p className="signup-msg" id={`msg-${id}`} role="alert">{state.kind === "error" ? state.message : ""}</p>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
