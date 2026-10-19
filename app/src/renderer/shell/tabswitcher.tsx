import { useEffect, useState } from "preact/hooks";
import type { TabState } from "../../shared/ipc";
import { bridge, cmd } from "./bridge";
import { CloseIcon } from "./icons";

/** Every tab as a card with a live thumbnail, the way a TV browser should switch tabs. */
export function TabSwitcher({ tabs, onClose }: { tabs: TabState[]; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    void bridge().thumbnails().then((list) => {
      if (!cancelled) setThumbs(Object.fromEntries(list.map((t) => [t.id, t.dataUrl])));
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div class="overlay center" role="dialog" aria-modal="true" aria-label="Abas" onClick={onClose}>
      <div class="tab-grid" onClick={(e) => e.stopPropagation()}>
        {tabs.map((tab) => (
          <div class={`tab-card ${tab.isActive ? "active" : ""} ${tab.sleeping ? "sleeping" : ""}`}>
            <button
              class="tab-open"
              onClick={() => { cmd({ type: "activate-tab", id: tab.id }); onClose(); }}
              aria-label={`Abrir ${tab.title}`}
            >
              <span class="thumb">
                {thumbs[tab.id] ? <img src={thumbs[tab.id]} alt="" /> : <span class="placeholder">{tab.sleeping ? "dormindo" : ""}</span>}
              </span>
              <span class="title">{tab.title}</span>
            </button>
            <button class="tab-close" aria-label="Fechar aba" onClick={() => cmd({ type: "close-tab", id: tab.id })}>
              <CloseIcon size={18} />
            </button>
          </div>
        ))}
        <button class="tab-card new" onClick={() => { cmd({ type: "new-tab" }); onClose(); }}>
          <span class="thumb">＋</span>
          <span class="title">Nova aba</span>
        </button>
      </div>
    </div>
  );
}
