import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { meetingsApi } from "@/lib/meetings";
export default function MeetingConnect() {
  const { user, loading } = useAuth(),
    { profile, isAdmin, isMaster, loading: profileLoading } = useProfile();
  const [request] = useState(() =>
    Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))),
  );
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(""),
    [error, setError] = useState("");
  const valid =
    /^[0-9a-f-]{36}$/i.test(request.deviceId || "") &&
    /^[0-9a-f]{64}$/.test(request.challenge || "") &&
    !!request.label &&
    request.label.length <= 100;
  async function authorize() {
    setBusy(true);
    setError("");
    try {
      const data = await meetingsApi<{ status: string }>("pair", request);
      setResult(
        data.status === "approved"
          ? "Dispositivo autorizado. Volte à extensão e clique em ‘Já autorizei’."
          : "Solicitação registrada. Peça ao Master a aprovação em Reuniões → Dispositivos e depois volte à extensão.",
      );
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-8">
        <ShieldCheck className="mb-6 h-10 w-10 text-primary" />
        <p className="text-xs uppercase tracking-[.2em] text-primary">
          Newvox / Autorização da extensão
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Conectar este computador
        </h1>
        {loading || profileLoading ? (
          <p className="mt-5" role="status">
            Verificando sua sessão…
          </p>
        ) : !valid ? (
          <p className="mt-5" role="alert">
            Solicitação inválida. Inicie a conexão pelo botão “Autenticar no
            painel” da extensão.
          </p>
        ) : !user ? (
          <div className="mt-5 space-y-4">
            <p>
              Entre no painel com sua conta individual. Não informe sua senha à
              extensão.
            </p>
            <Button asChild>
              <a href="/login" target="_blank" rel="noopener">
                Entrar no painel
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Depois do login, volte a esta aba. Sua sessão será reconhecida
              automaticamente.
            </p>
          </div>
        ) : !(isMaster || isAdmin || profile?.role === "gestor") ? (
          <p className="mt-5" role="alert">
            A extensão é exclusiva do Master e dos gestores.
          </p>
        ) : result ? (
          <p
            className="mt-6 rounded-xl border border-primary/40 p-4"
            role="status"
          >
            {result}
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border p-4">
              <Monitor className="mb-3 text-primary" />
              <strong>{request.label}</strong>
              <p className="mt-2 text-sm text-muted-foreground">
                Conta: {profile?.full_name}
                <br />
                Versão informada: {request.version || "Não informada"}
                <br />
                Código de conferência:{" "}
                <strong>{request.challenge.slice(0, 8).toUpperCase()}</strong>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Autoriza listar sua carteira e registrar reuniões. Não libera
              senhas dos clientes, envio de mensagens nem administração. A
              sessão expira em até 8 horas e pode ser revogada pelo Master.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Eu iniciei esta conexão no meu computador e conferi o código na
              extensão. Não estou autorizando um link recebido de terceiros.
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              disabled={!confirmed || busy}
              onClick={() => void authorize()}
            >
              {busy ? "Autorizando…" : "Autorizar esta instalação"}
            </Button>
          </div>
        )}
        <p className="mt-6 text-sm">
          <Link className="text-primary" to="/reunioes">
            Voltar às reuniões
          </Link>
        </p>
      </section>
    </main>
  );
}
