# Plataforma web — Energy Solutions Ecuador

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage) · @react-pdf/renderer · Resend · WhatsApp.

Sitio corporativo, calculadora solar con captación de leads y reporte PDF, tienda con pedidos por WhatsApp, CRM y panel administrativo con roles.

## Inicio rápido (local, sin Supabase)

```bash
npm install
cp .env.example .env.local        # deja vacías las variables de Supabase
echo "DEV_ADMIN_PASSWORD=una-clave-local" >> .env.local
npm run dev                        # http://localhost:3000
npm test                           # 22 pruebas del motor solar/financiero y de la tienda
```

Sin Supabase, los datos se guardan en `.data/dev-db.json` (solo desarrollo; en producción la app se niega a arrancar sin Supabase). El panel está en `/admin/login`: elige un rol de prueba y usa `DEV_ADMIN_PASSWORD`.

## Despliegue en producción

1. **Supabase** — sigue [docs/SUPABASE.md](docs/SUPABASE.md): crear y vincular el proyecto, `supabase db push`, datos iniciales, **desactivar los registros abiertos**, primer superadministrador y buckets. La misma guía explica cómo probar todo contra un Supabase local (`npm run test:supabase` y `npm run e2e:supabase`).
2. **Vercel** (recomendado) — importa el repositorio y define las variables de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (esta última **solo** servidor).
   - `APP_SECRET` (cadena aleatoria larga), `IP_HASH_SALT`, `NEXT_PUBLIC_SITE_URL=https://www.energysolec.com`.
   - `RESEND_API_KEY`, `EMAIL_FROM` (verifica el dominio en Resend: registros SPF/DKIM). El correo de avisos y los IDs de analítica se configuran en el panel (**Contacto e integraciones**).
   - `CRON_SECRET` (tareas diarias) y, si quieres la lectura de planillas, `ANTHROPIC_API_KEY`.
   - Antes del lanzamiento: `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (anti-spam; se activa solo con las dos).
   - Opcionales: `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_META_PIXEL_ID`.
3. **Dominio** — apunta `www.energysolec.com` a Vercel (CNAME) y redirige el dominio raíz. HTTPS es automático; HSTS ya está configurado en `next.config.mjs`.
4. **Copias de seguridad** — activa *Point-in-Time Recovery* en Supabase (plan Pro) o programa `pg_dump` diario.
5. Antes de publicar: completa la lista de `docs/DATOS_REQUERIDOS.md`, valida tarifas y parámetros en el panel y pasa la política de privacidad por revisión legal.

## Estructura

```
src/lib/engine/      Motor solar (solar.ts), recurso PVGIS/NASA (resource.ts), tarifas (tariff.ts),
                     finanzas (finance.ts), estudio completo (study.ts) y pruebas
src/lib/data/        Capa de datos: interfaz Store con implementación Supabase y de desarrollo
src/lib/services/    Correo (Resend), WhatsApp, carrito (precios recalculados en servidor)
src/lib/pdf/         Reporte PDF del estudio
src/app/api/         study, study/unlock, study/[code]/pdf, study/visit, leads, orders, track, admin/export
src/app/admin/       Panel: dashboard, CRM, pedidos, parámetros, tarifas, indicadores
supabase/            Migraciones (esquema + RLS) y datos iniciales
docs/                Arquitectura, motor de cálculo, manual de administración, datos requeridos, plan por fases
```

Documentación: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · [`docs/MOTOR_DE_CALCULO.md`](docs/MOTOR_DE_CALCULO.md) · [`docs/MANUAL_ADMIN.md`](docs/MANUAL_ADMIN.md) · [`docs/DATOS_REQUERIDOS.md`](docs/DATOS_REQUERIDOS.md) · [`docs/PLAN_POR_FASES.md`](docs/PLAN_POR_FASES.md)
