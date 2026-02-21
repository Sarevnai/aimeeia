import React, { useState, useEffect } from 'react';
import { Shield, MoreVertical, Pencil, Trash2, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

// --- Types ---
interface TeamMember {
  id: string;
  full_name: string | null;
  username: string | null;
  role: 'admin' | 'operator' | 'viewer' | 'super_admin';
  created_at: string | null;
}

// --- Helpers ---
const getRoleBadge = (role: string) => {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return { label: 'Admin', className: 'bg-primary/10 text-primary hover:bg-primary/15 border-0' };
    case 'operator':
      return { label: 'Operador', className: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-0' };
    case 'viewer':
      return { label: 'Visualizador', className: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-0' };
    default:
      return { label: role, className: 'bg-muted text-muted-foreground border-0' };
  }
};

// --- Component ---
const AcessosPage: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { tenantId, tenantInfo } = useTenant();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // Load members
  useEffect(() => {
    if (!tenantId) return;
    loadMembers();
  }, [tenantId]);

  // Load access code from tenant info
  useEffect(() => {
    setAccessCode(tenantInfo?.access_code ?? null);
  }, [tenantInfo]);

  const loadMembers = async () => {
    if (!tenantId) return;
    setLoadingMembers(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, role, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load members:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar a equipe.', variant: 'destructive' });
    } else {
      setMembers((data || []) as TeamMember[]);
    }

    setLoadingMembers(false);
  };

  const handleCopyCode = () => {
    if (!accessCode) return;
    navigator.clipboard.writeText(accessCode);
    toast({ title: 'Código copiado!', description: 'O código de acesso foi copiado para a área de transferência.' });
  };

  const handleRegenerateCode = async () => {
    if (!tenantId) return;
    setRegenerating(true);

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: { action: 'regenerate_code', tenant_id: tenantId },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao regenerar código.', variant: 'destructive' });
    } else {
      setAccessCode(data.access_code);
      toast({ title: 'Código regenerado!', description: 'Um novo código de acesso foi gerado.' });
    }

    setRegenerating(false);
  };

  const handleChangeRole = async (member: TeamMember, newRole: string) => {
    if (!tenantId) return;

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: {
        action: 'update_role',
        tenant_id: tenantId,
        target_user_id: member.id,
        new_role: newRole,
      },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao alterar perfil.', variant: 'destructive' });
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: newRole as any } : m))
      );
      const roleLabel = getRoleBadge(newRole).label;
      toast({ title: 'Perfil alterado', description: `${member.full_name} agora é ${roleLabel}.` });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || !tenantId) return;
    setIsDeleting(true);

    const { data, error } = await supabase.functions.invoke('manage-team', {
      body: {
        action: 'remove_member',
        tenant_id: tenantId,
        target_user_id: deleteTarget.id,
      },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || 'Falha ao remover usuário.', variant: 'destructive' });
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast({ title: 'Usuário removido', description: `${deleteTarget.full_name} foi removido da equipe.` });
    }

    setIsDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
      <PageHeader
        title="Acessos"
        subtitle="Gerencie quem pode acessar e administrar sua Aimee."
      />

      {/* Código de Acesso */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display font-semibold text-foreground">
            Código de acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Compartilhe este código com seus colaboradores para que possam criar conta e acessar a plataforma.
          </p>
          <div className="flex items-end gap-3">
            <div className="bg-muted/40 rounded-lg px-6 py-4 border border-border/50 inline-flex flex-col">
              <span className="text-3xl font-bold text-foreground tracking-[0.2em]">
                {accessCode || '------'}
              </span>
              <span className="text-xs text-muted-foreground mt-1">Código da empresa</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary hover:text-primary/80 hover:bg-primary/10 h-10 w-10"
              onClick={handleCopyCode}
              disabled={!accessCode}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-muted h-10 w-10"
                onClick={handleRegenerateCode}
                disabled={regenerating}
                title="Gerar novo código"
              >
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Ao regenerar, o código antigo deixará de funcionar para novos cadastros.
          </p>
        </CardContent>
      </Card>

      {/* Tabela de Membros */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display font-semibold text-foreground">
            Equipe ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_150px_120px_48px] gap-4 px-6 py-3 border-b border-border bg-muted/20 text-sm font-medium text-muted-foreground">
            <span>Usuário</span>
            <span>Perfil</span>
            <span>Status</span>
            <span />
          </div>

          {/* Loading */}
          {loadingMembers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length > 0 ? (
            <div className="divide-y divide-border/50">
              {members.map((member) => {
                const roleBadge = getRoleBadge(member.role);
                const isCurrentUser = profile?.id === member.id;
                const isMemberAdmin = member.role === 'admin' || member.role === 'super_admin';
                const canManage = isAdmin && !isCurrentUser && member.role !== 'super_admin';

                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-[1fr_150px_120px_48px] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors"
                  >
                    {/* Usuário */}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {member.full_name || 'Sem nome'}
                        {isCurrentUser && <span className="text-xs text-muted-foreground ml-2">(você)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{member.username || '—'}</p>
                    </div>

                    {/* Perfil Badge */}
                    <div>
                      <Badge variant="secondary" className={`px-3 py-0.5 rounded-md text-xs font-semibold ${roleBadge.className}`}>
                        {roleBadge.label}
                      </Badge>
                    </div>

                    {/* Status */}
                    <div>
                      <Badge variant="outline" className="flex items-center gap-1.5 w-fit px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-xs font-medium">Ativo</span>
                      </Badge>
                    </div>

                    {/* Ações */}
                    <div className="flex justify-end">
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {member.role !== 'admin' && (
                              <DropdownMenuItem onClick={() => handleChangeRole(member, 'admin')} className="gap-2 cursor-pointer">
                                <Pencil className="h-4 w-4" />
                                <span>Promover a Admin</span>
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'operator' && (
                              <DropdownMenuItem onClick={() => handleChangeRole(member, 'operator')} className="gap-2 cursor-pointer">
                                <Pencil className="h-4 w-4" />
                                <span>Tornar Operador</span>
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'viewer' && (
                              <DropdownMenuItem onClick={() => handleChangeRole(member, 'viewer')} className="gap-2 cursor-pointer">
                                <Pencil className="h-4 w-4" />
                                <span>Tornar Visualizador</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(member)}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Remover da equipe</span>
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
              <p className="text-foreground font-medium">Nenhum membro encontrado</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Compartilhe o código de acesso para que novos colaboradores se cadastrem.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da equipe</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.full_name}</strong> da equipe?
              Essa ação não pode ser desfeita. O usuário perderá acesso à plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AcessosPage;
