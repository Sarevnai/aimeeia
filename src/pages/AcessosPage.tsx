import React from 'react';
import { Shield } from 'lucide-react';

const AcessosPage: React.FC = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="font-display text-xl font-bold text-foreground">Acessos</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">Gerenciamento de usuários e permissões em breve.</p>
        </div>
      </div>
    </div>
  );
};

export default AcessosPage;
