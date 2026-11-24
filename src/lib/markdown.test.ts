import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { markdownToText, readingMinutes, renderMarkdown, safeHref } from './markdown';

const html = (md: string) => renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(md)));

describe('markdown: estructura', () => {
  it('títulos, párrafos, listas, citas y separador', () => {
    const h = html('# Uno\n\n## Dos\n### Tres\n\nLínea a\nlínea b\n\n- x\n- y\n\n1. a\n2) b\n\n> cita\n> sigue\n\n---');
    expect(h).toContain('<h2 id="uno"');
    expect(h).toContain('<h2 id="dos"');
    expect(h).toContain('<h3 id="tres"');
    expect(h).toMatch(/<p[^>]*>Línea a línea b<\/p>/);
    expect(h).toMatch(/<ul[^>]*><li>x<\/li><li>y<\/li><\/ul>/);
    expect(h).toMatch(/<ol[^>]*><li>a<\/li><li>b<\/li><\/ol>/);
    expect(h).toMatch(/<blockquote[^>]*>cita sigue<\/blockquote>/);
    expect(h).toContain('<hr');
  });
  it('en línea: negrita, cursiva, código y enlaces anidados', () => {
    const h = html('Texto **fuerte con _énfasis_** y `código` y [la **web**](https://energysolec.com).');
    expect(h).toContain('<strong>fuerte con <em>énfasis</em></strong>');
    expect(h).toMatch(/<code[^>]*>código<\/code>/);
    expect(h).toMatch(/<a href="https:\/\/energysolec.com" target="_blank" rel="noopener noreferrer"[^>]*>la <strong>web<\/strong><\/a>/);
  });
  it('enlaces internos sin target y una imagen sola es figura', () => {
    expect(html('[Calcula](/calculadora)')).toMatch(/<a href="\/calculadora" class=/);
    expect(html('![Paneles en cubierta](/api/dev-media/blog/x.jpg)')).toMatch(/<figure[^>]*><img src="\/api\/dev-media\/blog\/x.jpg" alt="Paneles en cubierta"/);
  });
});

describe('markdown: seguridad', () => {
  it('el HTML del texto se escapa, nunca se interpreta', () => {
    const h = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(h).not.toMatch(/<script|<img src=x/);
    expect(h).toContain('&lt;script&gt;');
  });
  it('enlaces e imágenes con esquemas peligrosos quedan como texto', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.com/x', 'http://inseguro.com', 'vbscript:x']) {
      const h = html(`[clic](${u})\n\n![foto](${u})`);
      expect(h, u).not.toContain('href=');
      expect(h, u).not.toContain('<img');
    }
    expect(safeHref('mailto:info@energysolec.com')).toBe(true);
    expect(safeHref('tel:+593979655095')).toBe(true);
  });
});

describe('markdown: texto plano', () => {
  it('quita marcas y calcula tiempo de lectura', () => {
    expect(markdownToText('## Hola\n\n**Mundo** [enlace](/x) `c`')).toBe('Hola Mundo enlace c');
    expect(readingMinutes('palabra '.repeat(450))).toBe(2);
    expect(readingMinutes('corto')).toBe(1);
  });
});
