// The app's own pointer shapes (app/src/assets/spatial.js): an arrow, and a hand over anything clickable.
export const Arrow = () => (
  <svg width="24" height="34" viewBox="0 0 20 28" aria-hidden="true">
    <path d="M2 2 L2 22.5 L7.3 17.6 L10.9 25.8 L14.3 24.3 L10.8 16.3 L17.8 16.3 Z" fill="#fff" stroke="#000" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

export const Hand = () => (
  <svg width="30" height="35" viewBox="0 0 26 30" aria-hidden="true">
    <path
      d="M10 1.6c1.1 0 2 .9 2 2v8.6h.6v-1.8c0-1.1.9-2 2-2s2 .9 2 2v2.2h.4v-1.4c0-1.1.9-2 2-2s2 .9 2 2v2h.3c0-1.1.9-2 2-2s2 .9 2 2V19c0 5.2-3.4 9.4-8.8 9.4h-1.7c-3.1 0-5.2-1.5-6.9-3.8L2 17.6c-.7-1-.5-2.4.5-3.1 1-.7 2.4-.5 3.1.5L8 18.4V3.6c0-1.1.9-2 2-2z"
      fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"
    />
    <path d="M12 12.2V16.5M16.6 12.6V16.5M21 13.2V16.5" stroke="#000" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
