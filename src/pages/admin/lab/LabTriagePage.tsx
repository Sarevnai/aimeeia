import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';

export default function LabTriagePage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <GitBranch className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Configuração de Triage</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mensagens de Triage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A configuração de triage é feita via <code>triage_config</code> no <code>ai_agent_config</code> de cada tenant.
            As mensagens de greeting, name confirmation, VIP intro e department welcome podem ser customizadas por tenant.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Use o Simulador para testar o fluxo de triage em tempo real.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
