import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Instagram, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { instagramApi, type InstagramAccount } from "@/lib/social-instagram";
import type { SocialClient } from "@/lib/social";
export function InstagramAccounts({ clients }: { clients: SocialClient[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
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
  async function connect(client: SocialClient) {
    if (
      !window.confirm(
        "Conectar o Instagram de " +
          client.nome +
          "? Autorize o perfil correto na próxima tela.",
      )
    )
      return;
    setBusy(client.id);
    try {
      const { url } = await instagramApi<{ url: string }>({
        action: "start",
        clientId: client.id,
      });
      if (new URL(url).origin !== "https://www.instagram.com")
        throw new Error("Endereço de autorização inválido.");
      window.location.assign(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível conectar.",
      );
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Instagram className="text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Perfis dos clientes</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Autorização oficial, sem compartilhar senhas. Confira o @perfil antes
          de confirmar o vínculo com cada cliente.
        </p>
        <p className="text-sm flex gap-2">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          Esta etapa conecta as contas. Publicação automática e disparos
          agendados ainda não estão ativos.
        </p>
        {query.data ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              Configuração do aplicativo Meta
            </summary>
            <p className="mt-2">
              Adicione este endereço aos retornos OAuth válidos do Instagram
              Login, sem remover os endereços existentes:
            </p>
            <code className="block break-all mt-2 select-all">
              {query.data.redirectUri}
            </code>
            <p className="mt-2">
              {query.data.configured
                ? "Chaves presentes no servidor. A validade será verificada durante a autorização."
                : "As chaves do aplicativo ainda não estão disponíveis."}{" "}
              A conexão do Voxi não é alterada.
            </p>
          </details>
        ) : null}
      </section>
      {query.isPending ? (
        <p role="status">Consultando conexões…</p>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border p-5">
          <p>{query.error.message}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {clients.map((client) => {
          const account = query.data?.accounts.find(
            (a) => a.client_id === client.id,
          );
          const expired = account
            ? new Date(account.expires_at).getTime() <= Date.now()
            : false;
          return (
            <article
              key={client.id}
              className="rounded-2xl border bg-card p-5 space-y-4"
            >
              <h3 className="font-semibold text-sm">{client.nome}</h3>
              {account ? (
                <div className="space-y-2">
                  <a
                    href={
                      "https://www.instagram.com/" +
                      encodeURIComponent(account.username) +
                      "/"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex gap-2 items-center"
                  >
                    @{account.username}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {expired
                      ? "Autorização expirada — reconecte"
                      : "Autorização registrada"}{" "}
                    · válida até{" "}
                    {new Date(account.expires_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.can_publish
                      ? "Permissão de publicação concedida."
                      : "Permissão de publicação não confirmada. Reconecte se necessário."}{" "}
                    Nenhuma postagem será enviada nesta etapa.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Instagram ainda não conectado.
                </p>
              )}
              <Button
                variant={account ? "outline" : "default"}
                disabled={
                  !query.data?.configured ||
                  !client.can_approve ||
                  busy !== null
                }
                onClick={() => void connect(client)}
              >
                {busy === client.id
                  ? "Abrindo Instagram…"
                  : account
                    ? "Reconectar Instagram"
                    : "Conectar Instagram"}
              </Button>
              {!client.can_approve ? (
                <p className="text-xs text-muted-foreground">
                  Peça ao Master ou responsável autorizado para conectar.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
