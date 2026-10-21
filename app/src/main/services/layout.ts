import type { Tab } from "../tabs";

/** Where the tab views go: below the chrome, above the controller keyboard while it is open. */
export interface LayoutInsets {
  top: number;
  bottom: number;
}

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounds for the tab views, or undefined when the window has no size yet. Pure so it can be unit tested. */
export function tabViewBounds(size: { width: number; height: number }, insets: LayoutInsets, chromeVisible: boolean): ViewBounds {
  const top = chromeVisible ? insets.top : 0;
  // The keyboard sits over the page whether or not the chrome is showing, so its room is kept either way.
  const bottom = insets.bottom;
  return { x: 0, y: top, width: size.width, height: Math.max(0, size.height - top - bottom) };
}

export interface LayoutHost {
  readonly window: { getContentSize(): number[]; isFullScreen(): boolean; setFullScreen(on: boolean): void };
  readonly tabs: { tabs: Tab[] };
  chromeVisible: boolean;
}

/** Keeps the tab views under the chrome and in step with fullscreen, page fullscreen and TV/window mode. */
export class WindowLayout {
  insets: LayoutInsets = { top: 90, bottom: 0 };

  constructor(private readonly host: LayoutHost) {}

  apply(): void {
    const [width, height] = this.host.window.getContentSize();
    const bounds = tabViewBounds({ width: width ?? 0, height: height ?? 0 }, this.insets, this.host.chromeVisible);
    for (const tab of this.host.tabs.tabs) if (!tab.sleeping) tab.view.setBounds(bounds);
  }

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    this.apply();
  }

  /** Hides the chrome over the page and leaves fullscreen when it comes back. */
  setChromeVisible(visible: boolean, stayFullscreen: () => boolean): void {
    this.host.chromeVisible = visible;
    if (!visible && !this.host.window.isFullScreen()) this.host.window.setFullScreen(true);
    if (visible && this.host.window.isFullScreen() && !stayFullscreen()) this.host.window.setFullScreen(false);
    this.apply();
  }

  applyMode(tv: boolean): void {
    if (tv && !this.host.window.isFullScreen()) this.host.window.setFullScreen(true);
    if (!tv && this.host.window.isFullScreen()) this.host.window.setFullScreen(false);
  }
}
