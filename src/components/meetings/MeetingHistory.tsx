import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mic,
  RefreshCw,
  CheckCircle2,
  Pencil,
  Trash2,
  RotateCcw,
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
  meetingTranscriptText,
  type Meeting,
  type MeetingBootstrap,
  type MeetingDetail,
} from "@/lib/meetings";
import { MeetingTranscript } from "./MeetingTranscript";

export function MeetingHistory({
  clientId,
  meetings,
}: {
  clientId?: string;
  meetings?: Meeting[];
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(() =>
    !clientId
      ? new URLSearchParams(window.location.search).get("meeting")
      : null,
  );
  const [trash, setTrash] = useState(false),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["meetings", user?.id, clientId, trash],
    enabled: !!user && (!meetings || trash),
    queryFn: () =>
      meetingsApi<MeetingBootstrap>("bootstrap", { clientId, trash }),
    refetchOnMount: true,
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const rows = (
    trash ? query.data?.meetings || [] : meetings || query.data?.meetings || []
  ).filter((m) =>
    `${m.title} ${m.client_name} ${m.owner_name || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="min-w-48 flex-1"
          aria-label="Buscar reuniões"
          placeholder="Buscar reunião, cliente ou responsável…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant={trash ? "default" : "outline"}
          aria-pressed={trash}
          onClick={() => setTrash(!trash)}
        >
          <Trash2 size={15} />
          {trash ? "Voltar ao histórico" : "Lixeira"}
        </Button>
      </div>
      {trash && (
        <p className="text-xs text-muted-foreground">
          Reuniões removidas ficam aqui e podem ser restauradas. Tarefas já
          criadas são preservadas.
        </p>
      )}
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
      {query.isError && (!meetings || trash) ? (
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
      {query.isLoading && (!meetings || trash) ? (
        <p role="status">Carregando reuniões…</p>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Mic className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h3 className="font-semibold">
            {trash
              ? "A lixeira está vazia"
              : search
                ? "Nenhuma reunião encontrada"
                : "O próximo alinhamento começa aqui"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {trash || search
              ? "Altere o filtro ou volte ao histórico para continuar."
              : "Abra o Meet, selecione este cliente na extensão Newvox e inicie o registro após avisar os participantes."}
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
                  {m.deleted_at
                    ? "Na lixeira"
                    : m.reviewed_at
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
                {m.utterance_count || 0} falas identificadas ·{" "}
                {m.transcribed_chunks || 0}/{m.uploaded_chunks || 0} trechos de
                áudio · Abrir →
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
          {selected && (
            <MeetingRecord
              key={selected}
              id={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function MeetingRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    title: string;
    description: string;
    version: number;
  } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const viewed = useRef(false);
  const query = useQuery({
    queryKey: ["meeting-detail", user?.id, id],
    queryFn: async () => {
      const result = await meetingsApi<MeetingDetail>(viewed.current ? "live_detail" : "detail", { meetingId: id });
      viewed.current = true;
      return result;
    },
    staleTime: 30000,
    refetchOnMount: "always",
    refetchInterval: (q) =>
      q.state.data && !["ready", "failed"].includes(q.state.data.status)
        ? 5000
        : false,
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
      setEditing(null);
      if (["trash", "restore"].includes(action)) onClose();
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
    const text = meetingTranscriptText(m!);
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
      <div className="flex flex-wrap gap-2">
        {m.deleted_at ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run("restore", { version: m.version, confirmed: true })
            }
          >
            <RotateCcw size={15} />
            Restaurar reunião
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setEditing({
                  title: m.title,
                  description: m.description || "",
                  version: m.version,
                })
              }
            >
              <Pencil size={15} />
              Editar informações
            </Button>
            <Button
              variant="outline"
              disabled={
                busy || !["ready", "failed", "interrupted"].includes(m.status)
              }
              title="Disponível após encerrar a captura e processar os trechos"
              onClick={() => setConfirmTrash(true)}
            >
              <Trash2 size={15} />
              Excluir reunião
            </Button>
          </>
        )}
        <Button variant="outline" onClick={exportText}>
          <Download size={15} />
          Exportar transcrição
        </Button>
      </div>
      {m.description && !editing && (
        <p className="whitespace-pre-wrap rounded-xl border p-4 text-sm text-muted-foreground">
          {m.description}
        </p>
      )}
      {editing && (
        <section className="space-y-3 rounded-xl border border-blue-400/30 bg-blue-500/5 p-4">
          <Label htmlFor="meeting-edit-title">Título</Label>
          <Input
            id="meeting-edit-title"
            value={editing.title}
            maxLength={160}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
          <Label htmlFor="meeting-description">
            Pauta e informações internas
          </Label>
          <Textarea
            id="meeting-description"
            value={editing.description}
            maxLength={10000}
            onChange={(e) =>
              setEditing({ ...editing, description: e.target.value })
            }
            placeholder="Objetivo do encontro, participantes, contexto e observações…"
          />
          <p className="text-xs text-muted-foreground">
            Cliente e data original são preservados para manter a
            rastreabilidade.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy || !editing.title.trim()}
              onClick={() => void run("edit", editing)}
            >
              {busy ? "Salvando…" : "Salvar informações"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}
      {confirmTrash && (
        <section
          role="alert"
          className="space-y-3 rounded-xl border border-destructive/40 p-4"
        >
          <h3 className="font-semibold">
            Tem certeza que deseja excluir esta reunião?
          </h3>
          <p className="text-sm text-muted-foreground">
            Ela sairá do histórico e ficará na lixeira para restauração. Tarefas
            já criadas não serão excluídas.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run("trash", { version: m.version, confirmed: true })
              }
            >
              {busy ? "Movendo…" : "Confirmar exclusão"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmTrash(false)}
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}
      <MeetingTranscript meeting={m} />
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
      {!m.deleted_at &&
        ["interrupted", "failed"].includes(m.status) &&
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
      {!m.deleted_at && m.status === "failed" && (
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
                    !!m.deleted_at ||
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
      {!m.deleted_at && m.status === "ready" && (
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
    </div>
  );
}
