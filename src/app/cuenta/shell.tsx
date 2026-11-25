export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <div className="card mx-auto max-w-md p-6 sm:p-8">
          <p className="eyebrow">Cuenta comercial</p>
          <h1 className="font-display mt-2 text-2xl font-extrabold">{title}</h1>
          {children}
        </div>
      </div>
    </section>
  );
}
