import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { X, Plus, Upload, Trash2, ArrowLeft } from 'lucide-react';

interface UnitType {
  tipo: string;
  area: string;
  preco_de: string;
}

interface FaqItem {
  pergunta: string;
  resposta: string;
}

const DevelopmentFormPage: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [developer, setDeveloper] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState('lancamento');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('Florianópolis');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [c2sProjectId, setC2sProjectId] = useState('');
  const [heroImage, setHeroImage] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');

  // Array fields
  const [differentials, setDifferentials] = useState<string[]>([]);
  const [diffInput, setDiffInput] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenInput, setAmenInput] = useState('');
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);
  const [tpInput, setTpInput] = useState('');

  // JSON fields
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);

  // Image upload
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isEdit || !tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('developments')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (data) {
        setName(data.name ?? '');
        setDeveloper(data.developer ?? '');
        setSlug(data.slug ?? '');
        setStatus(data.status ?? 'lancamento');
        setDescription(data.description ?? '');
        setAddress(data.address ?? '');
        setNeighborhood(data.neighborhood ?? '');
        setCity(data.city ?? 'Florianópolis');
        setDeliveryDate(data.delivery_date ?? '');
        setStartingPrice(data.starting_price ? String(data.starting_price) : '');
        setC2sProjectId(data.c2s_project_id ?? '');
        setHeroImage(data.hero_image ?? '');
        setAiInstructions(data.ai_instructions ?? '');
        setDifferentials(data.differentials ?? []);
        setAmenities(data.amenities ?? []);
        setTalkingPoints(data.talking_points ?? []);
        setUnitTypes((data.unit_types as unknown as UnitType[]) ?? []);
        setFaq((data.faq as unknown as FaqItem[]) ?? []);
      }
      setLoading(false);
    };
    fetch();
  }, [id, tenantId, isEdit]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${tenantId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('development-images').upload(path, file);
    if (error) {
      toast({ title: 'Erro ao enviar imagem', description: error.message, variant: 'destructive' });
    } else {
      const { data: urlData } = supabase.storage.from('development-images').getPublicUrl(path);
      setHeroImage(urlData.publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!tenantId || !name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      developer: developer || null,
      slug: slug || null,
      status,
      description: description || null,
      address: address || null,
      neighborhood: neighborhood || null,
      city,
      delivery_date: deliveryDate || null,
      starting_price: startingPrice ? Number(startingPrice) : null,
      c2s_project_id: c2sProjectId || null,
      hero_image: heroImage || null,
      ai_instructions: aiInstructions || null,
      differentials,
      amenities,
      talking_points: talkingPoints,
      unit_types: unitTypes as any,
      faq: faq as any,
    };

    if (isEdit) {
      const { error } = await supabase.from('developments').update(payload).eq('id', id);
      if (error) toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      else toast({ title: 'Empreendimento atualizado' });
    } else {
      const { error } = await supabase.from('developments').insert(payload);
      if (error) toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      else {
        toast({ title: 'Empreendimento criado' });
        navigate('/empreendimentos');
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    const { error } = await supabase.from('developments').update({ is_active: false }).eq('id', id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Empreendimento removido' });
      navigate('/empreendimentos');
    }
  };

  const addTag = (list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) => {
    const val = input.trim();
    if (val && !list.includes(val)) {
      setList([...list, val]);
      setInput('');
    }
  };

  const removeTag = (list: string[], setList: (v: string[]) => void, idx: number) => {
    setList(list.filter((_, i) => i !== idx));
  };

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/empreendimentos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {isEdit ? 'Editar Empreendimento' : 'Novo Empreendimento'}
          </h2>
        </div>
      </div>

      <div className="space-y-6 rounded-xl bg-card border border-border p-6 shadow-card">
        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do empreendimento" />
          </div>
          <div className="space-y-2">
            <Label>Incorporadora</Label>
            <Input value={developer} onChange={e => setDeveloper(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="nome-do-empreendimento" />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lancamento">Lançamento</SelectItem>
                <SelectItem value="em_obras">Em obras</SelectItem>
                <SelectItem value="pronto">Pronto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>

        {/* Location */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bairro</Label>
            <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Previsão de entrega</Label>
            <Input value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} placeholder="Ex: Dez/2026" />
          </div>
          <div className="space-y-2">
            <Label>Preço inicial (R$)</Label>
            <Input type="number" value={startingPrice} onChange={e => setStartingPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ID Projeto C2S</Label>
            <Input value={c2sProjectId} onChange={e => setC2sProjectId(e.target.value)} />
          </div>
        </div>

        {/* Hero image */}
        <div className="space-y-2">
          <Label>Imagem principal</Label>
          <div className="flex items-center gap-4">
            {heroImage && (
              <img src={heroImage} alt="Hero" className="h-24 w-36 object-cover rounded-lg border border-border" />
            )}
            <label className="cursor-pointer">
              <div className="flex items-center gap-2 text-sm text-accent hover:underline">
                <Upload className="h-4 w-4" />
                {uploading ? 'Enviando...' : 'Enviar imagem'}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
            {heroImage && (
              <Button variant="ghost" size="sm" onClick={() => setHeroImage('')}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tag inputs */}
        <TagInputField label="Diferenciais" list={differentials} setList={setDifferentials} input={diffInput} setInput={setDiffInput} addTag={addTag} removeTag={removeTag} />
        <TagInputField label="Amenidades" list={amenities} setList={setAmenities} input={amenInput} setInput={setAmenInput} addTag={addTag} removeTag={removeTag} />
        <TagInputField label="Talking Points" list={talkingPoints} setList={setTalkingPoints} input={tpInput} setInput={setTpInput} addTag={addTag} removeTag={removeTag} />

        {/* Unit types */}
        <div className="space-y-2">
          <Label>Tipos de unidade</Label>
          <div className="space-y-2">
            {unitTypes.map((ut, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Tipo" value={ut.tipo} onChange={e => {
                  const arr = [...unitTypes]; arr[i] = { ...arr[i], tipo: e.target.value }; setUnitTypes(arr);
                }} className="flex-1" />
                <Input placeholder="Área (m²)" value={ut.area} onChange={e => {
                  const arr = [...unitTypes]; arr[i] = { ...arr[i], area: e.target.value }; setUnitTypes(arr);
                }} className="w-28" />
                <Input placeholder="Preço de" value={ut.preco_de} onChange={e => {
                  const arr = [...unitTypes]; arr[i] = { ...arr[i], preco_de: e.target.value }; setUnitTypes(arr);
                }} className="w-32" />
                <Button variant="ghost" size="icon" onClick={() => setUnitTypes(unitTypes.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setUnitTypes([...unitTypes, { tipo: '', area: '', preco_de: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar tipo
            </Button>
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-2">
          <Label>FAQ</Label>
          <div className="space-y-2">
            {faq.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input placeholder="Pergunta" value={f.pergunta} onChange={e => {
                  const arr = [...faq]; arr[i] = { ...arr[i], pergunta: e.target.value }; setFaq(arr);
                }} className="flex-1" />
                <Input placeholder="Resposta" value={f.resposta} onChange={e => {
                  const arr = [...faq]; arr[i] = { ...arr[i], resposta: e.target.value }; setFaq(arr);
                }} className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => setFaq(faq.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFaq([...faq, { pergunta: '', resposta: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar FAQ
            </Button>
          </div>
        </div>

        {/* AI Instructions */}
        <div className="space-y-2">
          <Label>Instruções para IA</Label>
          <Textarea
            value={aiInstructions}
            onChange={e => setAiInstructions(e.target.value)}
            rows={4}
            placeholder="Instruções específicas para a AI ao atender leads deste empreendimento"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} className="gap-2">
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Reusable tag input
const TagInputField: React.FC<{
  label: string;
  list: string[];
  setList: (v: string[]) => void;
  input: string;
  setInput: (v: string) => void;
  addTag: (list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) => void;
  removeTag: (list: string[], setList: (v: string[]) => void, idx: number) => void;
}> = ({ label, list, setList, input, setInput, addTag, removeTag }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="flex flex-wrap gap-1.5 mb-2">
      {list.map((item, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pr-1">
          {item}
          <button onClick={() => removeTag(list, setList, i)} className="ml-1 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
    <div className="flex gap-2">
      <Input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={`Adicionar ${label.toLowerCase()}`}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(list, setList, input, setInput); } }}
        className="flex-1"
      />
      <Button variant="outline" size="sm" onClick={() => addTag(list, setList, input, setInput)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default DevelopmentFormPage;
