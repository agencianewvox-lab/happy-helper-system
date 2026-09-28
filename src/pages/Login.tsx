import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Loader2, Layers3, MessageSquare, ChartNoAxesCombined } from "lucide-react";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { ThemePreference } from "@/components/ThemePreference";

export default function Login() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot">(
    () => new URLSearchParams(window.location.search).get("recuperar") === "1" ? "forgot" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const passwordUpdated = new URLSearchParams(window.location.search).get("senha") === "atualizada";
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
  async function handleResetRequest(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "https://paineldecontrole.newvox.site/redefinir-senha",
      });
      if (resetError) setError("Não foi possível solicitar o link agora. Aguarde um momento e tente novamente.");
      else setSent(true);
    } catch {
      setError("Não foi possível conectar. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }
  function changeMode(next: "login" | "forgot") {
    setMode(next); setError(null); setSent(false); setPassword("");
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
        <div className="login-access-top"><LockKeyhole size={14} /> Ambiente exclusivo do time <ThemePreference compact /></div>
        <div className="login-form-wrap">
          <span className="login-section-number">{mode === "login" ? "01 / ACESSO AO WORKSPACE" : "02 / RECUPERAR ACESSO"}</span>
          <h2 id="login-title">{mode === "login" ? "Bom ter você aqui." : "Vamos recuperar seu acesso."}</h2>
          <p className="login-intro">{mode === "login" ? "Entre com sua conta para acompanhar o que importa e dar continuidade ao seu dia." : "Informe seu e-mail de acesso. Se houver uma conta vinculada, você receberá um link para criar uma nova senha."}</p>
          <form onSubmit={mode === "login" ? handleLogin : handleResetRequest} className="space-y-5" aria-busy={loading}>
            <div className="space-y-2"><Label htmlFor="email">E-mail de acesso</Label><Input id="email" type="email" autoComplete="username" placeholder="Seu e-mail de acesso" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} className="login-input" /></div>
            {mode === "login" && <>
              <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} className="login-input pr-12" /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 px-4 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              <button type="button" onClick={() => changeMode("forgot")} className="block ml-auto text-xs font-semibold text-primary hover:underline">Esqueceu sua senha?</button>
            </>}
            {mode === "login" && passwordUpdated && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Senha atualizada. Entre com a nova senha.</p>}
            {mode === "forgot" && sent && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Se esse e-mail estiver cadastrado, o link de recuperação chegará em instantes. Confira também a caixa de spam.</p>}
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <Button type="submit" disabled={loading || authLoading} className="login-submit">{loading || authLoading ? <><Loader2 className="animate-spin" size={18} /> {loading ? "Aguarde…" : "Verificando sessão…"}</> : <>{mode === "login" ? "Entrar no workspace" : sent ? "Reenviar link" : "Enviar link de recuperação"} <ArrowRight size={18} /></>}</Button>
          </form>
          {mode === "forgot" && <button type="button" onClick={() => changeMode("login")} className="mt-5 text-xs font-semibold text-primary hover:underline">Voltar para o login</button>}
          <div className="login-help"><LockKeyhole size={17} /><p>Seu acesso é individual e autorizado pela New Vox.<br /><span>Precisa de ajuda? Fale com o administrador do time.</span></p></div>
        </div>
        <p className="login-client-note">É cliente? Use o link de onboarding enviado pela nossa equipe. Você não precisa fazer login.</p>
      </section>
    </main>
  );
}
