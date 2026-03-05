import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  tenant_id: string | null;  // NULL for super_admin (product admins don't need a tenant)
  full_name: string | null;
  avatar_url: string | null;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer' | null;
  department_code: 'locacao' | 'vendas' | 'administrativo' | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, tenant_id, full_name, avatar_url, role, department_code')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      }
      setProfile(data as Profile | null);
    } catch (err) {
      console.error('Unexpected error in fetchProfile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Use only onAuthStateChange - it fires INITIAL_SESSION on mount,
    // so there's no need for a separate getSession() call.
    // This eliminates the race condition between initSession and onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Set loading=true immediately so AppLayout shows spinner
          // while the profile is being fetched (prevents flash of error screen)
          setLoading(true);
          // Defer profile fetch with setTimeout to avoid Supabase internal deadlocks
          setTimeout(async () => {
            if (!mounted) return;
            await fetchProfile(session.user.id);
            if (mounted) setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          if (mounted) setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { user: data?.user ?? null, error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
