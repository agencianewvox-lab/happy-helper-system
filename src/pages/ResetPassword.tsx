import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemePreference } from "@/components/ThemePreference";
import newvoxLogo from "@/assets/newvox-logo.jpg";

export default function ResetPassword() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linkError = new URLSearchParams(window.location.search).has("error")
    || new URLSearchParams(window.location.hash.slice(1)).has("error");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setError("Use uma senha de 12 a 128 caracteres. Uma frase longa e exclusiva é uma boa opção.");
      return;
    }
    if (password !== confirmation) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      const { data: current, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !current.user || current.user.id !== user?.id) {
        setError("O link expirou ou a sessão mudou. Solicite um novo link de recuperação.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (updateError.code === "same_password") setError("Escolha uma senha diferente da anterior.");
        else if (updateError.code === "weak_password") setError("O serviço recusou essa senha. Use uma frase mais forte e exclusiva.");
        else setError("Não foi possível salvar a nova senha. Solicite outro link e tente novamente.");
        return;
      }
      setPassword(""); setConfirmation("");
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        setError("Senha alterada, mas não foi possível encerrar a sessão. Saia manualmente do painel antes de entrar com a nova senha.");
        return;
      }
      navigate("/login?senha=atualizada", { replace: true });
    } catch {
      setError("Não foi possível concluir a alteração. Verifique sua conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="New Vox — espaço de trabalho">
        <Link to="/login" className="brand-lockup" aria-label="New Vox, login"><img src={newvoxLogo} alt="" /><span>new vox<span className="brand-caption">WORKSPACE</span></span></Link>
        <div className="login-editorial">
          <p className="eyebrow"><span /> ACESSO SEGURO AO SEU WORKSPACE</p>
          <h1>Seu acesso.<br />De volta <em>às suas mãos.</em></h1>
          <p className="login-description">Uma nova senha para seguir acompanhando seus clientes com tranquilidade.</p>
          <div className="workspace-illustration" aria-hidden="true">
            <div className="illustration-heading"><span>NEW VOX / SEGURANÇA</span><span className="illustration-dot" /></div>
            <div className="illustration-core"><ShieldCheck size={25} /><div><strong>Conta protegida</strong><span>Somente você pode redefinir sua senha</span></div></div>
          </div>
        </div>
        <footer className="login-story-footer"><span>Feito para quem faz acontecer.</span><span>NEW VOX © {new Date().getFullYear()}</span></footer>
      </section>
      <section className="login-access" aria-labelledby="reset-title">
        <div className="login-access-top"><KeyRound size={14} /> Recuperação de acesso <ThemePreference compact /></div>
        <div className="login-form-wrap">
          <span className="login-section-number">03 / NOVA SENHA</span>
          <h2 id="reset-title">Crie sua nova senha.</h2>
          {authLoading ? (
            <p role="status" className="login-intro flex items-center gap-2"><Loader2 size={17} className="animate-spin" /> Validando seu link...</p>
          ) : linkError || !user ? (
            <>
              <p role="alert" className="login-intro">Este link é inválido, expirou ou já foi utilizado. Solicite outro para recuperar seu acesso.</p>
              <Button asChild className="login-submit"><Link to="/login?recuperar=1">Solicitar novo link <ArrowRight size={18} /></Link></Button>
            </>
          ) : (
            <>
              <p className="login-intro">Você está redefinindo a senha de <strong className="text-foreground break-all">{user.email}</strong>. Se não for sua conta, não continue.</p>
              <form onSubmit={handleSubmit} className="space-y-5" aria-busy={busy}>
                <div className="space-y-2">
                  <Label htmlFor="reset-password">Nova senha</Label>
                  <div className="relative">
                    <Input id="reset-password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="login-input pr-12" aria-describedby="reset-guidance" />
                    <button type="button" aria-label={visible ? "Ocultar senhas" : "Mostrar senhas"} aria-pressed={visible} onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-0 px-4 text-muted-foreground hover:text-foreground">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                  <p id="reset-guidance" className="text-xs text-muted-foreground">De 12 a 128 caracteres. Use uma senha exclusiva para este painel.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirmation">Confirmar nova senha</Label>
                  <Input id="reset-confirmation" type={visible ? "text" : "password"} autoComplete="new-password" maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} className="login-input" />
                </div>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
                <Button type="submit" disabled={busy} className="login-submit">{busy ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <>Salvar nova senha <ArrowRight size={18} /></>}</Button>
              </form>
            </>
          )}
          <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"><ArrowLeft size={15} /> Voltar ao login</Link>
          <div className="login-help"><ShieldCheck size={17} /><p>Sua senha nunca é exibida para o time ou enviada por mensagem.<br /><span>Se você não solicitou esta alteração, ignore o e-mail recebido.</span></p></div>
        </div>
        <p className="login-client-note">Área exclusiva para integrantes do time New Vox.</p>
      </section>
    </main>
  );
}
