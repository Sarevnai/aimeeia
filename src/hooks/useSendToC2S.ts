import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SendToC2SParams {
  tenantId: string;
  conversationId: string;
  contactId: string;
  phoneNumber: string;
  reason?: string;
}

export function useSendToC2S() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const send = async (params: SendToC2SParams): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('c2s-create-lead', {
        body: {
          tenant_id: params.tenantId,
          phone_number: params.phoneNumber,
          conversation_id: params.conversationId,
          contact_id: params.contactId,
          reason: params.reason || 'Encaminhamento manual pelo operador',
        },
      });

      if (error) {
        toast({
          title: 'Erro ao enviar ao C2S',
          description: error.message || 'Tente novamente',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Lead encaminhado ao C2S',
        description: 'O lead foi enviado com sucesso ao Construtor de Vendas.',
      });
      return true;
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar ao C2S',
        description: err?.message || 'Erro inesperado',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { send, loading };
}
