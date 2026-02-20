import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

const AdminHeader: React.FC = () => {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();

    const initials = profile?.full_name
        ?.split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'SA';

    return (
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground gap-1.5"
                    onClick={() => navigate('/')}
                >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Voltar ao App</span>
                </Button>
                <Badge
                    className="text-[10px] font-semibold tracking-wide border-0 rounded-full px-2.5 py-0.5"
                    style={{ background: 'hsl(250 70% 60%)', color: 'white' }}
                >
                    ADMIN
                </Badge>
            </div>

            <div className="flex items-center gap-3">
                <span className="hidden md:block text-sm font-medium text-foreground">
                    {profile?.full_name || 'Super Admin'}
                </span>
                <Avatar className="h-8 w-8">
                    <AvatarFallback
                        className="text-xs font-semibold text-white"
                        style={{ background: 'hsl(250 50% 45%)' }}
                    >
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

export default AdminHeader;
