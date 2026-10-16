import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  clientWorkspace,
  type Workspace,
  type Contract,
  type Responsible,
  type Credential,
  type CredentialSecret,
} from "@/lib/client-workspace";

const box = "rounded-2xl border border-border bg-card p-5 space-y-4";
const select =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";
function Field({
  title,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {title}
      </label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}
    </div>
  );
}
function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
    >
      {error}
    </p>
  ) : null;
}

export function ClientWorkspace({
  clientId,
  initialTab = "contract",
}: {
  clientId: string;
  initialTab?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["client-workspace", user?.id, clientId],
    queryFn: () => clientWorkspace<Workspace>("read", clientId),
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const refresh = async () => {
    await qc.invalidateQueries({
      queryKey: ["client-workspace", user?.id, clientId],
    });
  };
  if (!data)
    return (
      <div className={box}>
        {query.isError ? (
          <>
            <ErrorText error={query.error.message} />
            <Button onClick={() => void query.refetch()}>
              Tentar novamente
            </Button>
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando ficha do cliente…
          </p>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Newvox / Ficha operacional
          </p>
          <h3 className="mt-1 text-xl font-semibold">
            Clareza para toda a equipe.
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Escopo, responsáveis e acessos do cliente, em um só lugar.
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>
      {data.canEditContract && (
        <ManagerBinding
          key={data.managerId}
          workspace={data}
          refresh={refresh}
        />
      )}
      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="contract" className="gap-2 py-2">
            <BriefcaseBusiness className="h-4 w-4" />
            Contratado
          </TabsTrigger>
          <TabsTrigger value="people" className="gap-2 py-2">
            <Users className="h-4 w-4" />
            Responsáveis
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2 py-2">
            <KeyRound className="h-4 w-4" />
            Acessos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contract">
          <ContractSection
            key={data.version}
            workspace={data}
            refresh={refresh}
          />
        </TabsContent>
        <TabsContent value="people">
          <PeopleSection
            key={data.version}
            workspace={data}
            refresh={refresh}
          />
        </TabsContent>
        <TabsContent value="access">
          <VaultSection workspace={data} refresh={refresh} />
        </TabsContent>
      </Tabs>
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          <History className="mr-2 inline h-4 w-4" />
          Histórico da ficha
        </summary>
        <div className="mt-4 space-y-3">
          {data.history.map((h) => (
            <details key={h.version} className="rounded-lg bg-muted/40 p-3">
              <summary className="cursor-pointer">
                Versão {h.version} · {h.author || "Migração do cadastro"} ·{" "}
                {new Date(h.createdAt).toLocaleString("pt-BR")}
              </summary>
              <p className="mt-2 font-medium">
                {h.contract.title || "Plano não informado"}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {h.contract.description}
              </p>
              <ul className="mt-2 list-disc pl-5">
                {h.contract.deliverables?.map((d) => (
                  <li key={d.id || d.name}>
                    {d.name} {d.quantity} {d.frequency}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                {h.contacts.length} responsáveis cadastrados nesta versão.
              </p>
              {h.contract.startDate && <p>Início: {h.contract.startDate}</p>}
              {h.contract.limits && (
                <p className="whitespace-pre-wrap">
                  Limites: {h.contract.limits}
                </p>
              )}
              {h.contract.notes && (
                <p className="whitespace-pre-wrap">
                  Observações: {h.contract.notes}
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {h.contacts.map((p) => (
                  <li key={p.id}>
                    {p.name} · {p.role} · {p.responsibility}
                    {p.phone ? " · " + p.phone : ""}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </details>
      {data.canEditContract && (
        <details className="rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Auditoria dos acessos e da carteira
          </summary>
          <div className="mt-3 space-y-2">
            {data.audit.length ? (
              data.audit.map((a, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString("pt-BR")} ·{" "}
                  {a.author || "Migração"} ·{" "}
                  {(
                    {
                      reveal: "Revelou um acesso",
                      copy: "Copiou um acesso",
                      credential_save: "Salvou um acesso",
                      credential_delete: "Removeu um acesso",
                      assign: "Alterou o gestor",
                      archive: "Arquivou o cliente",
                      restore: "Restaurou o cliente",
                      legacy_migrated_verified:
                        "Acesso legado protegido e verificado",
                    } as Record<string, string>
                  )[a.action] || a.action}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">Nenhuma ação registrada.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function ManagerBinding({
  workspace: w,
  refresh,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
}) {
  const [value, setValue] = useState(w.managerId || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const roster = useQuery({
    queryKey: ["manager-roster"],
    queryFn: async () => {
      const r = await supabase
        .from("profiles")
        .select("user_id,full_name,role")
        .in("role", ["admin", "gestor"])
        .order("full_name");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <label className="text-xs font-medium" htmlFor={`manager-${w.clientId}`}>
        Gestor da carteira · permissão de acesso
      </label>
      <div className="mt-2 flex gap-2">
        <select
          id={`manager-${w.clientId}`}
          className={select}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">Sem gestor vinculado</option>
          {roster.data?.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <Button
          disabled={busy || value === (w.managerId || "")}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await clientWorkspace("assign", w.clientId, { userId: value });
              await refresh();
              toast.success("Carteira atualizada.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Vincular
        </Button>
      </div>
      {!w.managerId && w.legacyManager && (
        <p className="mt-2 text-xs text-amber-500">
          Vínculo antigo “{w.legacyManager}” precisa de conferência. Selecione o
          usuário correto.
        </p>
      )}
      <ErrorText
        error={
          error ||
          (roster.isError ? "Não foi possível carregar a equipe." : null)
        }
      />
    </div>
  );
}

function ContractSection({
  workspace: w,
  refresh,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Contract>({
    title: "",
    description: "",
    deliverables: [],
    startDate: "",
    limits: "",
    notes: "",
    ...w.contract,
  });
  const change = (key: keyof Contract, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientWorkspace("contract", w.clientId, {
        version: w.version,
        contract: draft,
      });
      await refresh();
      setEditing(false);
      toast.success("Contratado atualizado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={box}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">O que foi contratado</h4>
        {w.canEditContract && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar escopo
          </Button>
        )}
      </div>
      {editing ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              title="Nome do plano"
              value={draft.title}
              onChange={(v) => change("title", v)}
            />
            <Field
              title="Data de início"
              value={draft.startDate}
              onChange={(v) => change("startDate", v)}
              type="date"
            />
          </div>
          <Field
            title="Descrição do contratado"
            value={draft.description}
            onChange={(v) => change("description", v)}
            multiline
          />
          <div className="space-y-3">
            <p className="text-sm font-medium">Serviços e entregáveis</p>
            {draft.deliverables.map((d, i) => (
              <div
                key={d.id || i}
                className="grid items-end gap-2 rounded-xl bg-muted/30 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
              >
                <Field
                  title="Serviço / entregável"
                  value={d.name}
                  onChange={(v) =>
                    change(
                      "deliverables",
                      draft.deliverables.map((x, n) =>
                        n === i ? { ...x, name: v } : x,
                      ),
                    )
                  }
                />
                <Field
                  title="Quantidade (opcional)"
                  value={d.quantity}
                  onChange={(v) =>
                    change(
                      "deliverables",
                      draft.deliverables.map((x, n) =>
                        n === i ? { ...x, quantity: v } : x,
                      ),
                    )
                  }
                />
                <Field
                  title="Frequência (opcional)"
                  value={d.frequency}
                  onChange={(v) =>
                    change(
                      "deliverables",
                      draft.deliverables.map((x, n) =>
                        n === i ? { ...x, frequency: v } : x,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover entregável ${i + 1}`}
                  onClick={() =>
                    change(
                      "deliverables",
                      draft.deliverables.filter((_, n) => n !== i),
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                change("deliverables", [
                  ...draft.deliverables,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    quantity: "",
                    frequency: "",
                  },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar entregável
            </Button>
          </div>
          <Field
            title="Limites do escopo / não incluído"
            value={draft.limits}
            onChange={(v) => change("limits", v)}
            multiline
          />
          <Field
            title="Observações"
            value={draft.notes}
            onChange={(v) => change("notes", v)}
            multiline
          />
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(w.contract);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Salvando…" : "Salvar contratado"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-xs uppercase tracking-wider text-primary">
              Plano contratado
            </p>
            <p className="mt-2 text-xl font-semibold">
              {w.contract.title || "Plano não informado"}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {w.contract.description ||
                "Descrição ainda não cadastrada pelo Master."}
            </p>
            {w.contract.startDate && (
              <p className="mt-3 text-xs">
                Início: {w.contract.startDate.split("-").reverse().join("/")}
              </p>
            )}
          </div>
          <div className="divide-y">
            {w.contract.deliverables?.length ? (
              w.contract.deliverables.map((d, i) => (
                <div
                  key={d.id || i}
                  className="flex flex-wrap justify-between gap-2 py-3"
                >
                  <span className="font-medium">{d.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {[d.quantity, d.frequency].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                Nenhum entregável detalhado. O plano original foi preservado,
                sem adicionar serviços presumidos.
              </p>
            )}
          </div>
          {w.contract.limits && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Limites do escopo
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {w.contract.limits}
              </p>
            </div>
          )}
          {w.contract.notes && (
            <p className="whitespace-pre-wrap text-sm">{w.contract.notes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Atualizado {new Date(w.updatedAt).toLocaleString("pt-BR")} ·{" "}
            {w.updatedBy || "Cadastro inicial"}
          </p>
        </>
      )}
    </section>
  );
}

function PeopleSection({
  workspace: w,
  refresh,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(w.contacts),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const change = (id: string, key: keyof Responsible, value: unknown) =>
    setDraft((ds) => ds.map((d) => (d.id === id ? { ...d, [key]: value } : d)));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientWorkspace("contacts", w.clientId, {
        version: w.version,
        contacts: draft,
      });
      await refresh();
      setEditing(false);
      toast.success("Responsáveis atualizados.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={box}>
      <div className="flex justify-between">
        <h4 className="font-semibold">Quem cuida de cada etapa</h4>
        {w.canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar responsáveis
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Cargos são informações operacionais. Esta lista não cria login nem
        concede acesso ao painel.
      </p>
      {(["agency", "client"] as const).map((team) => (
        <div key={team} className="space-y-3">
          <h5 className="border-b pb-2 text-sm font-semibold">
            {team === "agency" ? "Equipe Newvox" : "Contatos do cliente"}
          </h5>
          {(editing ? draft : w.contacts)
            .filter((p) => p.team === team)
            .map((p) => (
              <div key={p.id} className="rounded-xl bg-muted/30 p-4">
                {editing ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        title="Nome"
                        value={p.name}
                        onChange={(v) => change(p.id, "name", v)}
                      />
                      <Field
                        title="Cargo / função"
                        value={p.role}
                        onChange={(v) => change(p.id, "role", v)}
                      />
                      <Field
                        title="Responsável por"
                        value={p.responsibility}
                        onChange={(v) => change(p.id, "responsibility", v)}
                      />
                      <Field
                        title="Telefone (opcional)"
                        value={p.phone}
                        onChange={(v) => change(p.id, "phone", v)}
                        type="tel"
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={p.primary}
                          onChange={(e) =>
                            change(p.id, "primary", e.target.checked)
                          }
                        />
                        Contato principal
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDraft((ds) => ds.filter((d) => d.id !== p.id))
                        }
                      >
                        Remover da lista
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      {p.name}
                      {p.primary && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                          Principal
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-primary">
                      {p.role || "Função não informada"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {p.responsibility}
                    </p>
                    {p.phone && <p className="mt-2 text-sm">{p.phone}</p>}
                  </>
                )}
              </div>
            ))}
          {!(editing ? draft : w.contacts).some((p) => p.team === team) && (
            <p className="text-sm text-muted-foreground">
              Nenhum responsável cadastrado.
            </p>
          )}
          {editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((ds) => [
                  ...ds,
                  {
                    id: crypto.randomUUID(),
                    team,
                    name: "",
                    role: "",
                    responsibility: "",
                    phone: "",
                    primary: false,
                  },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar pessoa
            </Button>
          )}
        </div>
      ))}
      <ErrorText error={error} />
      {editing && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft(w.contacts);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar responsáveis"}
          </Button>
        </div>
      )}
    </section>
  );
}

function VaultSection({
  workspace: w,
  refresh,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<{
      id: string;
      secret: CredentialSecret;
    } | null>(null),
    [editing, setEditing] = useState<
      (Partial<Credential> & CredentialSecret) | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [deleting, setDeleting] = useState<Credential | null>(null);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 60000);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setRevealed(null);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  async function access(c: Credential, action: "reveal" | "copy" | "edit") {
    setBusy(true);
    setError(null);
    try {
      const secret = await clientWorkspace<CredentialSecret>(
        action === "copy" ? "copy" : "reveal",
        w.clientId,
        { id: c.id },
      );
      if (action === "copy") {
        await navigator.clipboard.writeText(secret.password || secret.notes);
        toast.success(
          secret.password ? "Senha copiada." : "Acesso legado copiado.",
        );
      } else if (action === "edit") {
        setRevealed(null);
        setEditing({ ...c, ...secret });
      } else setRevealed({ id: c.id, secret });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await clientWorkspace("credential_save", w.clientId, { ...editing });
      setEditing(null);
      setRevealed(null);
      await refresh();
      toast.success("Acesso salvo no cofre.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={box}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Cofre de acessos</h4>
        {w.canEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              setEditing({
                platform: "instagram",
                label: "",
                url: "",
                login: "",
                password: "",
                notes: "",
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo acesso
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Conteúdo criptografado. Revelações e cópias ficam registradas. Dados
        revelados são ocultados após um minuto ou ao sair desta aba.
      </p>
      <ErrorText error={error} />
      {!w.credentials.length && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Organize os acessos por plataforma, sem misturar várias contas em um
          campo.
        </p>
      )}
      {w.credentials.map((c) => (
        <div key={c.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-primary">
                {c.platform}
              </p>
              <p className="font-medium">{c.label}</p>
              {/^https?:\/\//.test(c.url) && (
                <a
                  className="text-xs text-primary underline"
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir plataforma ↗
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  revealed?.id === c.id
                    ? setRevealed(null)
                    : void access(c, "reveal")
                }
              >
                {revealed?.id === c.id ? (
                  <EyeOff className="mr-1 h-4 w-4" />
                ) : (
                  <Eye className="mr-1 h-4 w-4" />
                )}
                {revealed?.id === c.id ? "Ocultar" : "Revelar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void access(c, "copy")}
              >
                <Copy className="mr-1 h-4 w-4" />
                Copiar senha
              </Button>
              {w.canEdit && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void access(c, "edit")}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDeleting(c)}
                  >
                    Remover
                  </Button>
                </>
              )}
            </div>
          </div>
          {revealed?.id === c.id ? (
            <div className="space-y-2 rounded-lg bg-background p-3 text-sm">
              <p className="break-all">
                <span className="text-muted-foreground">Login: </span>
                {revealed.secret.login || "Não informado"}
              </p>
              <p className="break-all font-mono">
                <span className="font-sans text-muted-foreground">Senha: </span>
                {revealed.secret.password || "Não informada"}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {revealed.secret.notes}
              </p>
            </div>
          ) : (
            <p className="text-sm tracking-widest text-muted-foreground">
              ••••••••••••
            </p>
          )}
        </div>
      ))}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Editar acesso" : "Novo acesso"}
            </DialogTitle>
            <DialogDescription>
              O segredo não aparece no cadastro geral, nos relatórios ou nos
              resumos de IA.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <label className="block text-xs font-medium">
                Plataforma
                <select
                  className={`${select} mt-1`}
                  value={editing.platform}
                  onChange={(e) =>
                    setEditing({ ...editing, platform: e.target.value })
                  }
                >
                  {[
                    "instagram",
                    "facebook",
                    "hostinger",
                    "domain",
                    "website",
                    "other",
                  ].map((v, i) => (
                    <option key={v} value={v}>
                      {
                        [
                          "Instagram",
                          "Facebook",
                          "Hostinger",
                          "Domínio",
                          "Site",
                          "Outros",
                        ][i]
                      }
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["label", "Identificação da conta"],
                  ["url", "Endereço de acesso"],
                  ["login", "Login / e-mail"],
                  ["password", "Senha"],
                  ["notes", "Observações"],
                ] as const
              ).map(([key, title]) => (
                <Field
                  key={key}
                  title={title}
                  value={editing[key] || ""}
                  onChange={(v) => setEditing({ ...editing, [key]: v })}
                  type={key === "password" ? "password" : "text"}
                  multiline={key === "notes"}
                />
              ))}
              <ErrorText error={error} />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={busy || !editing.label?.trim()}
                  onClick={() => void save()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar no cofre"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover este acesso?</DialogTitle>
            <DialogDescription>
              O registro “{deleting?.label}” será removido do cofre. Isso não
              altera a conta na plataforma.
            </DialogDescription>
          </DialogHeader>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                try {
                  await clientWorkspace("credential_delete", w.clientId, {
                    id: deleting.id,
                    version: deleting.version,
                  });
                  setDeleting(null);
                  setRevealed(null);
                  await refresh();
                  toast.success("Acesso removido.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remover acesso
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ClientWorkspaceDialog({
  clientId,
  onClose,
}: {
  clientId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!clientId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha do cliente</DialogTitle>
          <DialogDescription>
            Informações operacionais compartilhadas com a equipe autorizada.
          </DialogDescription>
        </DialogHeader>
        {clientId && <ClientWorkspace key={clientId} clientId={clientId} />}
      </DialogContent>
    </Dialog>
  );
}
