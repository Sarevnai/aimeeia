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
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/pipeline" element={<PipelinePage />} />
                  <Route path="/campanhas" element={<CampaignsPage />} />
                  <Route path="/campanhas/:id" element={<CampaignDetailPage />} />
                  <Route path="/relatorios" element={<ReportsPage />} />
                  <Route path="/empreendimentos" element={<DevelopmentsPage />} />
                  <Route path="/empreendimentos/novo" element={<DevelopmentFormPage />} />
                  <Route path="/empreendimentos/:id/editar" element={<DevelopmentFormPage />} />
                  <Route path="/minha-aimee" element={<MinhaAimeePage />} />
                  <Route path="/acessos" element={<AcessosPage />} />
                  <Route path="/captacao" element={<CaptacaoPage />} />
                  <Route path="/atualizacao" element={<AtualizacaoPage />} />
                  <Route path="/templates" element={<TemplatesPage />} />
                  <Route path="/financeiro" element={<FinancePage />} />
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
