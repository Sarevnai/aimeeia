import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CurrentBroker {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_id: string | null;
  c2s_seller_id: string | null;
}

/**
 * Resolves the broker record linked to the current authenticated user via
 * `brokers.profile_id = auth.uid()`. Returns null if the user is not a broker.
 */
export function useCurrentBroker() {
  const { user } = useAuth();
  const [broker, setBroker] = useState<CurrentBroker | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) {
      setBroker(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('brokers')
      .select('id, full_name, email, phone, profile_id, c2s_seller_id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn('useCurrentBroker error:', error.message);
          setBroker(null);
        } else {
          setBroker((data as CurrentBroker) || null);
        }
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { broker, loading };
}
