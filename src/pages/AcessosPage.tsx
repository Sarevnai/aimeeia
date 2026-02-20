import React, { useState, useEffect } from 'react';
import { Shield, MoreVertical, Pencil, Trash2, UserPlus, Copy, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

// --- Types ---
interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  status: 'active' | 'inactive';
}

// --- Mock Data ---
const mockAccessCode = '4821';

const mockMembers: TeamMember[] = [
  { id: '1', full_name: 'Endrie Smolka', email: 'smolka@smolkaimoveis.com.br', role: 'admin', status: 'active' },
  { id: '2', full_name: 'Andréia Silva', email: 'andreia@smolkaimoveis.com.br', role: 'operator', status: 'active' },
  { id: '3', full_name: 'Ian Veras', email: 'ianveras@smolkaimoveis.com.br', role: 'admin', status: 'active' },
];

// --- Helpers ---
const getRoleBadge = (role: string) => {
  switch (role) {
    case 'admin':
      return { label: 'Admin', className: 'bg-primary/10 text-primary hover:bg-primary/15 border-0' };
    case 'operator':
      return { label: 'Membro', className: 'bg-primary/10 text-primary hover:bg-primary/15 border-0' };
    case 'viewer':
      return { label: 'Editor', className: 'bg-primary/10 text-primary hover:bg-primary/15 border-0' };
    default:
      return { label: role, className: 'bg-muted text-muted-foreground border-0' };
  }
};

// --- Component ---
const AcessosPage: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { tenantInfo } = useTenant();

  const [members, setMembers] = useState<TeamMember[]>(mockMembers);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState('10');

  const currentPage = 1;
  const totalPages = 1;

  const canAdd = newName.trim().length > 0 && newEmail.trim().length > 0;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(mockAccessCode);
    toast({ title: 'Código copiado!', description: 'O código de acesso foi copiado para a área de transferência.' });
  };

  const handleAddUser = async () => {
    if (!canAdd) return;
    setIsAdding(true);

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 1200));

    const newMember: TeamMember = {
      id: crypto.randomUUID(),
      full_name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role: 'operator',
      status: 'active',
    };

    setMembers((prev) => [newMember, ...prev]);
    setNewName('');
    setNewEmail('');
    setIsAdding(false);
    toast({ title: 'Usuário adicionado', description: `${newMember.full_name} foi adicionado como Membro.` });
  };

  const handleToggleRole = (member: TeamMember) => {
    const newRole = member.role === 'operator' ? 'viewer' : 'operator';
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
    );
    const label = newRole === 'viewer' ? 'Editor' : 'Membro';
    toast({ title: 'Perfil alterado', description: `${member.full_name} agora é ${label}.` });
  };

  const handleDeleteUser = () => {
    if (!deleteTarget) return;
    setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    toast({ title: 'Usuário removido', description: `${deleteTarget.full_name} foi removido da equipe.` });
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
            Acesso por código
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Comunique esse código com seus colaboradores para que eles possam acessar o Histórico do Cliente.
          </p>
          <div className="flex items-end gap-4">
            <div className="bg-muted/40 rounded-lg px-6 py-4 border border-border/50 inline-flex flex-col">
              <span className="text-3xl font-bold text-foreground tracking-wider">{mockAccessCode}</span>
              <span className="text-xs text-muted-foreground mt-1">Código da Aimee</span>
            </div>
            <Button variant="ghost" size="icon" className="text-primary hover:text-primary/80 hover:bg-primary/10 h-10 w-10" onClick={handleCopyCode}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Formulário de Adicionar Usuário */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display font-semibold text-foreground">
            Adicionar usuário à sua Aimee
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 w-full sm:w-auto space-y-1.5">
              <Label htmlFor="new-user-name" className="text-sm font-medium">Nome completo</Label>
              <Input
                id="new-user-name"
                placeholder="Preencha o nome completo"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isAdding}
              />
            </div>
            <div className="flex-1 w-full sm:w-auto space-y-1.5">
              <Label htmlFor="new-user-email" className="text-sm font-medium">E-mail</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="Preencha o e-mail"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={isAdding}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
              />
            </div>
            <Button
              className="w-full sm:w-auto min-w-[120px]"
              disabled={!canAdd || isAdding}
              onClick={handleAddUser}
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Usuários */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_150px_120px_48px] gap-4 px-6 py-3 border-b border-border bg-muted/20 text-sm font-medium text-muted-foreground">
            <span>Usuário</span>
            <span>Perfil</span>
            <span>Status</span>
            <span />
          </div>

          {/* Table Rows */}
          {members.length > 0 ? (
            <div className="divide-y divide-border/50">
              {members.map((member) => {
                const roleBadge = getRoleBadge(member.role);
                const isCurrentUser = profile?.id === member.id || member.email === profile?.id;
                const isAdmin = member.role === 'admin';

                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-[1fr_150px_120px_48px] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors"
                  >
                    {/* Usuário */}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{member.full_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
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
                      {!isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => handleToggleRole(member)} className="gap-2 cursor-pointer">
                              <Pencil className="h-4 w-4" />
                              <span>
                                {member.role === 'operator' ? 'Dar acesso de editor' : 'Tornar membro'}
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(member)}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Excluir usuário</span>
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
              <p className="text-foreground font-medium">Nenhum usuário cadastrado</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Adicione usuários acima para que eles possam acessar a plataforma.
              </p>
            </div>
          )}

          {/* Footer de Paginação */}
          {members.length > 0 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
                  <SelectTrigger className="w-[70px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs">Itens por página</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Exibindo {currentPage} de {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                  <span className="text-xs">‹</span>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                  <span className="text-xs">›</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.full_name}</strong> da equipe?
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AcessosPage;
