import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { ProjectsBrowser } from '@/components/projects-browser';

export const metadata: Metadata = { title: 'Proyectos fotovoltaicos ejecutados en Ecuador', description: 'Portafolio de proyectos solares residenciales, comerciales e industriales de Energy Solutions Ecuador.', alternates: { canonical: '/proyectos' } };
export const revalidate = 300;

export default async function Page() {
  const projects = await getStore().listProjects();
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <p className="eyebrow">Portafolio</p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Proyectos ejecutados</h1>
        <p className="mt-3 max-w-2xl text-muted">Solo publicamos información, ubicaciones y cifras autorizadas por nuestros clientes.</p>
        <div className="mt-10">
          {projects.length ? <ProjectsBrowser projects={projects} /> : <div className="card p-10 text-center text-muted">Estamos documentando nuestros proyectos con la autorización de cada cliente. Muy pronto podrás verlos aquí.</div>}
        </div>
      </div>
    </section>
  );
}
