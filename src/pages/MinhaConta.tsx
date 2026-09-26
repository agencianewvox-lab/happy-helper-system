import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AccountPasswordForm } from '@/components/config/AccountPasswordForm';
import { ThemePreference } from '@/components/ThemePreference';

export default function MinhaConta() {
  const { user, loading } = useAuth();
  if (loading) return <div role="status" className="min-h-screen grid place-items-center">Verificando sua sessão…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"><ArrowLeft size={16} />Voltar ao painel</Link>
      <p className="login-section-number">CONFIGURAÇÕES / MINHA CONTA</p>
      <h1 className="text-3xl font-semibold tracking-tight mt-3">Seu acesso, seu controle.</h1>
      <p className="text-muted-foreground mt-3 mb-8">Gerencie a segurança da sua conta sem alterar os dados dos clientes ou as configurações do time.</p>
      <section className="rounded-2xl border bg-card p-6 sm:p-8 mb-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-xl font-semibold">Aparência do painel</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5">Escolha o visual mais confortável para trabalhar. Sua preferência fica salva neste navegador.</p>
        <ThemePreference />
      </section>
      <AccountPasswordForm key={user.id} userId={user.id} email={user.email} />
      <p className="flex gap-2 text-xs text-muted-foreground mt-5"><ShieldCheck size={15} className="shrink-0" />Área pessoal disponível para todos os integrantes autenticados do time.</p>
    </div>
  </main>;
}
