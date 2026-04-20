// Sprint 6.2 — Gravação de áudio ao vivo estilo WhatsApp Web.
// Fluxo: click mic → grava → stop → preview → enviar / descartar.
// Integrado no ChatPage (vendas/locacao) e ConversationChatPanel (cockpit admin).
//
// NOTA: Meta Cloud API aceita audio/mpeg (MP3), audio/ogg (só opus), audio/aac,
// audio/mp4, audio/amr. O MediaRecorder do Chrome só grava webm, que Meta rejeita.
// Por isso usamos mic-recorder-to-mp3 — encoda MP3 direto no browser via WASM.

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
// @ts-expect-error — lib sem tipos oficiais
import MicRecorder from 'mic-recorder-to-mp3';

interface Props {
  tenantId: string;
  conversationId: string;
  phoneNumber: string;
  departmentCode: string | null;
  onSending?: (v: boolean) => void;
}

type State = 'idle' | 'recording' | 'preview' | 'uploading';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const AudioRecordButton: React.FC<Props> = ({
  tenantId,
  conversationId,
  phoneNumber,
  departmentCode,
  onSending,
}) => {
  const { toast } = useToast();
  const [state, setState] = useState<State>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef<any>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [previewUrl]);

  const startRecording = async () => {
    try {
      const recorder = new MicRecorder({ bitRate: 128 });
      await recorder.start();
      recorderRef.current = recorder;

      startedAtRef.current = Date.now();
      setDuration(0);
      setState('recording');

      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.error('Audio record error:', err);
      toast({
        variant: 'destructive',
        title: 'Microfone não acessível',
        description:
          (err as any)?.name === 'NotAllowedError'
            ? 'Permita o acesso ao microfone nas configurações do navegador.'
            : 'Não foi possível iniciar a gravação. Tente recarregar a página.',
      });
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      const [buffer, rawBlob] = await recorderRef.current.stop().getMp3();
      const b = new Blob(buffer, { type: 'audio/mpeg' });
      setBlob(b);
      setPreviewUrl(URL.createObjectURL(b));
      setState('preview');
      recorderRef.current = null;
    } catch (err) {
      console.error('Audio stop error:', err);
      toast({
        variant: 'destructive',
        title: 'Falha ao processar áudio',
        description: (err as Error).message,
      });
      setState('idle');
    }
  };

  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setDuration(0);
    setState('idle');
  };

  const send = async () => {
    if (!blob) return;
    setState('uploading');
    onSending?.(true);

    try {
      const ts = Date.now();
      const fileName = `voice_${ts}.mp3`;
      const path = `${tenantId}/${conversationId}/${ts}_${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, blob, { contentType: 'audio/mpeg' });

      if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);

      const { data: sendData, error: sendError } = await supabase.functions.invoke('send-wa-media', {
        body: {
          tenant_id: tenantId,
          phone_number: phoneNumber,
          media_url: urlData.publicUrl,
          media_type: 'audio',
          filename: fileName,
          conversation_id: conversationId,
          department_code: departmentCode,
        },
      });

      if (sendError) throw new Error(`Envio: ${sendError.message}`);
      if (sendData && sendData.success === false) {
        throw new Error(sendData.error || 'Meta Cloud API rejeitou o áudio');
      }

      toast({ title: 'Áudio enviado' });
      discard();
    } catch (err) {
      console.error('Audio send error:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar áudio',
        description: (err as Error).message,
      });
      setState('preview'); // mantém o blob pra tentar de novo
    } finally {
      onSending?.(false);
    }
  };

  if (state === 'idle') {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={startRecording}
        title="Gravar áudio"
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-red-50 border border-red-200 shrink-0">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-mono text-red-700 tabular-nums min-w-[40px]">
          {formatDuration(duration)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:bg-red-100"
          onClick={stopRecording}
          title="Parar gravação"
        >
          <Square className="h-3 w-3 fill-red-500 text-red-500" />
        </Button>
      </div>
    );
  }

  // preview | uploading
  return (
    <div className={cn('flex items-center gap-1 shrink-0 rounded-md border p-1', state === 'uploading' && 'opacity-70')}>
      {previewUrl && (
        <audio src={previewUrl} controls className="h-7 max-w-[160px] md:max-w-[200px]" />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={discard}
        disabled={state === 'uploading'}
        title="Descartar áudio"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </Button>
      <Button
        size="icon"
        variant="default"
        className="h-7 w-7"
        onClick={send}
        disabled={state === 'uploading'}
        title="Enviar áudio"
      >
        {state === 'uploading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};

export default AudioRecordButton;
