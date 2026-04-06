import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, endOfWeek, addMonths, subMonths, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, Clock, MapPin, Users, Trash2, Edit2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
  created_by: string;
  participants: string[];
  group_id: string | null;
  location: string | null;
  color: string;
};

const EVENT_TYPES = [
  { value: "reuniao", label: "Reunião", color: "#3b82f6" },
  { value: "compromisso", label: "Compromisso", color: "#8b5cf6" },
  { value: "lembrete", label: "Lembrete", color: "#f59e0b" },
  { value: "pessoal", label: "Pessoal", color: "#10b981" },
  { value: "cliente", label: "Reunião com Cliente", color: "#ef4444" },
  { value: "aniversario_cliente", label: "🎂 Aniversário Cliente", color: "#ec4899" },
  { value: "aniversario_empresa", label: "🏢 Aniversário Empresa", color: "#06b6d4" },
];

const TEAM_MEMBERS = [
  "Alisson", "Priscilla", "Jader Costa", "Murilo Araújo", "Netto Monge",
  "Joel", "Thais", "Daniella", "Victor Botto", "Jiza",
];

export default function Agenda() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formType, setFormType] = useState("reuniao");
  const [formParticipants, setFormParticipants] = useState<string[]>([]);
  const [formLocation, setFormLocation] = useState("");

  useEffect(() => {
    loadEvents();

    // Realtime subscription for live updates
    const channel = supabase
      .channel("calendar-events-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () => {
          loadEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadEvents = async () => {
    const [eventsRes, gruposRes] = await Promise.all([
      supabase.from("calendar_events").select("*").order("start_time", { ascending: true }),
      supabase.from("whatsapp_grupos").select("nome, aniversario_cliente, aniversario_empresa, gestor_responsavel"),
    ]);

    const dbEvents = (eventsRes.data || []) as unknown as CalendarEvent[];

    // Generate birthday virtual events for the current year
    const currentYear = new Date().getFullYear();
    const birthdayEvents: CalendarEvent[] = [];
    for (const g of gruposRes.data || []) {
      if (g.aniversario_cliente) {
        const d = parseISO(g.aniversario_cliente);
        const thisYear = new Date(currentYear, d.getMonth(), d.getDate());
        birthdayEvents.push({
          id: `bday-cli-${g.nome}`,
          title: `🎂 Aniver. ${g.nome}`,
          description: `Enviar parabéns ao cliente ${g.nome}`,
          start_time: format(thisYear, "yyyy-MM-dd'T'09:00:00"),
          end_time: format(thisYear, "yyyy-MM-dd'T'09:30:00"),
          event_type: "aniversario_cliente",
          created_by: "Sistema",
          participants: g.gestor_responsavel ? [g.gestor_responsavel] : [],
          group_id: null,
          location: null,
          color: "#ec4899",
        });
      }
      if (g.aniversario_empresa) {
        const d = parseISO(g.aniversario_empresa);
        const thisYear = new Date(currentYear, d.getMonth(), d.getDate());
        birthdayEvents.push({
          id: `bday-emp-${g.nome}`,
          title: `🏢 Aniver. Empresa ${g.nome}`,
          description: `Enviar parabéns pela data de aniversário da empresa ${g.nome}`,
          start_time: format(thisYear, "yyyy-MM-dd'T'09:00:00"),
          end_time: format(thisYear, "yyyy-MM-dd'T'09:30:00"),
          event_type: "aniversario_empresa",
          created_by: "Sistema",
          participants: g.gestor_responsavel ? [g.gestor_responsavel] : [],
          group_id: null,
          location: null,
          color: "#06b6d4",
        });
      }
    }

    setEvents([...dbEvents, ...birthdayEvents]);
    setLoading(false);
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormDate(format(selectedDate, "yyyy-MM-dd"));
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormType("reuniao");
    setFormParticipants([]);
    setFormLocation("");
    setEditingEvent(null);
  };

  const openCreate = () => {
    resetForm();
    setFormDate(format(selectedDate, "yyyy-MM-dd"));
    setShowCreateDialog(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDescription(event.description || "");
    setFormDate(format(parseISO(event.start_time), "yyyy-MM-dd"));
    setFormStartTime(format(parseISO(event.start_time), "HH:mm"));
    setFormEndTime(format(parseISO(event.end_time), "HH:mm"));
    setFormType(event.event_type);
    setFormParticipants(event.participants || []);
    setFormLocation(event.location || "");
    setShowCreateDialog(true);
  };

  const saveEvent = async () => {
    if (!formTitle || !formDate) {
      toast.error("Preencha título e data");
      return;
    }
    const startISO = `${formDate}T${formStartTime}:00-03:00`;
    const endISO = `${formDate}T${formEndTime}:00-03:00`;
    const color = EVENT_TYPES.find(t => t.value === formType)?.color || "#3b82f6";

    if (editingEvent) {
      const { error } = await supabase
        .from("calendar_events")
        .update({
          title: formTitle,
          description: formDescription || null,
          start_time: startISO,
          end_time: endISO,
          event_type: formType,
          participants: formParticipants,
          location: formLocation || null,
          color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingEvent.id);
      if (error) {
        toast.error("Erro ao atualizar evento");
        return;
      }
      toast.success("Evento atualizado!");
    } else {
      const { error } = await supabase
        .from("calendar_events")
        .insert({
          title: formTitle,
          description: formDescription || null,
          start_time: startISO,
          end_time: endISO,
          event_type: formType,
          created_by: profile?.full_name || "Usuário",
          participants: formParticipants,
          location: formLocation || null,
          color,
        });
      if (error) {
        toast.error("Erro ao criar evento");
        return;
      }
      toast.success("Evento criado!");
    }
    setShowCreateDialog(false);
    resetForm();
    loadEvents();
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir evento");
      return;
    }
    toast.success("Evento excluído");
    loadEvents();
  };

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsForDay = (day: Date) =>
    events.filter(e => isSameDay(parseISO(e.start_time), day));

  const selectedDayEvents = useMemo(
    () => events.filter(e => isSameDay(parseISO(e.start_time), selectedDate)),
    [events, selectedDate]
  );

  const toggleParticipant = (name: string) => {
    setFormParticipants(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  if (loading) {
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
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold tracking-tight">📅 Agenda Interna</h1>
                <p className="text-xs text-muted-foreground">Organize reuniões e compromissos da equipe</p>
              </div>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Novo Evento
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* Calendar Grid */}
          <div className="bg-card rounded-xl border border-border/40 p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-base font-semibold capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day) => {
                const dayEvents = eventsForDay(day);
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "min-h-[80px] p-1.5 text-left border border-border/20 rounded-md transition-colors relative",
                      !isCurrentMonth && "opacity-30",
                      isSelected && "bg-primary/10 border-primary/40",
                      isToday(day) && "ring-1 ring-primary/50",
                      "hover:bg-accent/50"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-medium",
                      isToday(day) && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                    )}>
                      {format(day, "d")}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <div
                          key={e.id}
                          className="text-[10px] leading-tight truncate rounded px-1 py-0.5 text-white"
                          style={{ backgroundColor: e.color }}
                        >
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right panel: selected day events */}
          <div className="bg-card rounded-xl border border-border/40 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">
                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <Button variant="outline" size="sm" onClick={openCreate} className="gap-1 text-xs">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-240px)]">
              {selectedDayEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Nenhum evento neste dia</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map(event => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border/30 p-3 space-y-2"
                      style={{ borderLeftWidth: 4, borderLeftColor: event.color }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">{event.title}</h4>
                          <Badge variant="secondary" className="text-[10px] mt-1">
                            {EVENT_TYPES.find(t => t.value === event.event_type)?.label || event.event_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(event)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEvent(event.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(parseISO(event.start_time), "HH:mm")} - {format(parseISO(event.end_time), "HH:mm")}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {event.location}
                          </span>
                        )}
                      </div>

                      {event.description && (
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      )}

                      {event.participants && event.participants.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          {event.participants.map(p => (
                            <Badge key={p} variant="outline" className="text-[10px] py-0">{p}</Badge>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground">Criado por: {event.created_by}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Reunião com cliente X" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data *</label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Início</label>
                <Input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fim</label>
                <Input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Local</label>
              <Input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Ex: Google Meet, Sala 2..." />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Detalhes do evento..." rows={2} />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Participantes</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {TEAM_MEMBERS.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleParticipant(name)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full border transition-colors",
                      formParticipants.includes(name)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button onClick={saveEvent}>{editingEvent ? "Salvar" : "Criar Evento"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
