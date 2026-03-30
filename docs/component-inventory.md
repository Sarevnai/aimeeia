# Aimee.iA — Component Inventory

**Generated:** 2026-03-30

---

## Component Directory Structure

```
src/components/
├── admin/           # Admin panel components
├── campaigns/       # Campaign + remarketing components
├── chat/            # Chat UI components
├── finance/         # Finance/billing components
├── lab/             # AI Lab components
├── modules/         # AI modules editor
├── settings/        # Agent settings (minha-aimee)
├── simulation/      # Simulation UI components
├── ui/              # Shadcn/UI base components
└── (top-level)      # Layout + shared components
```

---

## Layout Components (Top-Level)

| Component | Purpose | Data Connected |
|-----------|---------|----------------|
| `AppLayout.tsx` | Auth guard + sidebar + header + outlet | Yes (AuthContext) |
| `AppHeader.tsx` | Department filter + user avatar + logout | Yes (Auth + DeptFilter) |
| `AppSidebar.tsx` | Role-based navigation (6 groups) + badge counts | Yes (Auth + Tenant + Supabase) |
| `MobileBottomNav.tsx` | Mobile bottom nav (5 items) | No (static) |
| `NavLink.tsx` | React Router NavLink wrapper | No (utility) |
| `PageHeader.tsx` | Reusable page header (title, icon, actions) | No (props) |
| `ConfirmDialog.tsx` | Confirmation dialog (destructive actions) | No (props) |
| `Skeletons.tsx` | Loading skeleton collection (6 variants) | No (presentational) |
| `EmptyState.tsx` | Empty state with icon + action | No (props) |

---

## Feature Component Directories

### `admin/` — Admin Panel Components

| Component | Purpose |
|-----------|---------|
| `AdminLayout.tsx` | Admin layout wrapper (super_admin guard) |
| `TenantAgentSelector.tsx` | Tenant dropdown for agent pages |
| `AdminTemplatesTab.tsx` | WhatsApp templates management tab |
| `AdminContactsTab.tsx` | Contacts management tab |
| `AdminNewCampaignSheet.tsx` | Campaign creation sheet |
| `AgentDirectiveEditor.tsx` | Directive text editor |
| `AgentToolsList.tsx` | Agent tools toggle list |
| `AgentBehaviorEditor.tsx` | Behavior config editor |
| `AgentDepartmentConfigEditor.tsx` | Per-department config |
| `AgentErrorsTable.tsx` | Error log table |
| `AIMetricsPanel.tsx` | AI cost/usage metrics panel |

### `campaigns/` — Campaign Components

| Component | Purpose |
|-----------|---------|
| `NewCampaignDialog.tsx` | New campaign creation dialog |
| `LeadImportSheet.tsx` | XLSX upload + parse for CRM lead import |
| `RemarketingCampaignSheet.tsx` | 4-step remarketing wizard |

### `chat/` — Chat UI Components

| Component | Purpose |
|-----------|---------|
| `ChatMediaUpload.tsx` | Media upload (image/doc) for chat |
| Message bubble components | Inbound/outbound message rendering |
| Lead qualification sidebar | Contact info + qualification data |

### `finance/` — Finance Components

| Component | Purpose |
|-----------|---------|
| `CurrentPlanCard.tsx` | Current plan display |
| `CurrentInvoiceCard.tsx` | Current invoice display |
| `InvoiceHistoryCard.tsx` | Invoice history table |
| `PlanUpgradeDialog.tsx` | Plan upgrade dialog |

**Note**: All finance components render mock/placeholder data.

### `lab/` — AI Lab Components

| Component | Purpose |
|-----------|---------|
| `SimuladorChat.tsx` | Chat interface for AI simulation |
| `SimuladorSidebar.tsx` | Simulation metadata sidebar |
| `RealConversationAnalyzer.tsx` | Conversation analysis UI |
| `PromptVersionTracker.tsx` | Prompt version comparison |

### `modules/` — AI Modules

| Component | Purpose |
|-----------|---------|
| `ModuleEditorSheet.tsx` | Create/edit AI intelligence modules |

### `settings/` — Agent Settings (Minha Aimee)

| Component | Purpose |
|-----------|---------|
| `PerguntasTab.tsx` | Qualification questions config |
| `FuncoesTab.tsx` | Agent functions/tools config |
| `MeuNegocioView.tsx` | Business rules config |
| `PerfilWhatsAppView.tsx` | WhatsApp profile settings |

### `simulation/` — Simulation UI

| Component | Purpose |
|-----------|---------|
| Simulation-specific UI components | Used by LabSimulatorPage |

---

## Shadcn/UI Base Components (`ui/`)

Standard Shadcn/UI components used throughout the application:

| Category | Components |
|----------|------------|
| **Layout** | Card, Separator, ScrollArea, AspectRatio, ResizablePanels |
| **Navigation** | NavigationMenu, Menubar, Tabs, Breadcrumb |
| **Forms** | Button, Input, Label, Textarea, Select, Checkbox, RadioGroup, Switch, Slider, Calendar |
| **Feedback** | Toast, Sonner, Alert, Progress, Skeleton |
| **Overlay** | Dialog, AlertDialog, Sheet, Popover, HoverCard, Tooltip, DropdownMenu, ContextMenu |
| **Data** | Table, Badge, Avatar, Accordion, Collapsible, Command, Toggle, ToggleGroup |
| **Input** | InputOTP, Drawer (Vaul) |
| **Chart** | Chart (wrapper for Recharts) |

---

## Component Patterns

### Data Fetching
Components use direct Supabase client calls inside `useEffect`:
```typescript
useEffect(() => {
  const fetchData = async () => {
    const { data } = await supabase.from('table').select('*');
    setData(data);
  };
  fetchData();
}, [tenantId]);
```

### State Persistence
Components use `useSessionState` for search/filter persistence:
```typescript
const [search, setSearch] = useSessionState('page_search', '');
```

### Role-Based Rendering
Admin components check `profile.role`:
```typescript
if (profile?.role !== 'super_admin') return <Navigate to="/" />;
```

### Realtime Updates
Chat and ticket components subscribe to Supabase Realtime:
```typescript
const channel = supabase.channel('messages')
  .on('postgres_changes', {...}, handleChange)
  .subscribe();
```
