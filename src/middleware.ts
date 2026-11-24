import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Refresca la sesión de Supabase en rutas del panel. La autorización real se hace en servidor (requireStaff) y en la RLS. */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return res;
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) },
  });
  await sb.auth.getUser();
  return res;
}
export const config = { matcher: ['/admin/:path*'] };
