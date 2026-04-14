import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onUserCreated: () => void;
}

const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  open,
  onOpenChange,
  tenantId,
  onUserCreated,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('operator');
  const [departmentCode, setDepartmentCode] = useState<string>('vendas');

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('operator');
    setDepartmentCode('vendas');
  };

  const handleClose = (value: boolean) => {
    if (!loading) {
      onOpenChange(value);
      if (!value) resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !password) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    if (password.length < 8) {
      toast({ title: 'A senha deve ter pelo menos 8 caracteres', variant: 'destructive' });
      return;
    }

    if (role === 'operator' && !departmentCode) {
      toast({ title: 'Escolha um setor para o operador', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: {
        action: 'create_user',
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        tenant_id: tenantId,
        role,
        department_code: role === 'operator' ? departmentCode : null,
      },
    });

    if (error || data?.error) {
      const msg = data?.error || 'Falha ao criar usuário.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário criado!', description: `${fullName.trim()} foi adicionado à equipe.` });
      resetForm();
      onOpenChange(false);
      onUserCreated();
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Crie uma conta para um novo membro da equipe. Ele poderá acessar a plataforma imediatamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input
              id="fullName"
              placeholder="Ex: Maria Silva"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="maria@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Perfil</Label>
            <Select value={role} onValueChange={setRole} disabled={loading}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operator">Operador</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admin pode gerenciar equipe e configurações. Operador usa o chat e pipeline. Visualizador apenas consulta.
            </p>
          </div>

          {role === 'operator' && (
            <div className="space-y-2">
              <Label htmlFor="department">Setor</Label>
              <Select value={departmentCode} onValueChange={setDepartmentCode} disabled={loading}>
                <SelectTrigger id="department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendas">Vendas</SelectItem>
                  <SelectItem value="locacao">Locação</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                  <SelectItem value="remarketing">Remarketing</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O operador só verá leads, pipeline e conversas do seu setor.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;
