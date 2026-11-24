import { notFound } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { checkStudyToken } from '@/lib/token';
import { StudyResults } from '@/components/calculator/results';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu estudio solar', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params; const { t } = await searchParams;
  if (!checkStudyToken(code, t ?? null)) notFound();
  const study = await getStore().getStudyByCode(code);
  if (!study?.unlocked) notFound();
  return <section className="pb-24 pt-32"><div className="container-site max-w-5xl"><StudyResults r={study.results} code={code} token={t!} /></div></section>;
}
