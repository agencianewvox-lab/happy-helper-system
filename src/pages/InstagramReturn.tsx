import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Instagram, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { instagramApi } from "@/lib/social-instagram";
type Candidate = {
  clientId: string;
  clientName: string;
  username: string;
  canPublish: boolean;
  expiresAt: string;
};
export default function InstagramReturn() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const started = useRef(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    // Remove the single-use code from browser history before loading other pages.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    if (loading || started.current) return;
    started.current = true;
    if (!user) {
      setError(
        "Sua sessão terminou. Entre no Painel e inicie a conexão novamente.",
      );
      return;
    }
    if (params.get("error")) {
      setError(
        "Autorização cancelada no Instagram. Nenhuma conexão foi alterada.",
      );
      return;
    }
    const code = params.get("code"),
      state = params.get("state");
    if (!code || !state) {
      setError("Retorno inválido. Inicie a conexão pela Social Media.");
      return;
    }
    void instagramApi<Candidate>({ action: "exchange", code, state })
      .then(setCandidate)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Não foi possível autorizar.",
        ),
      );
  }, [loading, user, params]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await instagramApi({ action: "confirm", state: params.get("state") });
      await qc.invalidateQueries({ queryKey: ["social-instagram", user?.id] });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <section className="w-full max-w-xl rounded-3xl border bg-card p-8 space-y-6">
        <div className="w-fit rounded-2xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-4 text-white">
          {done ? (
            <CheckCircle2 className="size-8" aria-hidden="true" />
          ) : (
            <Instagram className="size-8" aria-hidden="true" />
          )}
        </div>
        <div>
          <p className="text-xs tracking-widest text-muted-foreground">
            NEWVOX / SOCIAL MEDIA
          </p>
          <h1 className="text-2xl font-semibold mt-2">
            {done
              ? "Instagram conectado"
              : candidate
                ? "Confirme o perfil correto"
                : "Autorização do Instagram"}
          </h1>
        </div>
        {done ? (
          <p role="status">
            A conta @{candidate?.username} foi vinculada a{" "}
            {candidate?.clientName}. Nenhuma postagem foi enviada.
          </p>
        ) : candidate ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-5 space-y-2">
              <p className="text-sm text-muted-foreground">Cliente no Painel</p>
              <p className="font-semibold">{candidate.clientName}</p>
              <p className="text-sm text-muted-foreground pt-2">
                Perfil autorizado
              </p>
              <p className="text-xl text-primary">@{candidate.username}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Confirme somente se este Instagram pertence a este cliente. O
              vínculo anterior, se existir, só será substituído após confirmar.
            </p>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar vínculo com este cliente"}
            </Button>
          </div>
        ) : !error ? (
          <p role="status">Verificando a autorização com a Meta…</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground flex gap-2">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Credenciais protegidas no servidor. Este processo não altera o Voxi.
        </p>
        <Link
          to={user ? "/social?aba=accounts" : "/login"}
          className="text-sm text-primary underline"
        >
          {done ? "Voltar à Social Media" : "Voltar sem confirmar"}
        </Link>
      </section>
    </main>
  );
}
