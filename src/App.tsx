import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { DepartmentFilterProvider } from "@/contexts/DepartmentFilterContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import InboxPage from "@/pages/InboxPage";
import ChatPage from "@/pages/ChatPage";
import HistoryPage from "@/pages/HistoryPage";
import LeadsPage from "@/pages/LeadsPage";
import PipelinePage from "@/pages/PipelinePage";
import MinhaAimeePage from "@/pages/MinhaAimeePage";
import CampaignsPage from "@/pages/CampaignsPage";
import CampaignDetailPage from "@/pages/CampaignDetailPage";
import ReportsPage from "@/pages/ReportsPage";
import DevelopmentsPage from "@/pages/DevelopmentsPage";
import DevelopmentFormPage from "@/pages/DevelopmentFormPage";
import AcessosPage from "@/pages/AcessosPage";
import CaptacaoPage from "@/pages/CaptacaoPage";
import GuiaPage from "@/pages/GuiaPage";
import AtualizacaoPage from "@/pages/AtualizacaoPage";
import TemplatesPage from "@/pages/TemplatesPage";
import FinancePage from "@/pages/FinancePage";
import NotFound from "./pages/NotFound";

// Admin Central
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminTenantsPage from "@/pages/admin/AdminTenantsPage";
import AdminTenantDetailPage from "@/pages/admin/AdminTenantDetailPage";
import AdminBillingPage from "@/pages/admin/AdminBillingPage";
import AdminAgentPage from "@/pages/admin/AdminAgentPage";
import AdminMetricsPage from "@/pages/admin/AdminMetricsPage";
import RoleGuard from "@/components/RoleGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <DepartmentFilterProvider>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/chat/:id" element={<ChatPage />} />
                  <Route path="/history/:id" element={<HistoryPage />} />
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/pipeline" element={<PipelinePage />} />
                  {/* operator+ */}
                  <Route path="/campanhas" element={<RoleGuard minRole="operator"><CampaignsPage /></RoleGuard>} />
                  <Route path="/campanhas/:id" element={<RoleGuard minRole="operator"><CampaignDetailPage /></RoleGuard>} />
                  <Route path="/relatorios" element={<ReportsPage />} />
                  <Route path="/empreendimentos" element={<RoleGuard minRole="operator"><DevelopmentsPage /></RoleGuard>} />
                  <Route path="/empreendimentos/novo" element={<RoleGuard minRole="admin"><DevelopmentFormPage /></RoleGuard>} />
                  <Route path="/empreendimentos/:id/editar" element={<RoleGuard minRole="admin"><DevelopmentFormPage /></RoleGuard>} />
                  <Route path="/captacao" element={<RoleGuard minRole="operator"><CaptacaoPage /></RoleGuard>} />
                  <Route path="/atualizacao" element={<RoleGuard minRole="operator"><AtualizacaoPage /></RoleGuard>} />
                  <Route path="/templates" element={<RoleGuard minRole="operator"><TemplatesPage /></RoleGuard>} />
                  {/* admin+ */}
                  <Route path="/minha-aimee" element={<RoleGuard minRole="admin"><MinhaAimeePage /></RoleGuard>} />
                  <Route path="/acessos" element={<RoleGuard minRole="admin"><AcessosPage /></RoleGuard>} />
                  <Route path="/financeiro" element={<RoleGuard minRole="admin"><FinancePage /></RoleGuard>} />
                  <Route path="/guia" element={<GuiaPage />} />
                </Route>
                {/* Admin Central — super_admin only */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="tenants" element={<AdminTenantsPage />} />
                  <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
                  <Route path="billing" element={<AdminBillingPage />} />
                  <Route path="agent" element={<AdminAgentPage />} />
                  <Route path="metrics" element={<AdminMetricsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </DepartmentFilterProvider>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
