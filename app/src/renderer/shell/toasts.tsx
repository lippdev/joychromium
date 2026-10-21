import { useEffect, useState } from "preact/hooks";

/**
 * Short messages that fade on their own, shown inside the address bar: the page is a native view above the shell, so
 * anything the shell drew over it would never be seen.
 */
export function Toasts({ status }: { status: string }) {
  const [shown, setShown] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    if (!status) return;
    const id = Date.now() + Math.random();
    setShown([{ id, text: status }]);
    const timer = setTimeout(() => setShown((list) => list.filter((t) => t.id !== id)), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <div class="toasts" role="status" aria-live="polite">
      {shown.map((t) => <div class="toast" key={t.id}>{t.text}</div>)}
    </div>
  );
}
