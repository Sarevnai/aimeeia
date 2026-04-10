import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink } from 'lucide-react';
import { useSendToC2S } from '@/hooks/useSendToC2S';

interface SendToC2SDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  conversationId: string;
  contactId: string;
  phoneNumber: string;
  contactName?: string;
  onSuccess?: () => void;
}

export default function SendToC2SDialog({
  open,
  onOpenChange,
  tenantId,
  conversationId,
  contactId,
  phoneNumber,
  contactName,
  onSuccess,
}: SendToC2SDialogProps) {
  const [reason, setReason] = useState('');
  const { send, loading } = useSendToC2S();

  const handleSend = async () => {
    const ok = await send({
      tenantId,
      conversationId,
      contactId,
      phoneNumber,
      reason: reason.trim() || undefined,
    });
    if (ok) {
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Encaminhar ao C2S
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm font-medium">{contactName || 'Contato'}</p>
            <p className="text-xs text-muted-foreground">{phoneNumber}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c2s-reason">Observações (opcional)</Label>
            <Textarea
              id="c2s-reason"
              placeholder="Ex: Cliente interessado em apartamento 3 quartos no Centro..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Enviar ao C2S
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
