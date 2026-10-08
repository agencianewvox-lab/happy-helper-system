import { useQuery } from "@tanstack/react-query";
import {
  publishingApi,
  publicationLabels,
  type Publication,
} from "@/lib/social-publishing";
import type { SocialClient, SocialPost } from "@/lib/social";
import { Button } from "@/components/ui/button";
export function PublicationHistory({
  userId,
  clients,
  posts,
  onSelect,
}: {
  userId: string;
  clients: SocialClient[];
  posts: SocialPost[];
  onSelect: (p: SocialPost) => void;
}) {
  const query = useQuery({
    queryKey: ["social-jobs", userId],
    queryFn: () => publishingApi<{ jobs: Publication[] }>({ action: "jobs" }),
    refetchInterval: 15000,
  });
  return (
    <section className="rounded-2xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          Fila e histórico de publicação
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Horários de Brasília. Uma postagem só aparece como publicada após
          confirmação da Meta.
        </p>
      </div>
      {query.isError ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar a fila.
        </p>
      ) : null}
      {query.isPending ? <p role="status">Carregando publicações…</p> : null}
      {!query.isPending && !query.isError && !query.data?.jobs.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum envio ainda. Abra um conteúdo aprovado para publicar ou
          agendar.
        </p>
      ) : null}
      {query.data?.jobs.map((j) => {
        const p = posts.find((p) => p.id === j.post_id);
        return (
          <article
            key={j.id}
            className="rounded-xl border p-4 flex flex-col md:flex-row justify-between gap-4"
          >
            <div className="min-w-0">
              <span
                className={
                  "text-xs font-semibold " +
                  (j.status === "failed" || j.status === "uncertain"
                    ? "text-amber-500"
                    : "text-primary")
                }
              >
                {publicationLabels[j.status]}
              </span>
              <h3 className="font-semibold mt-1">
                {p?.title || "Conteúdo arquivado no histórico"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {clients.find((c) => c.id === j.client_id)?.nome} ·{" "}
                {new Date(j.due_at).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </p>
              {j.error ? <p className="text-xs mt-2">{j.error}</p> : null}
              {j.media_id ? (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Confirmação Instagram: {j.media_id}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 items-center">
              {p ? (
                <Button variant="outline" onClick={() => onSelect(p)}>
                  Abrir conteúdo
                </Button>
              ) : null}
              {j.permalink ? (
                <a
                  className="text-sm text-primary"
                  href={j.permalink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver publicação ↗
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
