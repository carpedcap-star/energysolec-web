import type { ReactNode } from 'react';

/**
 * Markdown → elementos de React (subconjunto para el blog). Nunca genera HTML crudo ni usa
 * dangerouslySetInnerHTML: el texto lo escapa React, así que un artículo no puede inyectar scripts.
 *
 * Bloques: ## y ### (un # se trata como ##), párrafos, listas (-, *, 1.), citas (>), imagen sola en
 * su línea ![alt](url) y separador ---. En línea: **negrita**, *cursiva* o _cursiva_, `código`, [texto](url).
 * Enlaces: https, mailto, tel o rutas internas (/...). Imágenes: https o rutas internas. Lo demás queda como texto.
 */

export const safeHref = (u: string) => /^(https:\/\/|mailto:|tel:)[^\s<>"]+$/i.test(u) || /^\/(?!\/)[^\s<>"]*$/.test(u);
export const safeImgSrc = (u: string) => /^https:\/\/[^\s<>"]+$/i.test(u) || /^\/(?!\/)[^\s<>"]*$/.test(u);
const isExternal = (u: string) => /^https:\/\//i.test(u);
export const headingId = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// ---------------------------------------------------------------- En línea
const INLINE = /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)\s]+?)\))|(\*([^*\s][^*]*?)\*)|(_([^_\s][^_]*?)_)/;

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text, k = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) out.push(<strong key={key}>{renderInline(m[2], key)}</strong>);
    else if (m[3]) out.push(<code key={key} className="rounded bg-surface px-1.5 py-0.5 text-[0.92em]">{m[4]}</code>);
    else if (m[5]) {
      const [label, url] = [m[6], m[7]];
      out.push(safeHref(url)
        ? <a key={key} href={url} {...(isExternal(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="text-brand-accent underline underline-offset-2">{renderInline(label, key)}</a>
        : <span key={key}>{label}</span>);
    } else if (m[8]) out.push(<em key={key}>{renderInline(m[9], key)}</em>);
    else if (m[10]) out.push(<em key={key}>{renderInline(m[11], key)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// ---------------------------------------------------------------- Bloques
type Block =
  | { t: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'img'; alt: string; src: string }
  | { t: 'hr' };

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { flush(); blocks.push({ t: m[1].length === 3 ? 'h3' : 'h2', text: m[2] }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flush(); blocks.push({ t: 'img', alt: m[1], src: m[2] }); continue; }
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      flush();
      const ordered = /^\d/.test(line);
      const re = ordered ? /^\d+[.)]\s+(.*)$/ : /^[-*]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i].trim())) { items.push(lines[i].trim().match(re)![1]); i++; }
      i--;
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      i--;
      blocks.push({ t: 'quote', text: q.join(' ') });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function renderMarkdown(md: string): ReactNode {
  return parseBlocks(md).map((b, i) => {
    const k = `b${i}`;
    switch (b.t) {
      case 'h2': return <h2 key={k} id={headingId(b.text)} className="font-display mt-10 scroll-mt-24 text-2xl font-bold">{renderInline(b.text, k)}</h2>;
      case 'h3': return <h3 key={k} id={headingId(b.text)} className="mt-8 scroll-mt-24 text-xl font-semibold">{renderInline(b.text, k)}</h3>;
      case 'p': return <p key={k} className="mt-5 leading-relaxed">{renderInline(b.text, k)}</p>;
      case 'quote': return <blockquote key={k} className="mt-6 border-l-4 border-brand pl-5 italic text-muted">{renderInline(b.text, k)}</blockquote>;
      case 'ul': return <ul key={k} className="mt-5 list-disc space-y-2 pl-6">{b.items.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ul>;
      case 'ol': return <ol key={k} className="mt-5 list-decimal space-y-2 pl-6">{b.items.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ol>;
      case 'hr': return <hr key={k} className="my-10 border-line" />;
      case 'img': return safeImgSrc(b.src)
        ? <figure key={k} className="mt-8"><img src={b.src} alt={b.alt} loading="lazy" className="w-full rounded-2xl" />{b.alt && <figcaption className="mt-2 text-center text-sm text-muted">{b.alt}</figcaption>}</figure>
        : <p key={k} className="mt-5 leading-relaxed">{b.alt}</p>;
    }
  });
}

/** Texto plano (para extractos y conteo de palabras). */
export const markdownToText = (md: string) =>
  parseBlocks(md).map((b) => ('text' in b ? b.text : 'items' in b ? b.items.join(' ') : 'alt' in b ? b.alt : ''))
    .join(' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

/** Solo el texto de los párrafos (sin títulos, listas ni imágenes): base del extracto automático. */
export const paragraphsText = (md: string) =>
  parseBlocks(md).filter((b): b is { t: 'p'; text: string } => b.t === 'p').map((b) => b.text).join(' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

export const readingMinutes = (md: string) => Math.max(1, Math.round(markdownToText(md).split(' ').filter(Boolean).length / 200));
