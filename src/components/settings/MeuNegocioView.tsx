import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';

interface PhoneItem {
    id: string;
    label: string;
    number: string;
}

interface PolicyItem {
    id: string;
    title: string;
    content: string;
}

interface MeuNegocioSettings {
    phones: PhoneItem[];
    policies: PolicyItem[];
    recesso: {
        active: boolean;
        text: string;
    };
    vendas: {
        atendimento_compra: boolean;
        nomenclatura: string;
        financiamento_servicos: string;
        docs_pessoais: string;
        docs_renda: string;
    };
    locacao: {
        prazo_residencial: string;
        prazo_comercial: string;
    };
}

const DEFAULT_SETTINGS: MeuNegocioSettings = {
    phones: [
        { id: '1', label: 'Administração', number: '48991169005' },
        { id: '2', label: 'Loja Centro', number: '4833079001' },
    ],
    policies: [
        { id: '1', title: 'Assinatura de contrato', content: 'Digital e físico' },
        { id: '2', title: 'Política de chaves', content: 'Sempre acompanhadas por alguém da equipe' },
    ],
    recesso: {
        active: false,
        text: 'A Aimee NÃO confirmará pausa durante o período de festas.',
    },
    vendas: {
        atendimento_compra: true,
        nomenclatura: 'Consultor Imobiliário',
        financiamento_servicos: 'Oferece simulação, Parceria com bancos',
        docs_pessoais: 'RG, CPF, CNH',
        docs_renda: '3 últimos contracheques',
    },
    locacao: {
        prazo_residencial: '30 meses',
        prazo_comercial: '60 meses',
    }
};

const MeuNegocioView: React.FC = () => {
    const { tenantId } = useTenant();
    const { toast } = useToast();

    const [settings, setSettings] = useState<MeuNegocioSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!tenantId) return;

        const loadSettings = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('setting_key', 'minha_aimee_meu_negocio')
                .maybeSingle();

            if (!error && data?.setting_value) {
                setSettings({ ...DEFAULT_SETTINGS, ...(data.setting_value as unknown as MeuNegocioSettings) });
            }
            setLoading(false);
        };

        loadSettings();
    }, [tenantId]);

    const saveSettings = async (newSettings: MeuNegocioSettings) => {
        if (!tenantId) return;
        setSaving(true);

        try {
            const { data: existing } = await supabase
                .from('system_settings')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('setting_key', 'minha_aimee_meu_negocio')
                .maybeSingle();

            if (existing) {
                await supabase
                    .from('system_settings')
                    .update({ setting_value: newSettings as any })
                    .eq('id', existing.id);
            } else {
                await supabase
                    .from('system_settings')
                    .insert({
                        tenant_id: tenantId,
                        setting_key: 'minha_aimee_meu_negocio',
                        setting_value: newSettings as any
                    });
            }

            toast({
                title: 'Configurações salvas',
                description: 'Os dados do seu negócio foram atualizados.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Não foi possível salvar as configurações.',
            });
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = <K extends keyof MeuNegocioSettings>(key: K, value: MeuNegocioSettings[K]) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        // Auto-save strategy for simplicity
        saveSettings(newSettings);
    };

    const handleUpdateVendas = (field: keyof MeuNegocioSettings['vendas'], value: any) => {
        updateSetting('vendas', { ...settings.vendas, [field]: value });
    };

    const handleUpdateLocacao = (field: keyof MeuNegocioSettings['locacao'], value: string) => {
        updateSetting('locacao', { ...settings.locacao, [field]: value });
    };

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="max-w-5xl mx-auto animate-fade-in-right">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Meu negócio</h2>
            <p className="text-sm text-muted-foreground mb-8">Treine a Aimee com informações chave sobre o seu negócio.</p>

            <Tabs defaultValue="geral" className="w-full">
                <TabsList className="mb-6 bg-transparent p-0 border-b border-border w-full justify-start rounded-none h-auto">
                    <TabsTrigger value="geral" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
                        Geral
                    </TabsTrigger>
                    <TabsTrigger value="vendas" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
                        Vendas
                    </TabsTrigger>
                    <TabsTrigger value="locacao" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
                        Locação
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="geral" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Políticas */}
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <h4 className="font-semibold text-foreground">Políticas</h4>
                                </div>
                                <div className="space-y-6">
                                    {settings.policies.map(policy => (
                                        <div key={policy.id} className="space-y-1">
                                            <Input
                                                value={policy.title}
                                                className="h-7 text-sm font-medium border-transparent hover:border-border focus:border-border bg-transparent px-1 -ml-1"
                                                onChange={(e) => {
                                                    const newP = settings.policies.map(p => p.id === policy.id ? { ...p, title: e.target.value } : p);
                                                    updateSetting('policies', newP);
                                                }}
                                            />
                                            <Input
                                                value={policy.content}
                                                className="h-7 text-sm text-muted-foreground border-transparent hover:border-border focus:border-border bg-transparent px-1 -ml-1"
                                                onChange={(e) => {
                                                    const newP = settings.policies.map(p => p.id === policy.id ? { ...p, content: e.target.value } : p);
                                                    updateSetting('policies', newP);
                                                }}
                                            />
                                        </div>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-muted-foreground"
                                        onClick={() => updateSetting('policies', [...settings.policies, { id: Date.now().toString(), title: 'Nova política', content: 'Detalhes...' }])}
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Adicionar Política
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Telefones */}
                        <Card className="border-border shadow-sm md:row-span-2">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <h4 className="font-semibold text-foreground">Telefones da empresa</h4>
                                </div>
                                <div className="space-y-6">
                                    {settings.phones.map(phone => (
                                        <div key={phone.id} className="flex gap-2 items-center group">
                                            <div className="flex-1 space-y-1">
                                                <Input
                                                    value={phone.label}
                                                    className="h-7 text-sm font-medium border-transparent hover:border-border focus:border-border bg-transparent px-1"
                                                    onChange={(e) => {
                                                        const newPhones = settings.phones.map(p => p.id === phone.id ? { ...p, label: e.target.value } : p);
                                                        updateSetting('phones', newPhones);
                                                    }}
                                                />
                                                <Input
                                                    value={phone.number}
                                                    className="h-7 text-sm text-muted-foreground border-transparent hover:border-border focus:border-border bg-transparent px-1"
                                                    onChange={(e) => {
                                                        const newPhones = settings.phones.map(p => p.id === phone.id ? { ...p, number: e.target.value } : p);
                                                        updateSetting('phones', newPhones);
                                                    }}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive"
                                                onClick={() => updateSetting('phones', settings.phones.filter(p => p.id !== phone.id))}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    variant="secondary"
                                    className="mt-6 w-[120px] bg-muted relative"
                                    size="sm"
                                    onClick={() => updateSetting('phones', [...settings.phones, { id: Date.now().toString(), label: 'Novo local', number: 'xxxx-xxxx' }])}
                                >
                                    <span className="absolute left-3">+</span> Adicionar
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Recesso */}
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <h4 className="font-semibold text-foreground">Recesso</h4>
                                        {settings.recesso.active ? (
                                            <Badge variant="secondary" className="bg-success/10 text-success border-0 text-[10px] px-2 cursor-pointer" onClick={() => updateSetting('recesso', { ...settings.recesso, active: false })}>● Ativo</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-0 text-[10px] px-2 cursor-pointer" onClick={() => updateSetting('recesso', { ...settings.recesso, active: true })}>● Inativo</Badge>
                                        )}
                                    </div>
                                </div>
                                <Input
                                    value={settings.recesso.text}
                                    onChange={(e) => updateSetting('recesso', { ...settings.recesso, text: e.target.value })}
                                    className="text-sm border-transparent hover:border-border focus:border-border bg-transparent px-1 -ml-1 text-muted-foreground"
                                />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="vendas" className="space-y-4">
                    <Card className="border-border shadow-sm">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <h4 className="font-semibold text-foreground">Informações da operação</h4>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-foreground mb-1">Atendimento de compra</p>
                                    <Badge
                                        className="cursor-pointer"
                                        variant={settings.vendas.atendimento_compra ? "default" : "secondary"}
                                        onClick={() => handleUpdateVendas('atendimento_compra', !settings.vendas.atendimento_compra)}
                                    >
                                        {settings.vendas.atendimento_compra ? "Ativo" : "Inativo"}
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground mb-1">Nomenclatura do corretor</p>
                                    <Input
                                        value={settings.vendas.nomenclatura}
                                        onChange={(e) => handleUpdateVendas('nomenclatura', e.target.value)}
                                        className="h-8 max-w-sm"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <h4 className="font-semibold text-foreground">Financiamento</h4>
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground mb-1">Serviços oferecidos</p>
                                        <Input
                                            value={settings.vendas.financiamento_servicos}
                                            onChange={(e) => handleUpdateVendas('financiamento_servicos', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <h4 className="font-semibold text-foreground">Documentos necessários</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground mb-1">Documentos pessoais</p>
                                        <Input
                                            value={settings.vendas.docs_pessoais}
                                            onChange={(e) => handleUpdateVendas('docs_pessoais', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground mb-1">Comprovante de renda</p>
                                        <Input
                                            value={settings.vendas.docs_renda}
                                            onChange={(e) => handleUpdateVendas('docs_renda', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="locacao" className="space-y-4">
                    <Card className="border-border shadow-sm">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <h4 className="font-semibold text-foreground">Processos de locação</h4>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="space-y-1 max-w-sm">
                                    <p className="text-sm font-medium text-foreground mb-1">Prazo padrão (Residencial)</p>
                                    <Input
                                        value={settings.locacao.prazo_residencial}
                                        onChange={(e) => handleUpdateLocacao('prazo_residencial', e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                                <div className="space-y-1 max-w-sm">
                                    <p className="text-sm font-medium text-foreground mb-1">Prazo padrão (Comercial)</p>
                                    <Input
                                        value={settings.locacao.prazo_comercial}
                                        onChange={(e) => handleUpdateLocacao('prazo_comercial', e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default MeuNegocioView;
