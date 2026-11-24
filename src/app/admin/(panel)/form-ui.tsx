/** Piezas de formulario compartidas por las pantallas de edición del panel. */
export const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
/** Clases del <input type=file> con botón oscuro. */
export const FILE_INPUT = 'block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-dark file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white';

export function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
export function Field({ id, label, hint, className = '', children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-8 w-8 place-items-center rounded-full border border-line text-sm hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-accent disabled:opacity-30">{children}</button>;
}
