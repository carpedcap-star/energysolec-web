import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { deactivateTariffAction } from '../../../actions';
import { TariffForm } from '../tariff-form';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar tarifa', description: 'Edición de tarifa eléctrica', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('tariffs');
  const { id } = await params;
  const t = (await getStore().listTariffs()).find((x) => x.id === id);
  if (!t) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/tarifas" className="hover:underline">Tarifas eléctricas</Link> / {t.code}</nav>
      <h1 className="text-2xl font-bold">{t.code} <span className="text-base font-normal text-muted">· {t.name}</span></h1>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados. La calculadora ya usa esta versión de la tarifa.</p>}
      <TariffForm key={JSON.stringify(t)} tariff={t} />
      <DeleteRecord action={deactivateTariffAction.bind(null, id)} name={t.code} title="Desactivar tarifa"
        confirmText={`¿Desactivar la tarifa ${t.code}? Dejará de ofrecerse en la calculadora.`}
        note="Deja de ofrecerse en la calculadora; los estudios ya calculados con ella no cambian." />
    </div>
  );
}
