// Iconografía propia de línea (1.6 px), coherente con el isotipo del logotipo.
type P = { className?: string };
const S = (p: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={p.className ?? 'h-6 w-6'} aria-hidden>{p.children}</svg>
);
export const IconPanel = (p: P) => <S {...p}><path d="M3 17 6 7h15l-3 10H3Z" /><path d="M4.5 12h15M9 7l-2 10M14 7l-2 10" /><path d="M10 17v3M8 20h4" /></S>;
export const IconBattery = (p: P) => <S {...p}><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10v4M11 9l-2 3h4l-2 3" /></S>;
export const IconBolt = (p: P) => <S {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></S>;
export const IconHome = (p: P) => <S {...p}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="m10 20 0-5h4v5" /></S>;
export const IconBuilding = (p: P) => <S {...p}><path d="M4 21V5l8-2v18M12 8h8v13" /><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20" /></S>;
export const IconFactory = (p: P) => <S {...p}><path d="M2 21V10l6 4V10l6 4V6l4-3v18" /><path d="M2 21h20M6 17h2M11 17h2M16 17h2" /></S>;
export const IconChart = (p: P) => <S {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-7" /></S>;
export const IconShield = (p: P) => <S {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></S>;
export const IconCart = (p: P) => <S {...p}><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></S>;
export const IconCalc = (p: P) => <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2" /></S>;
export const IconArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const IconMenu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconLeaf = (p: P) => <S {...p}><path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z" /><path d="M5 19 13 11" /></S>;
export const IconWhatsapp = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className ?? 'h-6 w-6'} fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" /></svg>
);
