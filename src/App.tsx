import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { DepartmentFilterProvider } from "@/contexts/DepartmentFilterContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";
import InboxPage from "@/pages/InboxPage";
import ChatPage from "@/pages/ChatPage";
import HistoryPage from "@/pages/HistoryPage";
import LeadsPage from "@/pages/LeadsPage";
import PipelinePage from "@/pages/PipelinePage";
import FollowUpArchivedPage from "@/pages/FollowUpArchivedPage";
import MinhaAimeePage from "@/pages/MinhaAimeePage";
import CampaignsPage from "@/pages/CampaignsPage";
import CampaignDetailPage from "@/pages/CampaignDetailPage";
import ReportsPage from "@/pages/ReportsPage";
import C2SAnalyticsPage from "@/pages/C2SAnalyticsPage";
import DevelopmentsPage from "@/pages/DevelopmentsPage";
import DevelopmentFormPage from "@/pages/DevelopmentFormPage";
import AcessosPage from "@/pages/AcessosPage";
import CaptacaoPage from "@/pages/CaptacaoPage";
import GuiaPage from "@/pages/GuiaPage";
import ModulosPage from "@/pages/ModulosPage";

import AtualizacaoPage from "@/pages/AtualizacaoPage";
import FinancePage from "@/pages/FinancePage";
import TicketsPage from "@/pages/TicketsPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import NotFound from "./pages/NotFound";

// Painel de Controle
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminTenantsPage from "@/pages/admin/AdminTenantsPage";
import AdminTenantDetailPage from "@/pages/admin/AdminTenantDetailPage";
import AdminBillingPage from "@/pages/admin/AdminBillingPage";
import AdminMetricsPage from "@/pages/admin/AdminMetricsPage";
import AdminCampaignsPage from "@/pages/admin/AdminCampaignsPage";
import AgentsOverviewPage from "@/pages/admin/AgentsOverviewPage";
import AgentDetailPage from "@/pages/admin/AgentDetailPage";
import AgentGlobalSettingsPage from "@/pages/admin/AgentGlobalSettingsPage";

import AdminModulosPage from "@/pages/admin/AdminModulosPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";

// AI Lab
import LabLayout from "@/pages/admin/lab/LabLayout";
import LabSimulatorPage from "@/pages/admin/lab/LabSimulatorPage";
import LabPromptsPage from "@/pages/admin/lab/LabPromptsPage";
import LabAgentConfigPage from "@/pages/admin/lab/LabAgentConfigPage";
import LabTriagePage from "@/pages/admin/lab/LabTriagePage";
import LabAnalysisPage from "@/pages/admin/lab/LabAnalysisPage";
import LabRealConversationsPage from "@/pages/admin/lab/LabRealConversationsPage";

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
                <Route path="/landing" element={<LandingPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/chat/:id" element={<ChatPage />} />
                  <Route path="/history/:id" element={<HistoryPage />} />
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/pipeline" element={<PipelinePage />} />
                  <Route path="/followup-arquivados" element={<FollowUpArchivedPage />} />
                  <Route path="/campanhas" element={<CampaignsPage />} />
                  <Route path="/campanhas/:id" element={<CampaignDetailPage />} />
                  <Route path="/relatorios" element={<ReportsPage />} />
                  <Route path="/dashboard-c2s" element={<C2SAnalyticsPage />} />
                  <Route path="/empreendimentos" element={<DevelopmentsPage />} />
                  <Route path="/empreendimentos/novo" element={<DevelopmentFormPage />} />
                  <Route path="/empreendimentos/:id/editar" element={<DevelopmentFormPage />} />
                  <Route path="/minha-aimee" element={<MinhaAimeePage />} />
                  <Route path="/acessos" element={<AcessosPage />} />
                  <Route path="/captacao" element={<CaptacaoPage />} />
                  <Route path="/atualizacao" element={<AtualizacaoPage />} />
                  <Route path="/financeiro" element={<FinancePage />} />
                  <Route path="/chamados" element={<TicketsPage />} />
                  <Route path="/chamados/:id" element={<TicketDetailPage />} />
                  <Route path="/modulos" element={<ModulosPage />} />

                  <Route path="/guia" element={<GuiaPage />} />
                </Route>
                {/* Admin Central — super_admin only */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="tenants" element={<AdminTenantsPage />} />
                  <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
                  <Route path="billing" element={<AdminBillingPage />} />
                  <Route path="agents" element={<AgentsOverviewPage />} />
                  <Route path="agents/settings" element={<AgentGlobalSettingsPage />} />
                  <Route path="agents/:agentType" element={<AgentDetailPage />} />
                  <Route path="agent" element={<Navigate to="/admin/agents" replace />} />
                  <Route path="metrics" element={<AdminMetricsPage />} />
                  <Route path="campanhas" element={<AdminCampaignsPage />} />

                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="modulos" element={<AdminModulosPage />} />
                  <Route path="lab" element={<LabLayout />}>
                    <Route index element={<LabSimulatorPage />} />
                    <Route path="prompts" element={<LabPromptsPage />} />
                    <Route path="agent-config" element={<LabAgentConfigPage />} />
                    <Route path="triage" element={<LabTriagePage />} />
                    <Route path="real-conversations" element={<LabRealConversationsPage />} />
                    <Route path="analysis" element={<LabAnalysisPage />} />
                  </Route>
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
