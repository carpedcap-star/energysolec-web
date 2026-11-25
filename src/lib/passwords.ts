import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Contraseñas de usuarios de desarrollo (scrypt). En Supabase las gestiona Auth.
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return ['scrypt', salt.toString('base64'), hash.toString('base64')].join(':');
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split(':');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = await scrypt(pw, Buffer.from(salt, 'base64'), 64), b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}
