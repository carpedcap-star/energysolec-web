'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/data/types';
import { fmtKwp } from '@/lib/format';
import { EcuadorMap } from './ecuador-map';

export function ProjectsBrowser({ projects }: { projects: Project[] }) {
  const [seg, setSeg] = useState(''), [prov, setProv] = useState(''), [year, setYear] = useState(''), [type, setType] = useState(''), [tech, setTech] = useState(''), [cap, setCap] = useState('');
  const opts = (k: (p: Project) => string | null | undefined) => [...new Set(projects.map(k).filter(Boolean))] as string[];
  const years = opts((p) => p.executed_on?.slice(0, 4));
  const list = useMemo(() => projects.filter((p) =>
    (!seg || p.segment === seg) && (!prov || p.province === prov) && (!year || p.executed_on?.startsWith(year)) && (!type || p.installation_type === type)
    && (!tech || p.technology.includes(tech)) && (!cap || (cap === 's' ? (p.capacity_kwp ?? 0) < 100 : cap === 'm' ? (p.capacity_kwp ?? 0) >= 100 && (p.capacity_kwp ?? 0) < 1000 : (p.capacity_kwp ?? 0) >= 1000))), [projects, seg, prov, year, type, tech, cap]);
  const mapped = list.filter((p) => p.location_authorized && p.lat != null && p.lng != null);
  const Sel = ({ v, on, label, items }: { v: string; on: (x: string) => void; label: string; items: [string, string][] }) => (
    <select className="input !w-auto" value={v} onChange={(e) => on(e.target.value)} aria-label={label}><option value="">{label}</option>{items.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
  );
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Sel v={seg} on={setSeg} label="Segmento" items={[['residencial', 'Residencial'], ['comercial', 'Comercial'], ['industrial', 'Industrial']]} />
        <Sel v={cap} on={setCap} label="Capacidad" items={[['s', '< 100 kWp'], ['m', '100 kWp – 1 MWp'], ['l', '≥ 1 MWp']]} />
        <Sel v={prov} on={setProv} label="Provincia" items={opts((p) => p.province).map((x) => [x, x])} />
        <Sel v={type} on={setType} label="Tipo de instalación" items={opts((p) => p.installation_type).map((x) => [x, x])} />
        <Sel v={tech} on={setTech} label="Tecnología" items={[...new Set(projects.flatMap((p) => p.technology))].map((x) => [x, x])} />
        <Sel v={year} on={setYear} label="Año" items={years.map((x) => [x, x])} />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-5 sm:grid-cols-2">
          {list.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.slug}`} className="card group overflow-hidden">
              <div className="aspect-[16/10] bg-brand-dark bg-cover bg-center" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} />
              <div className="p-5"><p className="text-xs uppercase tracking-wider text-muted">{p.segment}{p.province ? ` · ${p.province}` : ''}</p><p className="font-display mt-1 text-lg font-bold">{p.title}</p>{p.capacity_kwp && <p className="mt-1 text-sm text-brand-accent">{fmtKwp(p.capacity_kwp)}</p>}</div>
            </Link>
          ))}
          {!list.length && <p className="text-muted">Sin proyectos con esos filtros.</p>}
        </div>
        <div className="card self-start p-5 lg:sticky lg:top-24">
          <p className="mb-3 text-sm font-semibold">Mapa de proyectos (ubicaciones autorizadas)</p>
          <EcuadorMap label="Mapa de proyectos en Ecuador" points={mapped.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.title, href: `/proyectos/${p.slug}`, r: Math.max(5, Math.min(14, Math.sqrt(p.capacity_kwp ?? 25))) }))} />
          {!mapped.length && <p className="mt-3 text-xs text-muted">Aún no hay ubicaciones autorizadas para mostrar.</p>}
        </div>
      </div>
    </>
  );
}
