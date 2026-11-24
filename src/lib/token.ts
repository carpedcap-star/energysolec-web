import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const s = process.env.APP_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('APP_SECRET no configurado');
  return s ?? 'dev-only-secret';
};
/** Token de acceso a un estudio desbloqueado (enlace del correo y descarga del PDF). */
export const studyToken = (code: string) => createHmac('sha256', secret()).update(`study:${code}`).digest('base64url').slice(0, 32);
export function checkStudyToken(code: string, token: string | null) {
  if (!token) return false;
  const a = Buffer.from(studyToken(code)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
