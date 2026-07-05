import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { OrgPlan, OrgRole } from '@/lib/database.types';

export interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  is_active: boolean;
  role: OrgRole;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Organisasi aktif user saat ini. Auto-diisi setelah login (single-org per user pada model dasar). */
  organization: CurrentOrganization | null;
  /** Daftar semua organisasi yang menjadi member user ini (untuk kasus user gabung >1 lembaga). */
  memberships: CurrentOrganization[];
  loading: boolean;
  error: string | null;
  switchOrganization: (organizationId: string) => void;
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACTIVE_ORG_STORAGE_KEY = 'sertifikatlive.active_org_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<CurrentOrganization[]>([]);
  const [organization, setOrganization] = useState<CurrentOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMemberships(userId: string) {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name, slug, plan, is_active)')
      .eq('user_id', userId);

    if (queryError) {
      setError('Gagal memuat data organisasi: ' + queryError.message);
      setMemberships([]);
      setOrganization(null);
      return;
    }

    // Debug: log hasil mentah supaya mudah dicek lewat DevTools Console kalau
    // ada masalah "membership row ada tapi organisasi tidak muncul" (biasanya
    // indikasi RLS memblokir join ke tabel organizations).
    // eslint-disable-next-line no-console
    console.debug('[AuthContext] organization_members raw result:', data);

    const rowsWithoutOrgJoin = (data ?? []).filter((row) => !row.organizations);
    if (rowsWithoutOrgJoin.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AuthContext] Ditemukan baris organization_members TANPA data organisasi (kemungkinan RLS memblokir SELECT ke tabel organizations, atau organization_id tidak valid):',
        rowsWithoutOrgJoin
      );
    }

    const orgs: CurrentOrganization[] = (data ?? [])
      .filter((row) => row.organizations)
      .map((row) => {
        const org = row.organizations as unknown as {
          id: string;
          name: string;
          slug: string;
          plan: OrgPlan;
          is_active: boolean;
        };
        return { ...org, role: row.role as OrgRole };
      });

    setMemberships(orgs);

    if (orgs.length === 0) {
      setOrganization(null);
      if (rowsWithoutOrgJoin.length > 0) {
        setError(
          `Ditemukan ${rowsWithoutOrgJoin.length} baris keanggotaan organisasi, namun data organisasinya tidak bisa diambil (kemungkinan RLS SELECT policy pada tabel 'organizations' memblokir, atau organization_id tidak valid). Buka DevTools Console untuk detail.`
        );
      } else if ((data ?? []).length === 0) {
        setError(null); // benar-benar belum ada membership sama sekali, bukan error
      }
      return;
    }

    // Auto pilih organisasi aktif: pakai yang tersimpan di localStorage kalau
    // masih valid (user masih member di sana), kalau tidak pakai yang pertama.
    const storedOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    const matched = orgs.find((o) => o.id === storedOrgId);
    const active = matched ?? orgs[0];
    window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, active.id);
    setOrganization(active);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadMemberships(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setLoading(true);
        await loadMemberships(newSession.user.id);
        setLoading(false);
      } else {
        setMemberships([]);
        setOrganization(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function switchOrganization(organizationId: string) {
    const target = memberships.find((o) => o.id === organizationId);
    if (!target) return;
    window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, target.id);
    setOrganization(target);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    setOrganization(null);
    setMemberships([]);
  }

  async function refreshMemberships() {
    if (session?.user) {
      await loadMemberships(session.user.id);
    }
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    organization,
    memberships,
    loading,
    error,
    switchOrganization,
    signOut,
    refreshMemberships,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
