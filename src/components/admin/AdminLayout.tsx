import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import { Loader2 } from 'lucide-react';

const AdminLayout: React.FC = () => {
    const { user, profile, loading } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(250 70% 60%)' }} />
            </div>
        );
    }

    if (!user) return <Navigate to="/auth" replace />;

    // Guard: only super_admin can access admin area
    if (profile?.role !== 'super_admin') {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="flex min-h-screen w-full bg-background">
            <AdminSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
            <div className="flex flex-1 flex-col min-w-0">
                <AdminHeader />
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
