import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, ArrowRight, Mail, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'email' | 'password';

const AuthPage = () => {
  const { user, loading: authLoading, signIn } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-primary">
        <Loader2 className="h-8 w-8 animate-spin text-primary-foreground" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setStep('password');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError('Email ou senha inválidos.');
    setLoading(false);
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setError('');
  };

  return (
    <div className="flex min-h-screen gradient-primary">
      {/* Left side: branding */}
      <div className="hidden lg:flex flex-col justify-center items-center flex-1 p-10">
        <div className="max-w-md animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-primary-foreground tracking-tight mb-4">
            Aimee<span className="text-accent">.iA</span>
          </h1>
          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            Plataforma inteligente de atendimento para imobiliárias.
          </p>
          <div className="mt-8 space-y-4">
            <FeatureBullet
              title="Atendimento 24/7"
              desc="A Aimee responde seus leads via WhatsApp a qualquer hora"
            />
            <FeatureBullet
              title="Qualificação Inteligente"
              desc="IA identifica automaticamente o interesse e perfil de cada lead"
            />
            <FeatureBullet
              title="Integração CRM"
              desc="Leads qualificados são encaminhados para sua equipe de vendas"
            />
          </div>
        </div>
      </div>

      {/* Right side: login form */}
      <div className="flex flex-1 items-center justify-center p-4 lg:p-10 lg:max-w-lg">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile-only logo */}
          <div className="mb-8 text-center lg:hidden">
            <h1 className="font-display text-3xl font-bold text-primary-foreground tracking-tight">
              Aimee<span className="text-accent">.iA</span>
            </h1>
            <p className="mt-2 text-sm text-sidebar-foreground">
              Plataforma inteligente de atendimento
            </p>
          </div>

          <div className="rounded-xl bg-card p-8 shadow-prominent">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              <div className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                'bg-accent'
              )} />
              <div className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                step === 'password' ? 'bg-accent' : 'bg-muted'
              )} />
            </div>

            {step === 'email' ? (
              /* Step 1: Email */
              <form onSubmit={handleEmailNext} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Bem-vindo de volta</h2>
                  <p className="text-sm text-muted-foreground mt-1">Digite seu e-mail para continuar</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="h-11"
                  />
                </div>

                <Button type="submit" className="h-11 w-full gap-2">
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              /* Step 2: Password */
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Digite sua senha</h2>
                  <p className="text-sm text-muted-foreground mt-1">{email}</p>
                </div>

                {/* Back and email display */}
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao e-mail
                </button>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="h-11"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureBullet: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className="flex gap-3">
    <div className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
    <div>
      <p className="text-sm font-semibold text-primary-foreground">{title}</p>
      <p className="text-xs text-primary-foreground/60">{desc}</p>
    </div>
  </div>
);

export default AuthPage;
