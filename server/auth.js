import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [salt, hash] = encoded.split(':');
  if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  const candidate = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

export function publicUser(user) {
  return user
    ? { name: user.name, email: user.email, role: user.role, membership: user.membership, avatar_url: user.avatar_url || '' }
    : null;
}
