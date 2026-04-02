import React, { useState, useEffect } from 'react';
import {
  Shield,
  UserPlus,
  Loader2,
  Trash2,
  KeyRound,
  MoreVertical,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface PlatformUser {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string | null;
  email?: string;
}

const AdminUsersPage: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<PlatformUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<PlatformUser | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('role', 'super_admin')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load platform users:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os usuários.', variant: 'destructive' });
    } else {
      // Fetch emails from auth (via manage-team or direct query isn't possible from client)
      // We'll show full_name only — email isn't in profiles table
      setUsers((data || []) as PlatformUser[]);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name.trim() || !form.email.trim() || !form.password) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: 'A senha deve ter pelo menos 8 caracteres', variant: 'destructive' });
      return;
    }

    setCreateLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: {
        action: 'create_user',
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: 'super_admin',
      },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao criar usuário.', variant: 'destructive' });
    } else {
      toast({ title: 'Administrador criado!', description: `${form.full_name.trim()} agora tem acesso ao painel.` });
      setForm({ full_name: '', email: '', password: '' });
      setCreateOpen(false);
      loadUsers();
    }
    setCreateLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: { action: 'remove_user', user_id: deleteTarget.id },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao remover usuário.', variant: 'destructive' });
    } else {
      toast({ title: 'Usuário removido', description: `${deleteTarget.full_name} foi removido do painel.` });
      setDeleteTarget(null);
      loadUsers();
    }
    setDeleteLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) return;
    setResetLoading(true);

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: { action: 'reset_password', user_id: resetTarget.id, new_password: newPassword },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao redefinir senha.', variant: 'destructive' });
    } else {
      toast({ title: 'Senha redefinida', description: `Senha de ${resetTarget.full_name} foi alterada.` });
      setResetTarget(null);
      setNewPassword('');
    }
    setResetLoading(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Administradores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Usuários com acesso ao painel de controle da plataforma.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo administrador
        </Button>
      </div>

      {/* Users List */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display font-semibold text-foreground">
            Equipe do painel ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_120px_140px_48px] gap-4 px-6 py-3 border-b border-border bg-muted/20 text-sm font-medium text-muted-foreground">
            <span>Usuário</span>
            <span>Perfil</span>
            <span>Criado em</span>
            <span />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length > 0 ? (
            <div className="divide-y divide-border/50">
              {users.map((user) => {
                const isCurrentUser = profile?.id === user.id;

                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-[1fr_120px_140px_48px] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {user.full_name || 'Sem nome'}
                        {isCurrentUser && <span className="text-xs text-muted-foreground ml-2">(você)</span>}
                      </p>
                    </div>

                    <div>
                      <Badge variant="secondary" className="px-3 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 border-0">
                        Super Admin
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </div>

                    <div className="flex justify-end">
                      {!isCurrentUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => { setResetTarget(user); setNewPassword(''); }} className="gap-2 cursor-pointer">
                              <KeyRound className="h-4 w-4" />
                              Redefinir senha
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(user)}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover do painel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-accent" />
              </div>
              <p className="text-foreground font-medium">Nenhum administrador encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!createLoading) { setCreateOpen(v); if (!v) setForm({ full_name: '', email: '', password: '' }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo administrador</DialogTitle>
            <DialogDescription>
              Crie uma conta com acesso total ao painel de controle da plataforma.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">Nome completo</Label>
              <Input
                id="admin-name"
                placeholder="Ex: João Silva"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                disabled={createLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">E-mail</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="joao@empresa.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={createLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={createLoading}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Criar administrador
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover administrador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.full_name}</strong> do painel de controle?
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(v) => { if (!resetLoading && !v) { setResetTarget(null); setNewPassword(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{resetTarget?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={resetLoading}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setResetTarget(null); setNewPassword(''); }} disabled={resetLoading}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resetLoading || newPassword.length < 8}>
              {resetLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
