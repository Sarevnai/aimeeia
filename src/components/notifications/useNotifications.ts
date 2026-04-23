import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  tenant_id: string;
  recipient_profile_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
}

const LIMIT = 30;

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) {
      console.warn('useNotifications fetch error:', error.message);
      return;
    }
    setNotifications((data || []) as Notification[]);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_profile_id=eq.${user.id}`,
        },
        () => fetchNotifications(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) console.warn('markAsRead error:', error.message);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .eq('recipient_profile_id', user.id)
      .is('read_at', null);
    if (error) console.warn('markAllAsRead error:', error.message);
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
  }, [user?.id]);

  return { notifications, unreadCount, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
