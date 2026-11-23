import crypto from 'node:crypto';

export const SESSION_COOKIE = 'shopsmart_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Only a hash of the token is stored, so a database leak does not reveal usable sessions.
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

// HttpOnly: page scripts cannot read it. Secure in production: only sent over HTTPS.
// SameSite=Lax: other websites cannot make the browser send it with their POST requests.
export function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
}

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) } });
  return { token, maxAge: SESSION_MAX_AGE_MS };
}
