import { Router, Response } from 'express';
import { getDatabase } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { verifyPassword, verifyAdminPin } from '../auth/password.ts';
import {
  createSession,
  destroySession,
  requireAuth,
  AuthenticatedRequest,
} from '../middleware/auth.ts';
import { validateBody, loginSchema, adminPinSchema } from '../validators/index.ts';
import { eq } from 'drizzle-orm';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Real login with email + password, setting HTTP-only cookie.
 */
authRouter.post('/login', validateBody(loginSchema), async (req, res: Response) => {
  const { email, password } = req.body;

  try {
    const { db } = await getDatabase();
    const foundUsers = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

    if (foundUsers.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect.' },
      });
    }

    const user = foundUsers[0];

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Ce compte utilisateur a été désactivé.' },
      });
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect.' },
      });
    }

    // Create session & set HTTP-only cookie
    const sessionId = await createSession(user.id, res, req);

    return res.json({
      success: true,
      data: {
        token: sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la connexion.' },
    });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await destroySession(req.sessionId, res, req);
    return res.json({ success: true, message: 'Déconnexion réussie.' });
  } catch (error) {
    console.error('[AUTH] Logout error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la déconnexion.' },
    });
  }
});

/**
 * GET /api/auth/me
 * Returns authenticated user info.
 */
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * POST /api/auth/verify-pin
 * Verifies the Admin PIN for sensitive administrative operations.
 */
authRouter.post('/verify-pin', requireAuth, validateBody(adminPinSchema), async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Seul un administrateur dispose d’un code PIN.' },
    });
  }

  const { pin } = req.body;

  try {
    const { db } = await getDatabase();
    const adminRecords = await db.select().from(users).where(eq(users.id, req.user.id));

    if (adminRecords.length === 0 || !adminRecords[0].adminPinHash) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_PIN_CONFIGURED', message: 'Aucun code PIN configuré pour cet administrateur.' },
      });
    }

    const isMatch = await verifyAdminPin(pin, adminRecords[0].adminPinHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PIN', message: 'Code PIN incorrect.' },
      });
    }

    return res.json({
      success: true,
      message: 'Code PIN validé avec succès.',
    });
  } catch (error) {
    console.error('[AUTH] PIN verification error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la vérification du code PIN.' },
    });
  }
});
