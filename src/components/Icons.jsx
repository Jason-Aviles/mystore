export const Bag = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M6 8h12l1 13H5L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const Heart = ({ fill, ...p }) => fill
  ? <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 21s-7.5-4.7-9.6-9.2C.9 8.6 2.7 5 6.2 5c2.2 0 3.7 1.2 4.6 2.6.2.3.4.3.6 0C12.9 6.2 14.4 5 16.6 5c3.5 0 5.3 3.6 3.8 6.8C18.7 16.3 12 21 12 21z" /></svg>
  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M12 21s-7.5-4.7-9.6-9.2C.9 8.6 2.7 5 6.2 5c2.2 0 3.7 1.2 4.6 2.6.2.3.4.3.6 0C12.9 6.2 14.4 5 16.6 5c3.5 0 5.3 3.6 3.8 6.8C18.7 16.3 12 21 12 21z" /></svg>;
export const Menu = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
);
export const Lock = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="4" y="10" width="16" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
);
export const Check = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}><path d="M5 13l4 4L19 7" /></svg>
);
export const Bell = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const Shield = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
);

/* ---- Dark Divine brand marks (bespoke, serpent/venom identity) ---- */
// Rising serpent with a raised hood, eye, and forked tongue.
export const Serpent = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6 20.5c-1.6 0-2.6-1.2-2.6-2.7 0-2.1 2.1-3.1 4.6-3.1s4.6-1.1 4.6-3.3S10.7 6 8.6 6" />
    <path d="M8.6 6c0-1.8 1.5-3.1 3.3-3.1 2.1 0 3.5 1.6 3.5 3.6 0 1.3-.6 2.2-1.6 2.8" />
    <path d="M15.4 6.2l2-.5M15.2 4.7l1.9-1.3" />
    <circle cx="12.7" cy="5.5" r=".8" fill="currentColor" stroke="none" />
  </svg>
);
// Divine crown — the other half of the name.
export const Crown = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 8l3.6 3.2L12 4.5l5.4 6.7L21 8l-1.6 10.5H4.6L3 8z" />
    <path d="M4.8 18.5h14.4" />
  </svg>
);
// Venom drop — an accent/bullet for lists and moments of texture.
export const VenomDrop = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}>
    <path d="M12 3s6 6.7 6 10.8a6 6 0 0 1-12 0C6 9.7 12 3 12 3z" />
    <path d="M9.6 14.2A2.4 2.4 0 0 0 12 16.6" strokeWidth="1.2" strokeLinecap="round" opacity=".65" />
  </svg>
);
// Fangs with venom drip — a sharper brand accent.
export const Fang = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 5.5c3 1.1 5.3 1.4 8 1.4s5-.3 8-1.4" />
    <path d="M8 6.6c.2 4-1 6.4-2.4 9.4M16 6.6c-.2 4 1 6.4 2.4 9.4" />
  </svg>
);
export const Truck = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M1 5h14v11H1zM15 9h4l4 4v3h-8" /><circle cx="6" cy="18.5" r="1.8" /><circle cx="18" cy="18.5" r="1.8" /></svg>
);
export const Search = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.8-4.8" /></svg>
);
export const Swap = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" /></svg>
);
