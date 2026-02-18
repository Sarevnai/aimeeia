import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentFilter, type DepartmentFilter } from '@/contexts/DepartmentFilterContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  onMobileMenuToggle?: () => void;
}

const departments: { value: DepartmentFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'locacao', label: 'Locação' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'administrativo', label: 'Administrativo' },
];

const AppHeader: React.FC<AppHeaderProps> = ({ onMobileMenuToggle }) => {
  const { profile, signOut } = useAuth();
  const { department, setDepartment } = useDepartmentFilter();

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMobileMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Select value={department} onValueChange={(v) => setDepartment(v as DepartmentFilter)}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden md:block text-sm font-medium text-foreground">
          {profile?.full_name || 'Usuário'}
        </span>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
