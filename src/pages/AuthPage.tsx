import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, ArrowRight, Mail, Lock, User, KeyRound, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'signup';
type LoginStep = 'email' | 'password';
type SignupStep = 'email' | 'details' | 'access_code' | 'success';

const AuthPage = () => {
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [loginStep, setLoginStep] = useState<LoginStep>('email');

  // Signup state
  const [signupStep, setSignupStep] = useState<SignupStep>('email');
  const [tenantName, setTenantName] = useState('');
  const [foundTenantId, setFoundTenantId] = useState('');

  // Shared state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accessCode, setAccessCode] = useState('');
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

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setAccessCode('');
    setError('');
    setLoginStep('email');
    setSignupStep('email');
    setTenantName('');
    setFoundTenantId('');
  };

  const toggleMode = () => {
    resetForm();
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  // ===== LOGIN FLOW =====
  const handleLoginEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoginStep('password');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError('Email ou senha inválidos.');
    setLoading(false);
  };

  // ===== SIGNUP FLOW =====
  const handleSignupEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setSignupStep('details');
  };

  const handleSignupDetailsNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password.trim()) return;
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setError('');
    setSignupStep('access_code');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;
    setError('');
    setLoading(true);

    try {
      // Step 1: Validate access code
      const { data: tenantData, error: lookupError } = await supabase.rpc(
        'lookup_tenant_by_access_code',
        { code: accessCode.trim().toUpperCase() }
      );

      if (lookupError || !tenantData || tenantData.length === 0) {
        setError('Código de acesso inválido. Verifique com seu administrador.');
        setLoading(false);
        return;
      }

      const tenant = tenantData[0];
      setFoundTenantId(tenant.tenant_id);
      setTenantName(tenant.company_name);

      // Step 2: Create auth user
      const { user: newUser, error: signUpError } = await signUp(email, password);

      if (signUpError || !newUser) {
        const msg = (signUpError as any)?.message || '';
        if (msg.includes('already registered')) {
          setError('Este email já está cadastrado. Tente fazer login.');
        } else {
          setError('Erro ao criar conta. Tente novamente.');
        }
        setLoading(false);
        return;
      }

      // Step 3: Create profile via Edge Function
      const { data: regData, error: regError } = await supabase.functions.invoke('manage-team', {
        body: {
          action: 'register_new_member',
          user_id: newUser.id,
          tenant_id: tenant.tenant_id,
          full_name: fullName.trim(),
        },
      });

      if (regError) {
        console.error('Profile creation error:', regError);
        setError('Conta criada, mas houve um erro ao vincular à empresa. Contate o administrador.');
        setLoading(false);
        return;
      }

      setSignupStep('success');
    } catch (err) {
      console.error('Signup error:', err);
      setError('Erro inesperado. Tente novamente.');
    }

    setLoading(false);
  };

  const handleGoToLogin = () => {
    resetForm();
    setMode('login');
  };

  // ===== STEP INDICATORS =====
  const loginSteps = 2;
  const loginCurrentStep = loginStep === 'email' ? 1 : 2;
  const signupSteps = 3;
  const signupCurrentStep = signupStep === 'email' ? 1 : signupStep === 'details' ? 2 : 3;

  const activeSteps = mode === 'login' ? loginCurrentStep : signupCurrentStep;
  const totalSteps = mode === 'login' ? loginSteps : signupSteps;

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
            <FeatureBullet title="Atendimento 24/7" desc="A Aimee responde seus leads via WhatsApp a qualquer hora" />
            <FeatureBullet title="Qualificação Inteligente" desc="IA identifica automaticamente o interesse e perfil de cada lead" />
            <FeatureBullet title="Integração CRM" desc="Leads qualificados são encaminhados para sua equipe de vendas" />
          </div>
        </div>
      </div>

      {/* Right side: auth form */}
      <div className="flex flex-1 items-center justify-center p-4 lg:p-10 lg:max-w-lg">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile-only logo */}
          <div className="mb-8 text-center lg:hidden">
            <h1 className="font-display text-3xl font-bold text-primary-foreground tracking-tight">
              Aimee<span className="text-accent">.iA</span>
            </h1>
            <p className="mt-2 text-sm text-sidebar-foreground">Plataforma inteligente de atendimento</p>
          </div>

          <div className="rounded-xl bg-card p-8 shadow-prominent">
            {/* Step indicator */}
            {signupStep !== 'success' && (
              <div className="flex items-center gap-2 mb-6">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      i < activeSteps ? 'bg-accent' : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            )}

            {/* ===== LOGIN MODE ===== */}
            {mode === 'login' && loginStep === 'email' && (
              <form onSubmit={handleLoginEmailNext} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Bem-vindo de volta</h2>
                  <p className="text-sm text-muted-foreground mt-1">Digite seu e-mail para continuar</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus className="h-11" />
                </div>
                <Button type="submit" className="h-11 w-full gap-2">Continuar <ArrowRight className="h-4 w-4" /></Button>
                <p className="text-center text-sm text-muted-foreground">
                  Não tem conta?{' '}
                  <button type="button" onClick={toggleMode} className="text-accent hover:text-accent/80 font-medium transition-colors">
                    Criar conta
                  </button>
                </p>
              </form>
            )}

            {mode === 'login' && loginStep === 'password' && (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Digite sua senha</h2>
                  <p className="text-sm text-muted-foreground mt-1">{email}</p>
                </div>
                <button type="button" onClick={() => { setLoginStep('email'); setPassword(''); setError(''); }} className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao e-mail
                </button>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoFocus className="h-11" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
                </Button>
              </form>
            )}

            {/* ===== SIGNUP MODE ===== */}
            {mode === 'signup' && signupStep === 'email' && (
              <form onSubmit={handleSignupEmailNext} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Criar conta</h2>
                  <p className="text-sm text-muted-foreground mt-1">Digite seu e-mail para começar</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-foreground">E-mail</Label>
                  <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus className="h-11" />
                </div>
                <Button type="submit" className="h-11 w-full gap-2">Continuar <ArrowRight className="h-4 w-4" /></Button>
                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{' '}
                  <button type="button" onClick={toggleMode} className="text-accent hover:text-accent/80 font-medium transition-colors">
                    Fazer login
                  </button>
                </p>
              </form>
            )}

            {mode === 'signup' && signupStep === 'details' && (
              <form onSubmit={handleSignupDetailsNext} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Seus dados</h2>
                  <p className="text-sm text-muted-foreground mt-1">{email}</p>
                </div>
                <button type="button" onClick={() => { setSignupStep('email'); setError(''); }} className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </button>
                <div className="space-y-2">
                  <Label htmlFor="full-name" className="text-foreground">Nome completo</Label>
                  <Input id="full-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome completo" required autoFocus className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-foreground">Senha</Label>
                  <Input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required className="h-11" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="h-11 w-full gap-2">Continuar <ArrowRight className="h-4 w-4" /></Button>
              </form>
            )}

            {mode === 'signup' && signupStep === 'access_code' && (
              <form onSubmit={handleSignupSubmit} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <KeyRound className="h-6 w-6 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-foreground">Código de acesso</h2>
                  <p className="text-sm text-muted-foreground mt-1">Peça o código ao administrador da sua empresa</p>
                </div>
                <button type="button" onClick={() => { setSignupStep('details'); setError(''); }} className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </button>
                <div className="space-y-2">
                  <Label htmlFor="access-code" className="text-foreground">Código da empresa</Label>
                  <Input
                    id="access-code"
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="Ex: A3B7K2"
                    required
                    autoFocus
                    maxLength={6}
                    className="h-11 text-center text-2xl tracking-[0.3em] font-bold uppercase"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar conta'}
                </Button>
              </form>
            )}

            {mode === 'signup' && signupStep === 'success' && (
              <div className="space-y-5 text-center">
                <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="font-display text-lg font-bold text-foreground">Conta criada com sucesso!</h2>
                <p className="text-sm text-muted-foreground">
                  Você foi vinculado à empresa <strong>{tenantName}</strong> como operador.
                </p>
                <p className="text-xs text-muted-foreground">
                  Verifique seu e-mail para confirmar sua conta, depois faça login.
                </p>
                <Button onClick={handleGoToLogin} className="h-11 w-full">
                  Ir para o login
                </Button>
              </div>
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
