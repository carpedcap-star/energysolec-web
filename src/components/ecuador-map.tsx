// Mapa del Ecuador simplificado: proyección lineal lat/lng → SVG, sin dependencias ni claves de API.
// Continente en el área principal y Galápagos en un recuadro.
const MAIN = { minLng: -81.2, maxLng: -75.1, minLat: -5.1, maxLat: 1.6, x: 0, y: 0, w: 400, h: 440 };
const GALAPAGOS = { minLng: -92.1, maxLng: -89.1, minLat: -1.5, maxLat: 0.7, x: 8, y: 8, w: 92, h: 70 };
type Box = typeof MAIN;
const inBox = (b: Box, lat: number, lng: number) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
const proj = (b: Box, lat: number, lng: number) => [b.x + ((lng - b.minLng) / (b.maxLng - b.minLng)) * b.w, b.y + ((b.maxLat - lat) / (b.maxLat - b.minLat)) * b.h];

/** Coordenadas SVG del punto, o null si queda fuera del Ecuador. */
export function mapXY(lat: number, lng: number): [number, number] | null {
  if (inBox(GALAPAGOS, lat, lng)) return proj(GALAPAGOS, lat, lng) as [number, number];
  if (inBox(MAIN, lat, lng)) return proj(MAIN, lat, lng) as [number, number];
  return null;
}

export type MapPoint = { id: string; lat: number; lng: number; label: string; href?: string; r?: number };

export function EcuadorMap({ points, label, className = '' }: { points: MapPoint[]; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 400 440" className={`w-full rounded-xl bg-surface ${className}`} role="img" aria-label={label}>
      <path d="M60 40 L150 20 L230 35 L300 60 L380 80 L395 150 L360 230 L330 300 L300 380 L250 430 L200 420 L170 380 L120 360 L80 320 L40 290 L20 230 L35 170 L25 110 Z" fill="#ece9e4" stroke="#d6d2cc" />
      <rect x={GALAPAGOS.x} y={GALAPAGOS.y} width={GALAPAGOS.w} height={GALAPAGOS.h} rx="6" fill="#f5f3ef" stroke="#d6d2cc" strokeDasharray="3 3" />
      <text x={GALAPAGOS.x + 6} y={GALAPAGOS.y + GALAPAGOS.h - 6} fontSize="10" fill="#6b6767">Galápagos</text>
      {points.map((p) => {
        const xy = mapXY(p.lat, p.lng);
        if (!xy) return null;
        const dot = <circle cx={xy[0]} cy={xy[1]} r={p.r ?? 7} fill="#FDC913" stroke="#282626" strokeWidth="1.5"><title>{p.label}</title></circle>;
        return p.href ? <a key={p.id} href={p.href} aria-label={p.label}>{dot}</a> : <g key={p.id}>{dot}</g>;
      })}
    </svg>
  );
}
