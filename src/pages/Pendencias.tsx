import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ClipboardList, Clock, CheckCircle2, Loader2,
  AlertTriangle, User, Plus, X, CalendarIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import newvoxLogo from "@/assets/newvox-logo.jpg";

type DemandStatus = "pendente" | "fazendo" | "feito";

interface DemandItem {
  id: string;
  group_id: string;
  term: string;
  requested_at: string;
  resolved: boolean;
  status: DemandStatus;
  grupo_nome?: string;
  gestor_responsavel?: string | null;
  due_date?: string | null;
}

interface GrupoOption {
  group_id: string;
  nome: string;
  gestor_responsavel: string | null;
}

const STATUS_CONFIG: Record<DemandStatus, { label: string; color: string; bg: string; icon: typeof ClipboardList }> = {
  pendente: { label: "A Fazer", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", icon: ClipboardList },
  fazendo: { label: "Fazendo", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: Clock },
  feito: { label: "Feito", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
};

const COLUMNS: DemandStatus[] = ["pendente", "fazendo", "feito"];

export default function Pendencias() {
  const { user } = useAuth();
  const { isAdmin, gestorFilter, profile, loading: profileLoading } = useProfile();
  const [demands, setDemands] = useState<DemandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoOption[]>([]);

  // Admin create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newGestor, setNewGestor] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const fetchDemands = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resolutions, error: resError } = await supabase
        .from("pending_demand_resolutions")
        .select("*")
        .order("requested_at", { ascending: false });
      if (resError) throw resError;

      const { data: grps, error: grpError } = await supabase
        .from("whatsapp_grupos")
        .select("group_id, nome, gestor_responsavel");
      if (grpError) throw grpError;

      setGrupos(grps || []);

      const grupoMap = new Map<string, { nome: string; gestor: string | null }>();
      for (const g of grps || []) {
        grupoMap.set(g.group_id, { nome: g.nome, gestor: g.gestor_responsavel });
      }

      const items: DemandItem[] = (resolutions || []).map((r: any) => {
        const grp = grupoMap.get(r.group_id);
        return {
          id: r.id,
          group_id: r.group_id,
          term: r.term,
          requested_at: r.requested_at,
          resolved: r.resolved,
          status: (r.status as DemandStatus) || (r.resolved ? "feito" : "pendente"),
          grupo_nome: grp?.nome || r.group_id,
          gestor_responsavel: grp?.gestor || null,
          due_date: r.due_date || null,
        };
      });

      setDemands(items);
    } catch (err) {
      console.error("Error fetching demands:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDemands();

    const channel = supabase
      .channel("kanban-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_demand_resolutions" }, () => {
        fetchDemands();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDemands]);

  const updateStatus = useCallback(async (id: string, newStatus: DemandStatus) => {
    setUpdating(id);
    const resolved = newStatus === "feito";
    const { error } = await supabase
      .from("pending_demand_resolutions")
      .update({
        status: newStatus,
        resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);

    if (!error) {
      setDemands((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: newStatus, resolved } : d))
      );
    }
    setUpdating(null);
  }, []);

  // Admin: create new demand
  const handleCreate = useCallback(async () => {
    if (!newGroupId || !newTerm.trim()) return;
    setCreating(true);
    const insertData: any = {
      group_id: newGroupId,
      term: newTerm.trim(),
      requested_at: new Date().toISOString(),
      status: "pendente",
      resolved: false,
    };
    if (newDueDate) {
      insertData.due_date = format(newDueDate, "yyyy-MM-dd");
    }
    const { error } = await supabase
      .from("pending_demand_resolutions")
      .insert(insertData);
    if (!error) {
      setNewTerm("");
      setNewGroupId("");
      setNewGestor("");
      setNewDueDate(undefined);
      setCreateOpen(false);
    }
    setCreating(false);
  }, [newGroupId, newTerm, newDueDate]);

  // Filter demands by role
  const filteredDemands = useMemo(() => {
    if (profileLoading) return [];
    if (isAdmin) return demands;
    if (!gestorFilter) return [];
    return demands.filter((d) => d.gestor_responsavel === gestorFilter);
  }, [demands, isAdmin, gestorFilter, profileLoading]);

  // For admin: group by gestor
  const gestores = useMemo(() => {
    if (!isAdmin) return [];
    const set = new Set<string>();
    demands.forEach((d) => { if (d.gestor_responsavel) set.add(d.gestor_responsavel); });
    // Also include gestores from grupos that may not have demands yet
    grupos.forEach((g) => { if (g.gestor_responsavel) set.add(g.gestor_responsavel); });
    return Array.from(set).sort();
  }, [demands, isAdmin, grupos]);

  const [selectedGestor, setSelectedGestor] = useState<string | null>(null);

  const displayDemands = useMemo(() => {
    if (isAdmin && selectedGestor) {
      return filteredDemands.filter((d) => d.gestor_responsavel === selectedGestor);
    }
    return filteredDemands;
  }, [filteredDemands, isAdmin, selectedGestor]);

  const columnDemands = useMemo(() => {
    const map: Record<DemandStatus, DemandItem[]> = { pendente: [], fazendo: [], feito: [] };
    for (const d of displayDemands) {
      map[d.status]?.push(d);
    }
    return map;
  }, [displayDemands]);

  // Grupos filtered by selected gestor for the create form
  const gestorGrupos = useMemo(() => {
    if (!newGestor) return [];
    return grupos.filter((g) => g.gestor_responsavel === newGestor);
  }, [grupos, newGestor]);

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Quadro de Pendências</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Visão Administrativa" : `Pendências de ${gestorFilter || profile?.full_name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 text-xs gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Nova Pendência
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Criar Nova Pendência</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Responsável</label>
                        <Select value={newGestor} onValueChange={(v) => { setNewGestor(v); setNewGroupId(""); }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            {gestores.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {newGestor && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium">Cliente (Grupo)</label>
                          <Select value={newGroupId} onValueChange={setNewGroupId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o cliente" />
                            </SelectTrigger>
                            <SelectContent>
                              {gestorGrupos.map((g) => (
                                <SelectItem key={g.group_id} value={g.group_id}>{g.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Descrição da Pendência</label>
                        <Input
                          placeholder="Ex: Enviar relatório mensal"
                          value={newTerm}
                          onChange={(e) => setNewTerm(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!newGroupId || !newTerm.trim() || creating}
                          onClick={handleCreate}
                        >
                          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Criar"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Badge variant="secondary" className="text-xs">
                {displayDemands.length} pendência{displayDemands.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Admin: Gestor filter tabs */}
        {isAdmin && gestores.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedGestor === null ? "default" : "outline"}
              onClick={() => setSelectedGestor(null)}
              className="text-xs h-8"
            >
              Todos
            </Button>
            {gestores.map((g) => {
              const count = filteredDemands.filter((d) => d.gestor_responsavel === g).length;
              return (
                <Button
                  key={g}
                  size="sm"
                  variant={selectedGestor === g ? "default" : "outline"}
                  onClick={() => setSelectedGestor(g)}
                  className="text-xs h-8 gap-1.5"
                >
                  <User className="w-3 h-3" />
                  {g}
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        )}

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[60vh]">
          {COLUMNS.map((status) => {
            const config = STATUS_CONFIG[status];
            const items = columnDemands[status];
            const Icon = config.icon;
            return (
              <div key={status} className={cn("rounded-xl border p-4 flex flex-col", config.bg)}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-5 h-5", config.color)} />
                    <h2 className={cn("font-bold text-sm", config.color)}>{config.label}</h2>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", config.color)}>
                    {items.length}
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 pr-2">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        Nenhuma pendência
                      </p>
                    )}
                    {items.map((item) => {
                      const dt = new Date(item.requested_at);
                      const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
                      const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                      const isUpdating = updating === item.id;
                      return (
                        <div
                          key={item.id}
                          className="bg-card border border-border/40 rounded-lg p-3 space-y-2 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{item.grupo_nome}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {dateStr} às {timeStr}
                              </p>
                            </div>
                            {isAdmin && item.gestor_responsavel && (
                              <Badge variant="outline" className="text-[9px] shrink-0">
                                {item.gestor_responsavel.split(" ")[0]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-400" />
                            {item.term}
                          </p>
                          {/* Status move buttons */}
                          <div className="flex gap-1.5 pt-1">
                            {status !== "pendente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 flex-1"
                                disabled={isUpdating}
                                onClick={() => {
                                  const prev = COLUMNS[COLUMNS.indexOf(status) - 1];
                                  if (prev) updateStatus(item.id, prev);
                                }}
                              >
                                ← {STATUS_CONFIG[COLUMNS[COLUMNS.indexOf(status) - 1]]?.label}
                              </Button>
                            )}
                            {status !== "feito" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 flex-1"
                                disabled={isUpdating}
                                onClick={() => {
                                  const next = COLUMNS[COLUMNS.indexOf(status) + 1];
                                  if (next) updateStatus(item.id, next);
                                }}
                              >
                                {STATUS_CONFIG[COLUMNS[COLUMNS.indexOf(status) + 1]]?.label} →
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}