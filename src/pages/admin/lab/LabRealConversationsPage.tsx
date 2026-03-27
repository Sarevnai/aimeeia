import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import RealConversationList from '@/components/lab/RealConversationList';
import RealConversationAnalyzer from '@/components/lab/RealConversationAnalyzer';
import PromptVersionTracker from '@/components/lab/PromptVersionTracker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface Tenant {
  id: string;
  company_name: string;
}

interface ConversationItem {
  id: string;
  phone_number: string;
  contact_name?: string;
  department_code: string | null;
  status: string;
  source: string | null;
  message_count: number;
  last_message_at: string | null;
  latest_score?: number | null;
  report_count?: number;
}

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string | null;
  sender_type: string | null;
  created_at: string | null;
}

export default function LabRealConversationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filters, setFilters] = useState({ search: '', department: 'all', status: 'all' });
  const [activeTab, setActiveTab] = useState('analyzer');
  const [listCollapsed, setListCollapsed] = useState(false);

  // Load tenants
  useEffect(() => {
    async function loadTenants() {
      const { data } = await supabase
        .from('tenants')
        .select('id, company_name')
        .eq('is_active', true)
        .order('company_name');
      setTenants((data || []) as Tenant[]);
      if (data?.length === 1) setTenantId(data[0].id);
    }
    loadTenants();
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!tenantId) return;
    setConversationsLoading(true);

    // Build query
    let query = supabase
      .from('conversations')
      .select(`
        id, phone_number, department_code, status, source, last_message_at,
        contacts!conversations_contact_id_fkey(name)
      `)
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false })
      .limit(100);

    // Filter out simulation conversations
    query = query.not('source', 'eq', 'simulation');

    if (filters.department !== 'all') {
      query = query.eq('department_code', filters.department);
    }
    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data: convData } = await query;

    if (!convData) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }

    // Get message counts
    const convIds = convData.map((c: any) => c.id);

    // Get latest reports for each conversation
    const { data: reportsData } = await supabase
      .from('analysis_reports')
      .select('conversation_id, avg_score, version')
      .in('conversation_id', convIds)
      .order('version', { ascending: false });

    const reportMap = new Map<string, { score: number; count: number }>();
    for (const r of (reportsData || [])) {
      if (!reportMap.has(r.conversation_id)) {
        reportMap.set(r.conversation_id, { score: r.avg_score || 0, count: 1 });
      } else {
        reportMap.get(r.conversation_id)!.count++;
      }
    }

    // Get message counts per conversation
    const { data: msgCounts } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .eq('tenant_id', tenantId);

    const countMap = new Map<string, number>();
    for (const m of (msgCounts || [])) {
      countMap.set(m.conversation_id, (countMap.get(m.conversation_id) || 0) + 1);
    }

    const items: ConversationItem[] = convData.map((c: any) => ({
      id: c.id,
      phone_number: c.phone_number,
      contact_name: c.contacts?.name || undefined,
      department_code: c.department_code,
      status: c.status,
      source: c.source,
      message_count: countMap.get(c.id) || 0,
      last_message_at: c.last_message_at,
      latest_score: reportMap.get(c.id)?.score || null,
      report_count: reportMap.get(c.id)?.count || 0,
    }));

    // Apply search filter client-side
    const filtered = filters.search
      ? items.filter(c =>
          c.phone_number.includes(filters.search) ||
          c.contact_name?.toLowerCase().includes(filters.search.toLowerCase())
        )
      : items;

    setConversations(filtered);
    setConversationsLoading(false);
  }, [tenantId, filters]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('id, direction, body, sender_type, created_at')
      .eq('conversation_id', convId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(500);

    setMessages((data || []) as Message[]);
    setMessagesLoading(false);
  }, [tenantId]);

  const handleSelectConversation = useCallback((convId: string) => {
    setSelectedConvId(convId);
    loadMessages(convId);
    setActiveTab('analyzer');
    setListCollapsed(true); // Auto-collapse list when selecting a conversation
  }, [loadMessages]);

  return (
    <div className="flex h-full">
      {/* Left: Conversation List (collapsible) */}
      {!listCollapsed && (
        <div className="w-56 border-r flex flex-col shrink-0">
          {/* Tenant Selector */}
          <div className="p-3 border-b">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar tenant..." />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <RealConversationList
            conversations={conversations}
            loading={conversationsLoading}
            selectedId={selectedConvId}
            onSelect={handleSelectConversation}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      )}

      {/* Right: Analyzer or Prompt Tracker */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConvId ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mx-3 mt-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setListCollapsed(!listCollapsed)}
                className="h-7 w-7 p-0"
                title={listCollapsed ? 'Mostrar lista' : 'Esconder lista'}
              >
                {listCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              <TabsList className="w-fit h-7">
                <TabsTrigger value="analyzer" className="text-xs h-6 px-3">Analise</TabsTrigger>
                <TabsTrigger value="prompts" className="text-xs h-6 px-3">Prompt Versions</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="analyzer" className="flex-1 mt-0 overflow-hidden" style={{ display: activeTab === 'analyzer' ? 'flex' : 'none', flexDirection: 'column' }}>
              <RealConversationAnalyzer
                tenantId={tenantId}
                conversationId={selectedConvId}
                messages={messages}
                messagesLoading={messagesLoading}
                onAnalysisComplete={loadConversations}
              />
            </TabsContent>

            <TabsContent value="prompts" className="flex-1 mt-0 overflow-y-auto p-4">
              <PromptVersionTracker
                tenantId={tenantId}
                conversationId={selectedConvId}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {tenantId ? 'Selecione uma conversa para analisar' : 'Selecione um tenant para comecar'}
          </div>
        )}
      </div>
    </div>
  );
}
