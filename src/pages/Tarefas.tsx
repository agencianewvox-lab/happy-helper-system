import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ListTodo, Clock, CheckCircle2, Loader2,
  User, Plus, CalendarIcon, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import newvoxLogo from "@/assets/newvox-logo.jpg";

type TaskStatus = "pendente" | "fazendo" | "feito";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  group_id: string | null;
  status: TaskStatus;
  priority: string;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  grupo_nome?: string;
}

interface GrupoOption {
  group_id: string;
  nome: string;
  gestor_responsavel: string | null;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: typeof ListTodo }> = {
  pendente: { label: "A Fazer", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", icon: ListTodo },
  fazendo: { label: "Fazendo", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: Clock },
  feito: { label: "Feito", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
};

const COLUMNS: TaskStatus[] = ["pendente", "fazendo", "feito"];

const TEAM_MEMBERS = [
  "Jader Costa",
  "Murilo Araújo",
  "Netto Monge",
  "Priscilla Borges",
  "Joel",
  "Thais",
  "Daniella",
  "Victor Botto",
  "Jiza Reis",
  "Alisson Lima",
];

export default function Tarefas() {
  const { user } = useAuth();
  const { isAdmin, gestorFilter, profile, loading: profileLoading } = useProfile();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoOption[]>([]);

  // Create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (taskError) throw taskError;

      const { data: grps, error: grpError } = await supabase
        .from("whatsapp_grupos")
        .select("group_id, nome, gestor_responsavel");
      if (grpError) throw grpError;

      setGrupos(grps || []);

      const grupoMap = new Map<string, string>();
      for (const g of grps || []) {
        grupoMap.set(g.group_id, g.nome);
      }

      const items: TaskItem[] = (taskData || []).map((t: any) => ({
        ...t,
        status: t.status as TaskStatus,
        grupo_nome: t.group_id ? grupoMap.get(t.group_id) || null : null,
      }));

      setTasks(items);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const updateStatus = useCallback(async (id: string, newStatus: TaskStatus) => {
    setUpdating(id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
      );
    }
    setUpdating(null);
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim() || !newAssignedTo) return;
    setCreating(true);
    const insertData: any = {
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      assigned_to: newAssignedTo,
      group_id: newGroupId || null,
      priority: newPriority,
      status: "pendente",
      created_by: profile?.full_name || "Sistema",
    };
    if (newDueDate) {
      insertData.due_date = format(newDueDate, "yyyy-MM-dd");
    }
    const { error } = await supabase.from("tasks").insert(insertData);
    if (!error) {
      setNewTitle("");
      setNewDescription("");
      setNewAssignedTo("");
      setNewGroupId("");
      setNewPriority("normal");
      setNewDueDate(undefined);
      setCreateOpen(false);
    }
    setCreating(false);
  }, [newTitle, newDescription, newAssignedTo, newGroupId, newPriority, newDueDate, profile]);

  // Filter tasks by role
  const filteredTasks = useMemo(() => {
    if (profileLoading) return [];
    if (isAdmin) return tasks;
    if (!gestorFilter) return [];
    return tasks.filter((t) => t.assigned_to === gestorFilter);
  }, [tasks, isAdmin, gestorFilter, profileLoading]);

  // For admin: get assignees
  const assignees = useMemo(() => {
    if (!isAdmin) return [];
    const set = new Set<string>();
    tasks.forEach((t) => set.add(t.assigned_to));
    return Array.from(set).sort();
  }, [tasks, isAdmin]);

  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);

  const displayTasks = useMemo(() => {
    if (isAdmin && selectedAssignee) {
      return filteredTasks.filter((t) => t.assigned_to === selectedAssignee);
    }
    return filteredTasks;
  }, [filteredTasks, isAdmin, selectedAssignee]);

  const columnTasks = useMemo(() => {
    const map: Record<TaskStatus, TaskItem[]> = { pendente: [], fazendo: [], feito: [] };
    for (const t of displayTasks) {
      map[t.status]?.push(t);
    }
    return map;
  }, [displayTasks]);

  const priorityBadge = (priority: string) => {
    if (priority === "urgente") return <Badge className="text-[9px] bg-red-500/20 text-red-400 border-red-500/30">Urgente</Badge>;
    if (priority === "baixa") return <Badge className="text-[9px] bg-muted text-muted-foreground">Baixa</Badge>;
    return null;
  };

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
                <h1 className="text-lg font-bold tracking-tight">Quadro de Tarefas</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Visão Administrativa" : `Tarefas de ${gestorFilter || profile?.full_name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Nova Tarefa
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Criar Nova Tarefa</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Título</label>
                      <Input
                        placeholder="Ex: Revisar criativos do cliente X"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Descrição (opcional)</label>
                      <Textarea
                        placeholder="Detalhes da tarefa..."
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Responsável</label>
                      <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_MEMBERS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Cliente (opcional)</label>
                      <Select value={newGroupId} onValueChange={setNewGroupId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {grupos.map((g) => (
                            <SelectItem key={g.group_id} value={g.group_id}>{g.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Prioridade</label>
                        <Select value={newPriority} onValueChange={setNewPriority}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="baixa">Baixa</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="urgente">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Prazo</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !newDueDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {newDueDate ? format(newDueDate, "dd/MM") : "Data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={newDueDate}
                              onSelect={setNewDueDate}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!newTitle.trim() || !newAssignedTo || creating}
                        onClick={handleCreate}
                      >
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Criar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Badge variant="secondary" className="text-xs">
                {displayTasks.length} tarefa{displayTasks.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Admin: Assignee filter tabs */}
        {isAdmin && assignees.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedAssignee === null ? "default" : "outline"}
              onClick={() => setSelectedAssignee(null)}
              className="text-xs h-8"
            >
              Todos
            </Button>
            {assignees.map((a) => {
              const count = filteredTasks.filter((t) => t.assigned_to === a).length;
              return (
                <Button
                  key={a}
                  size="sm"
                  variant={selectedAssignee === a ? "default" : "outline"}
                  onClick={() => setSelectedAssignee(a)}
                  className="text-xs h-8 gap-1.5"
                >
                  <User className="w-3 h-3" />
                  {a.split(" ")[0]}
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
            const items = columnTasks[status];
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
                        Nenhuma tarefa
                      </p>
                    )}
                    {items.map((item) => {
                      const isUpdating = updating === item.id;
                      const isOverdue = item.due_date && new Date(item.due_date + "T23:59:59") < new Date() && item.status !== "feito";
                      return (
                        <div
                          key={item.id}
                          className="bg-card border border-border/40 rounded-lg p-3 space-y-2 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold">{item.title}</p>
                              {item.grupo_nome && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">📁 {item.grupo_nome}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {priorityBadge(item.priority)}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteTask(item.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[9px]">
                              <User className="w-2.5 h-2.5 mr-1" />
                              {item.assigned_to.split(" ")[0]}
                            </Badge>
                            {item.due_date && (
                              <span className={cn("text-[10px] flex items-center gap-1", isOverdue ? "text-red-500 font-semibold" : "text-muted-foreground")}>
                                <CalendarIcon className="w-3 h-3" />
                                {new Date(item.due_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                {isOverdue && " ⚠️"}
                              </span>
                            )}
                          </div>
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
