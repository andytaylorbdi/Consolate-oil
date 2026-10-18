import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/client.ts';
import { authSessions, users } from '../db/schema.ts';
import { eq, and, gt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'consolate_session';
export const SESSION_DURATION_HOURS = 24;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'WORKER' | 'ADMIN';
  isActive: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}

/**
 * Determine cookie options according to the request environment.
 * If running in HTTPS (Cloud Run, AI Studio proxy, x-forwarded-proto), SameSite=None and Secure=true
 * are required for iframe / cross-site contexts. In plain HTTP dev, SameSite=Lax and Secure=false.
 */
export function getSessionCookieOptions(req?: Request) {
  const isHttps =
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
}

/**
 * Creates a server-side session in database and attaches secure HTTP-only cookie.
 */
export async function createSession(userId: string, res: Response, req?: Request): Promise<string> {
  const { db } = await getDatabase();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  const cookieOptions = getSessionCookieOptions(req);

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    ...cookieOptions,
    expires: expiresAt,
  });

  return sessionId;
}

/**
 * Destroys a session in database and clears the HTTP-only cookie.
 */
export async function destroySession(sessionId: string | undefined, res: Response, req?: Request): Promise<void> {
  if (sessionId) {
    const { db } = await getDatabase();
    await db.delete(authSessions).where(eq(authSessions.id, sessionId));
  }

  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
}

/**
 * Express middleware to authenticate request from HTTP-only session cookie or Bearer header.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Check cookie first
  let sessionId = req.cookies?.[SESSION_COOKIE_NAME];

  // If cookie was not received (e.g. strict iframe browser partition), check Authorization header
  if (!sessionId && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7).trim();
    }
  }

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Session invalide ou expirée. Veuillez vous connecter.' },
    });
  }

  try {
    const { db } = await getDatabase();
    const now = new Date();

    const result = await db
      .select({
        session: authSessions,
        user: users,
      })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, now)));

    if (result.length === 0) {
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Session expirée. Veuillez vous reconnecter.' },
      });
    }

    const { user } = result[0];

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Ce compte utilisateur a été désactivé.' },
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
    req.sessionId = sessionId;

    next();
  } catch (error) {
    console.error('[AUTH MIDDLEWARE] Error verifying session:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: "Erreur lors de l'authentification." },
    });
  }
}

/**
 * Middleware ensuring only ADMIN role can proceed.
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs.' },
    });
  }
  next();
}

/**
 * Middleware ensuring WORKER role can proceed.
 */
export function requireWorker(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Non authentifié.' },
    });
  }
  next();
}
