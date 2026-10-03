import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { whatsappRequest } from "@/lib/whatsapp";
import { isRecentGroup, isWhatsappGroupId, normalizeGroupSearch, type DiscoveredGroup, type GroupDiscovery } from "@/lib/group-discovery";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Loader2, MessageSquare, Plus, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";

const CATEGORIAS = ["Clientes / Operação", "Clínicas", "Internos / Gestão"];
const GESTORES = ["Murilo Araújo", "Netto Monge"];
const EMPTY_FORM = { nome: "", group_id: "", categoria: "", gestor_responsavel: "" };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("pt-BR");

export function AddClientDialog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("whatsapp");
  const [selected, setSelected] = useState<DiscoveredGroup | null>(null);
  const [search, setSearch] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const discovery = useQuery({
    queryKey: ["whatsapp-discovery", user?.id],
    queryFn: () => whatsappRequest<GroupDiscovery>(undefined, "discover-groups"),
    enabled: open && mode === "whatsapp" && !selected && !!user,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const filteredGroups = (discovery.data?.groups ?? []).filter((group) =>
    normalizeGroupSearch(group.nome).includes(normalizeGroupSearch(search)) && (!recentOnly || isRecentGroup(group)),
  );

  function changeMode(value: string) {
    setMode(value);
    setSelected(null);
    setForm(EMPTY_FORM);
  }

  function selectGroup(group: DiscoveredGroup) {
    setSelected(group);
    setForm({ ...EMPTY_FORM, nome: group.nome, group_id: group.group_id });
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!form.nome.trim()) { toast.error("Nome do cliente é obrigatório"); return; }
    if (mode === "whatsapp" && !selected) return;
    const groupId = form.group_id.trim();
    if (groupId && !isWhatsappGroupId(groupId)) { toast.error("Informe um ID de grupo válido, terminado em @g.us."); return; }
    setSaving(true);
    try {
      if (groupId) {
        const existing = await supabase.from("whatsapp_grupos").select("id").eq("group_id", groupId).maybeSingle();
        if (existing.error) throw new Error("Não foi possível conferir se o grupo já está cadastrado.");
        if (existing.data) {
          toast.error("Esse grupo já possui um card no painel. Não foi criado um duplicado.");
          void queryClient.invalidateQueries({ queryKey: ["whatsapp-discovery", user?.id] });
          return;
        }
      }
      const finalGroupId = groupId || "placeholder-" + form.nome.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
      const { error } = await supabase.from("whatsapp_grupos").insert({
        nome: form.nome.trim(),
        group_id: finalGroupId,
        categoria: form.categoria || null,
        gestor_responsavel: form.gestor_responsavel || null,
      });
      if (error?.code === "23505") {
        toast.error("Esse grupo acabou de ser cadastrado. Não foi criado um duplicado.");
        void queryClient.invalidateQueries({ queryKey: ["whatsapp-discovery", user?.id] });
        return;
      }
      if (error) throw new Error("Não foi possível cadastrar o cliente. Tente novamente.");
      toast.success(groupId ? "Cliente cadastrado e vinculado ao grupo do WhatsApp!" : "Cliente cadastrado! O vínculo será feito quando chegar uma mensagem com o mesmo nome.");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-discovery", user?.id] });
      setForm(EMPTY_FORM);
      setSelected(null);
      setSearch("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  const choosingGroup = mode === "whatsapp" && !selected;
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>{selected ? "Organizar novo cliente" : "Adicionar novo cliente"}</DialogTitle>
          <DialogDescription>Escolha um grupo do seu WhatsApp e revise as informações. Sem copiar nome ou ID.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={changeMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="whatsapp" disabled={saving} className="gap-2"><MessageSquare className="h-4 w-4" /> Do WhatsApp</TabsTrigger>
            <TabsTrigger value="manual" disabled={saving}>Cadastro manual</TabsTrigger>
          </TabsList>
        <TabsContent value={mode} className="mt-4">
        {choosingGroup ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Buscar grupo do WhatsApp" placeholder="Buscar pelo nome do grupo..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
              </div>
              <Button variant="outline" size="icon" aria-label="Atualizar grupos" disabled={discovery.isFetching} onClick={() => void discovery.refetch()}>
                <RefreshCw className={"h-4 w-4" + (discovery.isFetching ? " animate-spin" : "")} />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={!recentOnly ? "secondary" : "ghost"} size="sm" aria-pressed={!recentOnly} onClick={() => setRecentOnly(false)}>Todos não cadastrados</Button>
              <Button variant={recentOnly ? "secondary" : "ghost"} size="sm" aria-pressed={recentOnly} onClick={() => setRecentOnly(true)}>Recentes · 30 dias</Button>
            </div>
            {discovery.isPending ? (
              <div role="status" className="py-12 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
                Buscando grupos na Evolution...
                <p className="mt-1 text-xs">O painel continua funcionando normalmente.</p>
              </div>
            ) : discovery.error ? (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <p>{discovery.error.message}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void discovery.refetch()} disabled={discovery.isFetching}>Tentar novamente</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <span>{filteredGroups.length} grupo(s) disponível(is)</span>
                  <span>{discovery.data?.registeredCount ?? 0} já no painel</span>
                </div>
                <div className="max-h-[min(42dvh,360px)] overflow-y-auto overscroll-contain rounded-lg border divide-y">
                  {filteredGroups.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      <Users className="mx-auto mb-3 h-6 w-6" />
                      <p>{search || recentOnly ? "Nenhum grupo corresponde ao filtro." : "Nenhum grupo novo disponível para cadastro."}</p>
                      <p className="mt-2 text-xs">Adicione o número conectado ao grupo e clique em atualizar. Grupos já cadastrados não aparecem aqui.</p>
                    </div>
                  ) : filteredGroups.map((group) => (
                    <Button key={group.group_id} variant="ghost" aria-label={"Selecionar " + group.nome} className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-4 py-4 text-left" onClick={() => selectGroup(group)}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block break-words font-medium">{group.nome}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {group.lastMessageAt ? "Última mensagem na Evolution: " + dateLabel(group.lastMessageAt) : "Sem data de mensagem disponível"}
                          {group.createdAt ? " · Criado em " + dateLabel(group.createdAt) : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {isRecentGroup(group) ? <Badge variant="secondary" className="hidden sm:inline-flex">Recente</Badge> : null}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </Button>
                  ))}
                </div>
                {!discovery.data?.activityAvailable ? <p className="text-xs text-muted-foreground">A consulta de atividade está indisponível. Você ainda pode escolher os grupos pela lista e data de criação.</p> : null}
              </>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">Recentes considera criação ou última mensagem disponível nos últimos 30 dias, não a data em que o número entrou no grupo. Nenhum cadastro ou mensagem é feito automaticamente.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {selected ? (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-medium text-primary"><Check className="h-4 w-4" /> Grupo selecionado</p>
                    <p className="mt-1 break-words text-sm font-medium">{selected.nome}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{selected.group_id}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setSelected(null); setForm(EMPTY_FORM); }}><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Trocar</Button>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Nome no painel *</Label>
              <Input id="new-client-name" required maxLength={200} placeholder="Ex: MKT NV - Nome do Cliente" value={form.nome} disabled={saving} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              {selected ? <p className="text-xs text-muted-foreground">Pode ajustar o nome aqui. O nome do grupo no WhatsApp não será alterado.</p> : null}
            </div>
            {mode === "manual" ? (
              <div className="space-y-2">
                <Label htmlFor="new-client-group-id">ID do grupo (opcional)</Label>
                <Input id="new-client-group-id" placeholder="Ex: 120363000000000000@g.us" value={form.group_id} disabled={saving} onChange={(event) => setForm({ ...form, group_id: event.target.value })} />
                <p className="text-xs text-muted-foreground">Sem ID, use exatamente o nome do grupo para tentar o vínculo pela próxima mensagem. Prefira escolher o grupo na aba Do WhatsApp.</p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-client-category">Categoria</Label>
                <Select value={form.categoria} disabled={saving} onValueChange={(value) => setForm({ ...form, categoria: value })}>
                  <SelectTrigger id="new-client-category"><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-client-manager">Gestor responsável</Label>
                <Select value={form.gestor_responsavel} disabled={saving} onValueChange={(value) => setForm({ ...form, gestor_responsavel: value })}>
                  <SelectTrigger id="new-client-manager"><SelectValue placeholder="Selecionar gestor" /></SelectTrigger>
                  <SelectContent>{GESTORES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{selected ? "O card será vinculado ao ID correto para receber as próximas mensagens. O histórico anterior não é importado por este cadastro." : "Confira os dados antes de criar o card."} O onboarding continua sendo enviado separadamente.</p>
            <Button type="submit" disabled={saving || !form.nome.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? "Cadastrando..." : "Confirmar cadastro"}
            </Button>
          </form>
        )}
        </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
