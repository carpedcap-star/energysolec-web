import { SOCIALS, type Contact } from '@/lib/services/site-settings';

/** Enlaces a redes sociales configuradas en el panel (solo URLs https validadas del dominio de cada red). */
export function SocialLinks({ socials, className = '' }: { socials: Contact['socials']; className?: string }) {
  const list = SOCIALS.filter((s) => socials[s.id]);
  if (!list.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-2 text-sm ${className}`} aria-label="Redes sociales">
      {list.map((s) => <li key={s.id}><a href={socials[s.id]} target="_blank" rel="noopener me" className="underline-offset-2 hover:text-brand hover:underline">{s.label}</a></li>)}
    </ul>
  );
}
