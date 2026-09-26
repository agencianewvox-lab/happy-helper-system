import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Loader2, Layers3, MessageSquare, ChartNoAxesCombined } from "lucide-react";
import newvoxLogo from "@/assets/newvox-logo.jpg";

export default function Login() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setError("Não foi possível entrar. Confira seu e-mail e sua senha.");
    } catch { setError("Não foi possível conectar. Verifique sua internet e tente novamente."); }
    finally { setLoading(false); }
  }
  if (!authLoading && user) return <Navigate to="/" replace />;
  return (
    <main className="login-shell">
      <section className="login-story" aria-label="New Vox — espaço de trabalho">
        <a href="/login" className="brand-lockup" aria-label="New Vox, início"><img src={newvoxLogo} alt="" /><span>new vox<span className="brand-caption">WORKSPACE</span></span></a>
        <div className="login-editorial">
          <p className="eyebrow"><span /> PESSOAS. RELACIONAMENTOS. RESULTADOS.</p>
          <h1>Uma visão clara.<br />Um time <em>conectado.</em></h1>
          <p className="login-description">O cuidado com cada cliente começa aqui. Sua operação, suas conversas e os próximos passos, no mesmo lugar.</p>
          <div className="workspace-illustration" aria-hidden="true">
            <div className="illustration-heading"><span>NEW VOX / OPERAÇÃO</span><span className="illustration-dot" /></div>
            <div className="illustration-core"><Layers3 size={25} /><div><strong>Clareza para avançar</strong><span>Do primeiro contato à próxima conquista</span></div></div>
            <div className="illustration-flow"><span><MessageSquare size={16} /> Relacionamento</span><i /><span><ChartNoAxesCombined size={16} /> Evolução</span></div>
          </div>
        </div>
        <footer className="login-story-footer"><span>Feito para quem faz acontecer.</span><span>NEW VOX © {new Date().getFullYear()}</span></footer>
      </section>
      <section className="login-access" aria-labelledby="login-title">
        <div className="login-access-top"><LockKeyhole size={14} /> Ambiente exclusivo do time</div>
        <div className="login-form-wrap">
          <span className="login-section-number">01 / ACESSO AO WORKSPACE</span>
          <h2 id="login-title">Bom ter você aqui.</h2>
          <p className="login-intro">Entre com sua conta para acompanhar o que importa e dar continuidade ao seu dia.</p>
          <form onSubmit={handleLogin} className="space-y-5" aria-busy={loading}>
            <div className="space-y-2"><Label htmlFor="email">E-mail de acesso</Label><Input id="email" type="email" autoComplete="username" placeholder="Seu e-mail de acesso" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} className="login-input" /></div>
            <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} className="login-input pr-12" /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 px-4 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button type="submit" disabled={loading || authLoading} className="login-submit">{loading || authLoading ? <><Loader2 className="animate-spin" size={18} /> {loading ? "Entrando…" : "Verificando sessão…"}</> : <>Entrar no workspace <ArrowRight size={18} /></>}</Button>
          </form>
          <div className="login-help"><LockKeyhole size={17} /><p>Seu acesso é individual e autorizado pela New Vox.<br /><span>Precisa de ajuda? Fale com o administrador do time.</span></p></div>
        </div>
        <p className="login-client-note">É cliente? Use o link de onboarding enviado pela nossa equipe. Você não precisa fazer login.</p>
      </section>
    </main>
  );
}
