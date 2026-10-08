import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Instagram,
  CheckCircle2,
  RefreshCw,
  Unplug,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { instagramApi, type InstagramAccount } from "@/lib/social-instagram";
import { publishingApi } from "@/lib/social-publishing";
import type { SocialClient } from "@/lib/social";
export function InstagramAccounts({ clients }: { clients: SocialClient[] }) {
  const { user } = useAuth(),
    [busy, setBusy] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["social-instagram", user?.id],
    enabled: !!user,
    queryFn: () =>
      instagramApi<{
        accounts: InstagramAccount[];
        configured: boolean;
        redirectUri: string;
      }>({ action: "list" }),
    staleTime: 30000,
    refetchOnMount: true,
  });
  async function connect(client: SocialClient, reports = false) {
    setBusy(client.id);
    try {
      const { url } = await instagramApi<{ url: string }>({
        action: "start",
        clientId: client.id,
        reports,
      });
      if (new URL(url).origin !== "https://www.instagram.com")
        throw new Error("Endereço inválido.");
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha de conexão.");
      setBusy(null);
    }
  }
  async function action(client: SocialClient, kind: string) {
    if (
      kind === "disconnect" &&
      !window.confirm(
        "Desconectar o Instagram de " +
          client.nome +
          "? Os agendamentos pendentes deste perfil serão cancelados.",
      )
    )
      return;
    setBusy(client.id);
    try {
      await publishingApi({ action: kind, clientId: client.id });
      await query.refetch();
      toast.success(
        kind === "check"
          ? "Conexão verificada com o Instagram."
          : "Perfil desconectado do Painel.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(null);
    }
  }
  const connected = query.data?.accounts.length || 0;
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex gap-4 items-center">
          <span className="rounded-2xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-4 text-white shadow-lg">
            <Instagram size={32} />
          </span>
          <div>
            <p className="text-[10px] tracking-[.2em] uppercase text-primary">
              Newvox · Conexões
            </p>
            <h2 className="text-2xl font-semibold mt-1">
              Cada perfil, no lugar certo.
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Conecte, acompanhe a autorização e gerencie o acesso de cada
              cliente.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold">
            {connected}
            <span className="text-base text-muted-foreground">
              {" "}
              / {clients.length}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">perfis vinculados</p>
        </div>
      </section>
      <Input
        aria-label="Buscar perfil ou cliente"
        placeholder="Buscar cliente ou @Instagram…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />
      {query.isPending ? (
        <p role="status">Consultando conexões…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Tentar novamente</Button>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {clients
          .filter((c) =>
            (
              c.nome +
              " " +
              (query.data?.accounts.find((a) => a.client_id === c.id)
                ?.username || "")
            )
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((c) => {
            const a = query.data?.accounts.find((a) => a.client_id === c.id),
              expired = a ? Date.parse(a.expires_at) <= Date.now() : false,
              problem = expired || !!a?.connection_error;
            return (
              <article
                key={c.id}
                className="rounded-2xl border bg-card p-5 flex flex-col gap-4"
              >
                <div className="flex justify-between gap-3">
                  <span className="rounded-xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-2.5 text-white">
                    <Instagram size={22} />
                  </span>
                  <span
                    className={
                      "text-[11px] self-start px-2.5 py-1 rounded-full " +
                      (a && !problem
                        ? "bg-emerald-500/10 text-emerald-500"
                        : a
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {a
                      ? problem
                        ? "Requer atenção"
                        : "Conectado"
                      : "A conectar"}
                  </span>
                </div>
                <h3 className="font-semibold text-sm">{c.nome}</h3>
                {a ? (
                  <div className="space-y-2 flex-1">
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-semibold"
                      href={
                        "https://www.instagram.com/" +
                        encodeURIComponent(a.username) +
                        "/"
                      }
                    >
                      @{a.username}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {a.account_type === "BUSINESS" ? "Empresa" : "Criador"} ·
                      autorização até{" "}
                      {new Date(a.expires_at).toLocaleDateString("pt-BR")}
                    </p>
                    {a.connection_error ? (
                      <p className="text-xs text-amber-500">
                        {a.connection_error}
                      </p>
                    ) : null}
                    <div className="text-xs flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      {a.can_publish
                        ? "Publicações autorizadas"
                        : "Publicação precisa de autorização"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.account_type === "BUSINESS"
                        ? "Feed, Reels, carrosséis e Stories"
                        : "Feed, Reels e carrosséis · Stories exigem Empresa"}
                    </p>
                    {a.last_checked_at ? (
                      <p className="text-[10px] text-muted-foreground">
                        Verificado em{" "}
                        {new Date(a.last_checked_at).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex-1">
                    Autorize o perfil para preparar e agendar suas publicações.
                  </p>
                )}
                <Button
                  disabled={
                    !query.data?.configured || !c.can_approve || busy !== null
                  }
                  variant={a ? "outline" : "default"}
                  onClick={() => void connect(c)}
                >
                  <Instagram className="mr-2 size-4" />
                  {busy === c.id
                    ? "Processando…"
                    : a
                      ? "Reconectar Instagram"
                      : "Conectar Instagram"}
                </Button>
                {a ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void action(c, "check")}
                    >
                      <RefreshCw className="mr-1 size-3" />
                      Verificar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null || !c.can_approve}
                      onClick={() => void connect(c, true)}
                    >
                      <ShieldCheck className="mr-1 size-3" />
                      Autorizar relatórios
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null || !c.can_approve}
                      onClick={() => void action(c, "disconnect")}
                    >
                      <Unplug className="mr-1 size-3" />
                      Desconectar
                    </Button>
                  </div>
                ) : null}
                {!c.can_approve ? (
                  <p className="text-xs text-muted-foreground">
                    Conexão e publicação são gerenciadas pelo responsável
                    autorizado.
                  </p>
                ) : null}
              </article>
            );
          })}
      </div>
    </div>
  );
}
