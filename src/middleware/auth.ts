import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { count, eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { hasPermission, PermissionKey } from '../lib/rbac.ts';

export interface AppUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  assignedOutletId: number | null;
  isActive: boolean;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  appUser?: AppUser;
}

async function getOrCreateAppUser(decoded: DecodedIdToken): Promise<AppUser> {
  const uid = decoded.uid;
  const email = decoded.email || `${uid}@user.local`;
  const fullName = decoded.name || email.split('@')[0];

  const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  // Determine if this is the first real Firebase user (excluding seeded demo staff UIDs)
  const [{ total }] = await db.select({ total: count() }).from(users);
  const existingOwners = await db
    .select({ id: users.id, uid: users.uid })
    .from(users)
    .where(eq(users.role, 'owner'));
  const hasRealOwner = existingOwners.some((u) => !u.uid.startsWith('seed_'));
  const assignedRole = total === 0 || !hasRealOwner ? 'owner' : 'cashier';

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email,
      fullName,
      role: assignedRole,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email },
    })
    .returning();

  return inserted[0];
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autentikasi diperlukan (Bearer token tidak ditemukan).' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;
    const appUser = await getOrCreateAppUser(decodedToken);
    if (!appUser.isActive) {
      return res.status(403).json({ error: 'Akun pengguna sedang dinonaktifkan.' });
    }
    req.appUser = appUser;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Sesi login tidak valid atau kedaluwarsa.' });
  }
};

export const requirePermission = (permission: PermissionKey) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.appUser) {
      return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    }
    if (!hasPermission(req.appUser.role, permission)) {
      return res.status(403).json({
        error: `Akses ditolak: peran '${req.appUser.role}' tidak memiliki izin '${permission}'.`,
      });
    }
    next();
  };
};
