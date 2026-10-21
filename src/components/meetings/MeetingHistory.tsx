import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mic,
  RefreshCw,
  CheckCircle2,
  FileText,
  Download,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  meetingDate,
  meetingsApi,
  meetingStatus,
  type Meeting,
  type MeetingBootstrap,
  type MeetingDetail,
} from "@/lib/meetings";

export function MeetingHistory({
  clientId,
  meetings,
}: {
  clientId?: string;
  meetings?: Meeting[];
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["meetings", user?.id, clientId],
    enabled: !!user && !meetings,
    queryFn: () => meetingsApi<MeetingBootstrap>("bootstrap", { clientId }),
    refetchOnMount: true,
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const rows = meetings || query.data?.meetings || [];
  return (
    <div className="space-y-4">
      {!meetings && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Histórico de reuniões e alinhamentos deste cliente.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href="/reunioes">Instalar extensão / dispositivos</a>
          </Button>
        </div>
      )}
      {query.isError && !meetings ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 p-5"
        >
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
      {query.isLoading && !meetings ? (
        <p role="status">Carregando reuniões…</p>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Mic className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h3 className="font-semibold">O próximo alinhamento começa aqui</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Abra o Meet, selecione este cliente na extensão Newvox e inicie o
            registro após avisar os participantes.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className="rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline focus-visible:outline-primary"
            >
              <div className="mb-4 flex items-center gap-2 text-xs text-primary">
                <Mic size={15} />
                <span>
                  {m.reviewed_at
                    ? "Alinhamentos revisados"
                    : meetingStatus[m.status] || m.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{m.client_name}</p>
              <h3 className="mt-1 font-semibold">{m.title}</h3>
              <p className="mt-3 text-xs text-muted-foreground">
                {meetingDate(m.started_at)}
                {m.owner_name ? ` · ${m.owner_name}` : ""}
              </p>
              {m.partial && (
                <p className="mt-2 text-xs text-amber-500">
                  Registro parcial — houve interrupção na captura.
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                {m.transcribed_chunks || 0} de {m.uploaded_chunks || 0} trechos
                transcritos · Abrir histórico →
              </p>
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico da reunião</DialogTitle>
            <DialogDescription>
              Transcrição e sugestões internas. Nada é enviado ao cliente
              automaticamente.
            </DialogDescription>
          </DialogHeader>
          {selected && <MeetingRecord key={selected} id={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function MeetingRecord({ id }: { id: string }) {
  const { user } = useAuth(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["meeting-detail", user?.id, id],
    queryFn: () => meetingsApi<MeetingDetail>("detail", { meetingId: id }),
    staleTime: 30000,
    refetchOnMount: "always",
  });
  const [notes, setNotes] = useState<string | null>(null),
    [task, setTask] = useState<{ index: number; title: string } | null>(null);
  const m = query.data;
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await meetingsApi(action, { meetingId: id, ...payload });
      await qc.invalidateQueries({
        queryKey: ["meeting-detail", user?.id, id],
      });
      await qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Atualização salva.");
      setTask(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isError)
    return (
      <div role="alert">
        {query.error.message}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!m) return <p role="status">Carregando registro…</p>;
  function exportText() {
    const text = [
      m!.client_name,
      m!.title,
      meetingDate(m!.started_at),
      m!.partial ? "ATENÇÃO: REGISTRO PARCIAL" : "",
      m!.transcript || m!.chunks.map((c) => c.transcript || "").join("\n"),
      "REVISÃO HUMANA",
      m!.review_notes || "Ainda não revisada.",
    ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `reuniao-${id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">
          {m.client_name}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{m.title}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {meetingDate(m.started_at)} · {meetingStatus[m.status]}
        </p>
      </div>
      {m.partial && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          Este registro é parcial. Não representa necessariamente toda a
          reunião.
        </p>
      )}
      {m.status === "interrupted" && (
        <p className="rounded-xl border p-4 text-sm">
          Abra a extensão com a conta original e escolha “Sincronizar registro
          pendente”. Os trechos já enviados estão preservados.
        </p>
      )}
      {["interrupted", "failed"].includes(m.status) &&
        m.chunks.some((c) => c.status === "done") && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Finalizar somente os trechos transcritos? O registro será marcado como parcial e não aceitará mais os trechos que ficaram no computador. Prefira sincronizar pela extensão se ainda tiver os arquivos.",
                )
              )
                void run("finalize_partial", { confirmed: true });
            }}
          >
            Finalizar somente os trechos disponíveis
          </Button>
        )}
      {m.status === "failed" && (
        <div className="rounded-xl border border-destructive/40 p-4">
          <p className="text-sm">
            Não foi possível concluir o processamento. O histórico enviado não
            foi descartado.
          </p>
          <Button
            disabled={busy}
            variant="outline"
            className="mt-3"
            onClick={() => void run("retry")}
          >
            <RefreshCw size={15} /> Tentar processar novamente
          </Button>
        </div>
      )}
      {m.summary && (
        <>
          <div className="rounded-2xl border bg-primary/5 p-5">
            <p className="mb-2 text-xs uppercase tracking-widest text-primary">
              Rascunho da IA · confira antes de usar
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {m.summary.summary}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["decisions", "Decisões"],
                ["goals", "Metas"],
                ["openQuestions", "Pontos em aberto"],
              ] as const
            ).map(([key, title]) => (
              <section key={key} className="rounded-xl border p-4">
                <h3 className="mb-3 font-semibold">{title}</h3>
                {m.summary![key].length ? (
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {m.summary![key].map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Não identificado explicitamente.
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="rounded-xl border p-4">
            <h3 className="font-semibold">Próximas ações sugeridas</h3>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              Revise abaixo antes de criar tarefas. Elas serão atribuídas a
              você; você poderá ajustar a atribuição em Tarefas.
            </p>
            {m.summary.actions.map((text, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 border-t py-3 text-sm"
              >
                <span>{text}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !m.reviewed_at ||
                    busy ||
                    m.tasks.some((t) => t.item_index === i)
                  }
                  onClick={() =>
                    setTask({ index: i, title: text.slice(0, 200) })
                  }
                >
                  <Plus size={14} />
                  {m.tasks.some((t) => t.item_index === i)
                    ? "Criada"
                    : "Criar tarefa"}
                </Button>
              </div>
            ))}
          </section>
        </>
      )}
      {m.status === "ready" && (
        <section className="rounded-xl border p-4">
          <Label htmlFor="meeting-review">Sua revisão e ajustes</Label>
          <Textarea
            id="meeting-review"
            className="mt-3 min-h-28"
            value={notes ?? m.review_notes ?? ""}
            maxLength={20000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Confirme os alinhamentos, corrija pontos e registre o que precisa de acompanhamento."
          />
          <Button
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run("review", {
                version: m.version,
                notes: notes ?? m.review_notes ?? "",
              })
            }
          >
            <CheckCircle2 size={16} />
            {busy
              ? "Salvando…"
              : m.reviewed_at
                ? "Atualizar revisão"
                : "Confirmar revisão dos alinhamentos"}
          </Button>
        </section>
      )}
      {task && (
        <section className="rounded-xl border border-primary/40 p-4">
          <Label htmlFor="meeting-task">
            Título da tarefa (revise antes de criar)
          </Label>
          <Input
            id="meeting-task"
            className="mt-2"
            maxLength={200}
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
          />
          <div className="mt-3 flex gap-2">
            <Button
              disabled={busy || !task.title.trim()}
              onClick={() =>
                void run("create_task", {
                  index: task.index,
                  title: task.title.trim(),
                })
              }
            >
              Confirmar criação
            </Button>
            <Button variant="ghost" onClick={() => setTask(null)}>
              Cancelar
            </Button>
          </div>
        </section>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">
          <FileText className="mr-2 inline h-4 w-4" /> Transcrição com
          referência de tempo
        </summary>
        <p className="my-3 text-xs text-muted-foreground">
          Áudio misturado; os nomes de quem falou não são garantidos. Os
          horários indicam o início de cada trecho.
        </p>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
          {m.transcript ||
            m.chunks
              .filter((c) => c.transcript)
              .map((c) => c.transcript)
              .join("\n\n") ||
            "Os trechos ainda estão sendo processados."}
        </pre>
      </details>
      <Button variant="outline" onClick={exportText}>
        <Download size={16} /> Baixar transcrição e revisão (.txt)
      </Button>
    </div>
  );
}
