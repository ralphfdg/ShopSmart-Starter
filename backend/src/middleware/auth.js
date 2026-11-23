import { SESSION_COOKIE, hashToken, readCookie } from '../lib/session.js';

export const publicUser = ({ id, email, name }) => ({ id, email, name });

// Sets request.user to the signed-in customer, or null for a guest.
export function loadUser(db) {
  return async (request, _response, next) => {
    request.user = null;
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) return next();
    try {
      const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
      if (session && session.expiresAt > new Date()) request.user = publicUser(session.user);
      next();
    } catch (error) { next(error); }
  };
}

export function requireUser(request, response, next) {
  if (!request.user) return response.status(401).json({ error: { code: 'SIGN_IN_REQUIRED', message: 'Please sign in to continue.' } });
  next();
}
