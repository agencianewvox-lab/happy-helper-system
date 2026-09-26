import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

export function AccountPasswordForm({ userId, email }: { userId: string; email?: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [nonce, setNonce] = useState('');
  const [needsCurrent, setNeedsCurrent] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const inFlight = useRef(false);

  function clearSecrets() {
    setPassword(''); setConfirmation(''); setNonce(''); setCurrentPassword(''); setVisible(false);
  }

  async function validateSession() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== userId) {
      clearSecrets();
      throw new Error('Sua sessão expirou ou mudou. Entre novamente na sua conta antes de alterar a senha.');
    }
  }

  async function sendCode() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await validateSession();
      const { error } = await supabase.auth.reauthenticate();
      if (error) setError('Não foi possível enviar o código. Aguarde um momento e tente novamente.');
      else setNotice('Código solicitado. Confira o e-mail ou telefone cadastrado, incluindo a caixa de spam.');
    } catch { setError('Não foi possível confirmar sua sessão ou enviar o código. Tente novamente.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(''); setNotice('');
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setError('Use uma senha de 12 a 128 caracteres. Uma frase longa e exclusiva é uma boa opção.'); return;
    }
    if (password !== confirmation) { setError('As duas senhas precisam ser iguais.'); return; }
    if (needsCode && !nonce.trim()) { setError('Informe o código de confirmação recebido.'); return; }
    if (needsCurrent && !currentPassword) { setError('Informe a senha atual exigida pelo serviço de autenticação.'); return; }
    inFlight.current = true; setBusy(true);
    try {
      await validateSession();
      // Auth determines the target from the signed-in session; no editable user ID,
      // email, role or administrative credential is sent with the password change.
      const attributes: { password: string; nonce?: string; current_password?: string } = { password };
      if (needsCode) attributes.nonce = nonce.trim();
      if (needsCurrent) attributes.current_password = currentPassword;
      const { data, error } = await supabase.auth.updateUser(attributes);
      if (error) {
        if (error.code === 'reauthentication_needed' || error.code === 'reauthentication_not_valid') {
          setNeedsCode(true);
          setError('Confirme sua identidade: solicite um código e informe-o abaixo para salvar a nova senha.');
        } else if (String(error.code) === 'current_password_required' || String(error.code) === 'current_password_invalid') {
          setNeedsCurrent(true); setError('O serviço exige a senha atual. Informe-a para continuar.');
        } else if (error.code === 'same_password') setError('Escolha uma senha diferente da que você usa atualmente.');
        else if (error.code === 'weak_password') setError('O serviço recusou essa senha. Use uma senha mais forte, com letras, números e símbolos, sem reutilizar senhas antigas.');
        else setError('Não foi possível alterar a senha. Verifique sua conexão e tente novamente; se persistir, entre novamente na conta.');
        return;
      }
      if (!data.user || data.user.id !== userId) throw new Error('Não foi possível confirmar a alteração. Entre novamente para verificar sua conta.');
      clearSecrets(); setNeedsCode(false); setNeedsCurrent(false);
      setNotice('Senha alterada com sucesso. No próximo acesso, use a nova senha.');
    } catch (cause) {
      // Never display provider payloads or log passwords/verification codes.
      setError(cause instanceof Error && cause.message.startsWith('Sua sessão') ? cause.message : 'Não foi possível confirmar a alteração. Verifique sua conexão antes de tentar novamente.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="rounded-2xl border bg-card p-6 sm:p-8" aria-labelledby="password-heading">
    <div className="flex gap-4 items-start mb-7"><div className="rounded-xl bg-primary/10 p-3 text-primary"><KeyRound size={23} /></div><div><h2 id="password-heading" className="text-xl font-semibold">Alterar minha senha</h2><p className="text-sm text-muted-foreground mt-1">Proteja seu acesso pessoal ao workspace.</p></div></div>
    <div className="rounded-xl bg-muted/60 p-4 mb-6"><p className="text-xs text-muted-foreground mb-1">Conta conectada</p><p className="text-sm font-medium break-all">{email || 'Sua conta do time'}</p></div>
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={busy}>
      <div className="space-y-2"><Label htmlFor="account-new-password">Nova senha</Label><div className="relative"><Input id="account-new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} aria-describedby="password-guidance" className="h-12 pr-12" /><button type="button" onClick={() => setVisible(value => !value)} disabled={busy} aria-label={visible ? 'Ocultar senhas' : 'Mostrar senhas'} aria-pressed={visible} className="absolute inset-y-0 right-0 px-4 text-muted-foreground">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><p id="password-guidance" className="text-xs text-muted-foreground">De 12 a 128 caracteres. Prefira uma frase longa e exclusiva para este painel.</p></div>
      <div className="space-y-2"><Label htmlFor="account-confirm-password">Confirmar nova senha</Label><Input id="account-confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} className="h-12" /></div>
      {needsCurrent && <div className="space-y-2"><Label htmlFor="account-current-password">Senha atual</Label><Input id="account-current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={busy} /></div>}
      {needsCode && <div className="space-y-3 rounded-xl border p-4"><p className="text-sm">O serviço de autenticação exige uma confirmação adicional.</p><Button type="button" variant="outline" onClick={sendCode} disabled={busy}>Enviar código de confirmação</Button><div className="space-y-2"><Label htmlFor="account-password-code">Código de confirmação</Label><Input id="account-password-code" autoComplete="one-time-code" inputMode="numeric" required value={nonce} onChange={e => setNonce(e.target.value)} disabled={busy} /></div></div>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
      <div className="flex flex-wrap gap-3 pt-2"><Button type="submit" disabled={busy} className="h-11">{busy ? <Loader2 size={17} className="mr-2 animate-spin" /> : <ShieldCheck size={17} className="mr-2" />}{busy ? 'Aguarde…' : 'Salvar nova senha'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { clearSecrets(); setError(''); setNotice(''); }}>Limpar campos</Button></div>
      <p className="text-xs leading-relaxed text-muted-foreground">A alteração vale somente para a conta conectada. Não compartilhe sua senha ou códigos de confirmação com outras pessoas.</p>
    </form>
  </section>;
}
