import React, { useState, useRef } from 'react';
import { Paperclip, X, Send, Image, FileText, Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface ChatMediaUploadProps {
  tenantId: string;
  conversationId: string;
  phoneNumber: string;
  departmentCode: string | null;
  onSending: (isSending: boolean) => void;
}

type MediaType = 'image' | 'document' | 'audio';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,audio/ogg,audio/mpeg,audio/mp3';
const MAX_SIZE_MB = 16;

function detectMediaType(file: File): MediaType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ChatMediaUpload: React.FC<ChatMediaUploadProps> = ({
  tenantId,
  conversationId,
  phoneNumber,
  departmentCode,
  onSending,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size check
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: `O tamanho máximo é ${MAX_SIZE_MB}MB. Seu arquivo tem ${formatFileSize(file.size)}.`,
        variant: 'destructive',
      });
      return;
    }

    const type = detectMediaType(file);
    setSelectedFile(file);
    setMediaType(type);
    setCaption('');

    if (type === 'image') {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setMediaType(null);
    setCaption('');
  };

  const handleSend = async () => {
    if (!selectedFile || !mediaType) return;

    setUploading(true);
    onSending(true);

    try {
      // 1. Upload to Supabase Storage
      const timestamp = Date.now();
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${tenantId}/${conversationId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, selectedFile, { contentType: selectedFile.type });

      if (uploadError) {
        throw new Error(`Upload falhou: ${uploadError.message}`);
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // 3. Send via Edge Function
      const { error: sendError } = await supabase.functions.invoke('send-wa-media', {
        body: {
          tenant_id: tenantId,
          phone_number: phoneNumber,
          media_url: publicUrl,
          media_type: mediaType,
          caption: caption.trim() || undefined,
          filename: selectedFile.name,
          conversation_id: conversationId,
          department_code: departmentCode,
        },
      });

      if (sendError) {
        throw new Error(`Envio falhou: ${sendError.message}`);
      }

      handleCancel();
      toast({ title: 'Mídia enviada!' });
    } catch (error) {
      console.error('Media send error:', error);
      toast({
        title: 'Erro ao enviar mídia',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      onSending(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Paperclip className="h-5 w-5" />
      </Button>

      {/* Preview overlay */}
      {selectedFile && mediaType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={handleCancel}>
          <div
            className="bg-card rounded-xl shadow-prominent max-w-md w-full animate-fade-in p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-foreground">Enviar mídia</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Preview */}
            <div className="flex items-center justify-center rounded-lg bg-muted/40 border border-border p-4 min-h-[120px]">
              {mediaType === 'image' && previewUrl ? (
                <img src={previewUrl} alt="Preview" className="rounded-lg max-h-60 max-w-full object-contain" />
              ) : mediaType === 'audio' ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Music className="h-10 w-10" />
                  <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-xs">{formatFileSize(selectedFile.size)}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-xs">{formatFileSize(selectedFile.size)}</p>
                </div>
              )}
            </div>

            {/* Caption (only for images) */}
            {mediaType === 'image' && (
              <Input
                placeholder="Adicionar legenda (opcional)..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={uploading}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSend} disabled={uploading} className="gap-1.5">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatMediaUpload;
