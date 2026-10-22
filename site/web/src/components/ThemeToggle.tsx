import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Moon by day, sun by night, as on Zen's header. The choice is remembered; until then the system decides. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    // Follow the system while the visitor has not picked a side.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("theme"); } catch { /* private mode */ }
      if (!saved) apply(mq.matches ? "dark" : "light", false);
    };
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, []);

  function apply(next: Theme, remember: boolean) {
    document.documentElement.dataset.theme = next;
    if (remember) try { localStorage.setItem("theme", next); } catch { /* private mode */ }
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={dark ? "Mudar para o modo claro" : "Mudar para o modo noturno"}
      aria-pressed={dark}
      title={dark ? "Modo claro" : "Modo noturno"}
      onClick={() => apply(dark ? "light" : "dark", true)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg
          key={theme}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {dark ? (
            <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>
          ) : (
            <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
          )}
        </motion.svg>
      </AnimatePresence>
    </button>
  );
}
