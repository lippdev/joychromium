import { useEffect, useRef, useState } from "preact/hooks";
import type { TabState } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import { bridge, cmd } from "./bridge";
import { CloseIcon } from "./icons";

/** Every tab as a card with a live thumbnail, the way a TV browser should switch tabs. */
export function TabSwitcher({ tabs, language, onClose }: { tabs: TabState[]; language: string; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const grid = useRef<HTMLDivElement>(null);

  // A controller opens this with A, so the active tab takes focus and A again switches to it.
  useEffect(() => {
    const open = grid.current?.querySelector<HTMLButtonElement>(".tab-card.active .tab-open") ?? grid.current?.querySelector<HTMLButtonElement>(".tab-open");
    open?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void bridge().thumbnails().then((list) => {
      if (!cancelled) setThumbs(Object.fromEntries(list.map((t) => [t.id, t.dataUrl])));
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label={t(language, "nav.tabs")} onClick={onClose}>
      <div class="tab-grid" ref={grid} onClick={(e) => e.stopPropagation()}>
        {tabs.map((tab) => (
          <div class={`tab-card ${tab.isActive ? "active" : ""} ${tab.sleeping ? "sleeping" : ""}`}>
            <button
              class="tab-open"
              onClick={() => { cmd({ type: "activate-tab", id: tab.id }); onClose(); }}
              aria-label={tab.title || tab.url}
              aria-current={tab.isActive ? "page" : undefined}
            >
              <span class="thumb">
                {thumbs[tab.id] ? <img src={thumbs[tab.id]} alt="" /> : <span class="placeholder">{tab.sleeping ? t(language, "tabs.sleeping") : ""}</span>}
              </span>
              <span class="title">{tab.title}</span>
            </button>
            <button class="tab-close" aria-label={t(language, "tabs.close")} onClick={() => cmd({ type: "close-tab", id: tab.id })}>
              <CloseIcon size={18} />
            </button>
          </div>
        ))}
        <button class="tab-card new" onClick={() => { cmd({ type: "new-tab" }); onClose(); }}>
          <span class="thumb">＋</span>
          <span class="title">{t(language, "tabs.new")}</span>
        </button>
      </div>
    </div>
  );
}
