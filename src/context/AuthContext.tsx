import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { PermissionKey } from '../lib/rbac';

export interface AppUserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  assignedOutletId: number | null;
  isActive: boolean;
}

export interface BusinessInfo {
  id: number;
  name: string;
  legalName: string;
  taxRate: number;
  serviceChargeRate: number;
  currency: string;
}

export interface OutletInfo {
  id: number;
  businessId: number;
  code: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  managerName: string;
  status: string;
  isFranchise: boolean;
}

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUserProfile | null;
  business: BusinessInfo | null;
  outlets: OutletInfo[];
  permissions: PermissionKey[];
  activeOutletId: number | null; // null means All Permitted Outlets
  setActiveOutletId: (id: number | null) => void;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshContext: () => Promise<void>;
  can: (perm: PermissionKey) => boolean;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUserProfile | null>(null);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [outlets, setOutlets] = useState<OutletInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [activeOutletId, setActiveOutletId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const apiFetch = useCallback(
    async <T = unknown,>(url: string, options: RequestInit = {}): Promise<T> => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Silakan masuk terlebih dahulu.');
      }
      const idToken = await currentUser.getIdToken();
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${idToken}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Permintaan gagal (${res.status})`);
      }
      return data as T;
    },
    []
  );

  const loadContext = useCallback(async (user: User | null) => {
    if (!user) {
      setAppUser(null);
      setBusiness(null);
      setOutlets([]);
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      setAuthError(null);
      const idToken = await user.getIdToken();
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat profil pengguna.');
      }
      setAppUser(data.user);
      setBusiness(data.business);
      setOutlets(data.outlets || []);
      setPermissions(data.permissions || []);

      if (data.outlets?.length === 1) {
        setActiveOutletId(data.outlets[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal terhubung ke server.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      loadContext(user);
    });
    return () => unsub();
  }, [loadContext]);

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      setLoading(true);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login Google dibatalkan atau gagal.';
      setAuthError(msg);
      setLoading(false);
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setAppUser(null);
    setOutlets([]);
    setActiveOutletId(null);
  };

  const refreshContext = async () => {
    if (auth.currentUser) {
      await loadContext(auth.currentUser);
    }
  };

  const can = useCallback(
    (perm: PermissionKey) => permissions.includes(perm),
    [permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        business,
        outlets,
        permissions,
        activeOutletId,
        setActiveOutletId,
        loading,
        authError,
        signInWithGoogle,
        signOut,
        refreshContext,
        can,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
