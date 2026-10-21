/** Line icons drawn in the browser (Lucide, ISC licence) so every platform gets the same shapes. */
type Props = { size?: number; class?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round" as const,
  "stroke-linejoin": "round" as const,
  "aria-hidden": true,
});

export const BackIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M15 18l-6-6 6-6" /></svg>
);
export const ForwardIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M9 18l6-6-6-6" /></svg>
);
export const ReloadIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
);
export const HomeIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const SearchIcon = ({ size = 20, class: c }: Props) => (
  <svg {...base(size)} class={c}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const StarIcon = ({ size = 22, class: c, filled = false }: Props & { filled?: boolean }) => (
  <svg {...base(size)} class={c} fill={filled ? "currentColor" : "none"}><path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.4 6.5 20.2l1.1-6.2L3 9.6l6.3-.9z" /></svg>
);
export const SettingsIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z" /></svg>
);
export const TabsIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><rect x="3" y="6" width="13" height="13" rx="2" /><path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3H19a2 2 0 0 1 2 2v9.2A1.8 1.8 0 0 1 19.2 16H18" /></svg>
);
export const MenuIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
export const CloseIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const VolumeIcon = ({ size = 20, class: c, muted = false }: Props & { muted?: boolean }) => (
  <svg {...base(size)} class={c}><path d="M11 5 6.5 9H3v6h3.5L11 19z" />{muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" /></>}</svg>
);
export const PlusIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M12 5v14M5 12h14" /></svg>
);
export const MinimizeIcon = ({ size = 12, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M4 12h16" /></svg>
);
export const MaximizeIcon = ({ size = 12, class: c }: Props) => (
  <svg {...base(size)} class={c}><rect x="4" y="4" width="16" height="16" rx="1" /></svg>
);
export const TvIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 21h8" /></svg>
);
export const PictureInPictureIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="12" width="8" height="6" rx="1" /></svg>
);
export const FullscreenIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
);
export const KeyboardIcon = ({ size = 22, class: c }: Props) => (
  <svg {...base(size)} class={c}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>
);
export const ShieldIcon = ({ size = 20, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z" /></svg>
);
export const GamepadIcon = ({ size = 20, class: c }: Props) => (
  <svg {...base(size)} class={c}><path d="M6 8h12a4 4 0 0 1 3.9 4.9l-.6 2.8A2.6 2.6 0 0 1 16 17l-1.5-1.5h-5L8 17a2.6 2.6 0 0 1-5.3-1.3l-.6-2.8A4 4 0 0 1 6 8z" /><path d="M8 11v2M7 12h2M15.5 12h.01M17.5 13.5h.01" /></svg>
);
export const GlobeIcon = ({ size = 16, class: c }: Props) => (
  <svg {...base(size)} class={c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
);

/** The caption buttons Windows 11 and Edge draw: hairline glyphs on a 10px grid. */
const caption = { width: 10, height: 10, viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", "stroke-width": 1, "aria-hidden": true };
export const CaptionMinimizeIcon = () => <svg {...caption}><path d="M0 5.5h10" /></svg>;
export const CaptionMaximizeIcon = () => <svg {...caption}><rect x="0.5" y="0.5" width="9" height="9" rx="1" /></svg>;
export const CaptionCloseIcon = () => <svg {...caption}><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg>;
