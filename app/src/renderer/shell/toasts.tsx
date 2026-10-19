import { useEffect, useState } from "preact/hooks";

/** Short messages that fade on their own, so the TV screen is not covered by a permanent status line. */
export function Toasts({ status }: { status: string }) {
  const [shown, setShown] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    if (!status) return;
    const id = Date.now() + Math.random();
    setShown((list) => [...list.slice(-2), { id, text: status }]);
    const timer = setTimeout(() => setShown((list) => list.filter((t) => t.id !== id)), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <div class="toasts" role="status" aria-live="polite">
      {shown.map((t) => <div class="toast" key={t.id}>{t.text}</div>)}
    </div>
  );
}
