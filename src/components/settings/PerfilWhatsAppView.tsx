import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';

// --- Helpers Visuais ---
const BuildingDecorative = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="40" width="120" height="80" rx="8" fill="var(--primary)" opacity="0.8" />
        <rect x="100" y="20" width="40" height="100" rx="4" fill="var(--primary)" opacity="0.6" />
        <rect x="20" y="60" width="40" height="60" rx="4" fill="var(--primary)" opacity="0.4" />
        <circle cx="60" cy="65" r="4" fill="white" opacity="0.4" />
        <circle cx="80" cy="65" r="4" fill="white" opacity="0.4" />
        <circle cx="120" cy="45" r="4" fill="white" opacity="0.4" />
        <circle cx="140" cy="45" r="4" fill="white" opacity="0.4" />
    </svg>
);

const ZapIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
);

interface WhatsAppProfile {
    displayName: string;
    bio: string;
    email: string;
    website: string;
    address: string;
}

const DEFAULT_PROFILE: WhatsAppProfile = {
    displayName: "Aimee.iA | Atendimento",
    bio: "Olá! Sou a inteligência artificial da sua imobiliária, pronta para te ajudar a encontrar o imóvel ideal. 🏡✨",
    email: "contato@minhaimobiliaria.com.br",
    website: "https://www.minhaimobiliaria.com.br",
    address: "Av. Central, 1000 - Centro",
};

const PerfilWhatsAppView: React.FC = () => {
    const { tenantId } = useTenant();
    const { toast } = useToast();

    const [profile, setProfile] = useState<WhatsAppProfile>(DEFAULT_PROFILE);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!tenantId) return;

        const loadProfile = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('setting_key', 'minha_aimee_perfil_whatsapp')
                .maybeSingle();

            if (!error && data?.setting_value) {
                setProfile({ ...DEFAULT_PROFILE, ...(data.setting_value as unknown as WhatsAppProfile) });
            }
            setLoading(false);
        };

        loadProfile();
    }, [tenantId]);

    const handleChange = (field: keyof WhatsAppProfile, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!tenantId) return;
        setSaving(true);

        try {
            // Upsert into system_settings
            const { data: existing } = await supabase
                .from('system_settings')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('setting_key', 'minha_aimee_perfil_whatsapp')
                .maybeSingle();

            if (existing) {
                await supabase
                    .from('system_settings')
                    .update({ setting_value: profile as any })
                    .eq('id', existing.id);
            } else {
                await supabase
                    .from('system_settings')
                    .insert({
                        tenant_id: tenantId,
                        setting_key: 'minha_aimee_perfil_whatsapp',
                        setting_value: profile as any
                    });
            }

            toast({
                title: 'Perfil salvo com sucesso',
                description: 'As alterações no perfil de WhatsApp foram registradas.',
            });
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Erro ao salvar',
                description: 'Ocorreu um erro ao salvar seu perfil.',
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="max-w-5xl mx-auto animate-fade-in-right">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Perfil de WhatsApp</h2>
            <p className="text-sm text-muted-foreground mb-8">Personalize como os leads verão a foto e os dados da sua IA.</p>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Formulário (Esquerda) */}
                <div className="lg:col-span-3 space-y-4">
                    <Card className="border-border shadow-sm">
                        <CardContent className="p-6 space-y-5">
                            <div className="space-y-2">
                                <Label>Nome de Exibição</Label>
                                <Input
                                    value={profile.displayName}
                                    onChange={(e) => handleChange('displayName', e.target.value)}
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Descrição (Bio)</Label>
                                <Textarea
                                    value={profile.bio}
                                    onChange={(e) => handleChange('bio', e.target.value)}
                                    className="bg-muted/30 resize-none h-24"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>E-mail comercial</Label>
                                <Input
                                    value={profile.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Website</Label>
                                <Input
                                    value={profile.website}
                                    onChange={(e) => handleChange('website', e.target.value)}
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Endereço Físico</Label>
                                <Input
                                    value={profile.address}
                                    onChange={(e) => handleChange('address', e.target.value)}
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="pt-4 flex justify-end">
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Salvar informações
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Mockup iPhone (Direita) */}
                <div className="lg:col-span-2 flex justify-center lg:justify-end">
                    <div className="relative w-[280px] h-[580px] bg-[#1C1C1E] rounded-[40px] border-[8px] border-[#3A3A3C] shadow-2xl overflow-hidden shrink-0 mt-2">
                        {/* Notch */}
                        <div className="absolute top-0 inset-x-0 h-6 bg-[#3A3A3C] rounded-b-3xl w-[120px] mx-auto z-20"></div>

                        {/* Status bar mock */}
                        <div className="absolute top-1 inset-x-4 flex justify-between z-20 text-white text-[10px] items-center">
                            <span>15:30</span>
                            <div className="flex gap-1 items-center">
                                <div className="h-2 w-2 rounded-full bg-white"></div>
                                <div className="h-2 w-3 rounded-full bg-white"></div>
                            </div>
                        </div>

                        {/* WhatsApp Top Header */}
                        <div className="bg-[#1F2C34] pt-12 pb-2 px-3 flex items-center gap-3">
                            <ChevronLeft className="h-5 w-5 text-[#00A884]" />
                            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 border border-primary/20">
                                <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=aimee&backgroundColor=7c3aed`} className="w-9 h-9 rounded-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-sm truncate">{profile.displayName || ' '}</p>
                                <p className="text-[#8696A0] text-xs">Conta comercial</p>
                            </div>
                        </div>

                        {/* WhatsApp Inside View (Business Profile) */}
                        <div className="bg-[#111B21] h-full p-4 space-y-4">
                            <div className="bg-[#1F2C34] rounded-lg p-3">
                                <p className="text-[#8696A0] text-xs mb-1 font-medium">SOBRE</p>
                                <p className="text-[#E9EDEF] text-[13px] leading-snug">{profile.bio || ' '}</p>
                            </div>

                            <div className="bg-[#1F2C34] rounded-lg p-3 space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5"><BuildingDecorative className="w-4 h-4 fill-[#8696A0]" /></div>
                                    <div>
                                        <p className="text-[#E9EDEF] text-[13px] leading-snug">{profile.address || ' '}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 border-t border-[#313D45] pt-3">
                                    <div className=""><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#8696A0]"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[#E9EDEF] text-[13px] leading-snug truncate">{profile.email || ' '}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 border-t border-[#313D45] pt-3">
                                    <div className=""><ZapIcon className="w-4 h-4 text-[#8696A0]" /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[#00A884] text-[13px] leading-snug truncate">{profile.website || ' '}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerfilWhatsAppView;
