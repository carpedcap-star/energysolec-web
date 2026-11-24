/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@react-pdf/renderer'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; },
};
