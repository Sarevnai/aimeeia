import React from 'react';
import { Shield } from 'lucide-react';

const AcessosPage: React.FC = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="font-display text-2xl font-bold text-foreground">Acessos</h2>
        <p className="text-sm text-muted-foreground">Gerencie usuários, permissões e níveis de acesso</p>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-accent" />
          </div>
          <p className="text-foreground font-medium">Em breve</p>
          <p className="text-muted-foreground text-sm">
            O gerenciamento de usuários e permissões está sendo desenvolvido. Em breve você poderá convidar colaboradores e definir níveis de acesso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcessosPage;
