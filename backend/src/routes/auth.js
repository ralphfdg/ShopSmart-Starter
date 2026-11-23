import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { SESSION_COOKIE, cookieOptions, createSession, hashToken, readCookie } from '../lib/session.js';
import { loadUser, publicUser } from '../middleware/auth.js';
import { loginSchema } from '../validators/schemas.js';

// Checked when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash;

export function createAuthRouter(db) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_SIGN_IN_ATTEMPTS', message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } }
  });

  router.post('/login', loginLimiter, async (request, response, next) => {
    try {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_SIGN_IN', message: 'Enter your email address and password.' } });

      const user = await db.user.findUnique({ where: { email: parsed.data.email } });
      dummyHash ??= await hashPassword('not-a-real-password');
      const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });

      const { token, maxAge } = await createSession(db, user.id);
      response.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge });
      response.json({ user: publicUser(user) });
    } catch (error) { next(error); }
  });

  router.post('/logout', async (request, response, next) => {
    try {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
      response.clearCookie(SESSION_COOKIE, cookieOptions());
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.get('/me', loadUser(db), (request, response) => response.json({ user: request.user }));

  return router;
}
