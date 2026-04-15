import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart, Cell, PieChart, Pie,
} from "recharts";
import {
  MessageSquare, Timer, CheckCircle, TrendingUp, Users, ArrowUpDown,
  Trophy, Medal, Award, Heart, ListChecks, AlertTriangle, Activity, Star, DollarSign,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { usePerformanceData, type GestorMetrics } from "@/hooks/usePerformanceData";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

type Period = "today" | "week" | "month" | "quarter" | "custom";

interface TeamPerfData {
  period: string;
  global: {
    total_entrada: number;
    total_saida: number;
    avg_frt_minutes: number | null;
    total_resolutions: number;
    total_conversations: number;
  };
  collaborators: { name: string; role: string; total_responses: number; avg_frt_minutes: number | null; resolutions: number; daily_volumes: Record<string, number> }[];
  daily_volumes: { date: string; entrada: number; saida: number; total: number }[];
  sentiment_evolution: { date: string; score: number }[];
}

function formatFrt(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

const rankIcons = [Trophy, Medal, Award];
const rankColors = ["text-amber-400", "text-zinc-400", "text-orange-600"];

const SCORE_LABELS: Record<string, string> = {
  nps: "NPS Preditivo",
  frt: "Tempo de Resposta",
  tasks: "Tarefas Executadas",
  resolutions: "Pendências Resolvidas",
  sentiment: "Sentimento",
  inactivity: "Atividade dos Grupos",
};

const SCORE_ICONS: Record<string, any> = {
  nps: Heart,
  frt: Timer,
  tasks: ListChecks,
  resolutions: CheckCircle,
  sentiment: Activity,
  inactivity: AlertTriangle,
};

function getScoreColor(score: number): string {
  if (score >= 8) return "text-emerald-500";
  if (score >= 6) return "text-amber-500";
  if (score >= 4) return "text-orange-500";
  return "text-red-500";
}

function getScoreBg(score: number): string {
  if (score >= 8) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 6) return "bg-amber-500/10 border-amber-500/20";
  if (score >= 4) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}

const getNpsBarColor = (score: number) => {
  if (score >= 9) return "#10b981";
  if (score >= 7) return "#f59e0b";
  return "#ef4444";
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function Performance() {
  const [period, setPeriod] = useState<Period>("week");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [selectedGestor, setSelectedGestor] = useState<string>("all");
  const [teamData, setTeamData] = useState<TeamPerfData | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const teamDataCache = useRef<Record<string, { data: TeamPerfData; ts: number }>>({});
  const { isAdmin, gestorFilter } = useProfile();

  // For non-admin users, force their own gestor view
  useEffect(() => {
    if (!isAdmin && gestorFilter) {
      setSelectedGestor(gestorFilter);
    }
  }, [isAdmin, gestorFilter]);

  const customRange = useMemo(() => {
    if (period === "custom" && customDateRange.from && customDateRange.to) {
      return { start: customDateRange.from, end: customDateRange.to };
    }
    return null;
  }, [period, customDateRange]);

  const {
    loading: dataLoading,
    gestores,
    gruposMap,
    computeGestorMetrics,
    getClientNpsData,
    getClientTasksData,
    getClientPendingData,
    getClientLtvData,
    getLtvEvolution,
    getLtvStats,
    gestorRanking,
  } = usePerformanceData(period, customRange);

  // Fetch team-performance edge function data
  useEffect(() => {
    async function fetchTeamData() {
      setTeamLoading(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-performance?period=${period}`;
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
        });
        if (!resp.ok) throw new Error("Erro ao buscar dados");
        setTeamData(await resp.json());
      } catch (err) {
        console.error("Team performance fetch error:", err);
      } finally {
        setTeamLoading(false);
      }
    }
    fetchTeamData();
  }, [period]);

  const gestorName = selectedGestor === "all" ? null : selectedGestor;
  const metrics = useMemo(() => computeGestorMetrics(gestorName), [computeGestorMetrics, gestorName]);
  const clientNpsData = useMemo(() => getClientNpsData(gestorName), [getClientNpsData, gestorName]);
  const clientTasksData = useMemo(() => getClientTasksData(gestorName), [getClientTasksData, gestorName]);
  const clientPendingData = useMemo(() => getClientPendingData(gestorName), [getClientPendingData, gestorName]);
  const clientLtvData = useMemo(() => getClientLtvData(gestorName), [getClientLtvData, gestorName]);
  const ltvEvolution = useMemo(() => getLtvEvolution(gestorName), [getLtvEvolution, gestorName]);
  const ltvStats = useMemo(() => getLtvStats(gestorName), [getLtvStats, gestorName]);

  // Filter team data by gestor
  const filteredCollaborators = useMemo(() => {
    if (!teamData) return [];
    if (!gestorName) return teamData.collaborators;
    return teamData.collaborators.filter(c => c.name === gestorName);
  }, [teamData, gestorName]);

  // FRT for selected gestor
  const gestorFrt = useMemo(() => {
    const collab = filteredCollaborators.find(c => c.name === gestorName);
    return collab?.avg_frt_minutes ?? teamData?.global.avg_frt_minutes ?? null;
  }, [filteredCollaborators, gestorName, teamData]);

  // Update FRT score in metrics
  const enhancedMetrics = useMemo((): GestorMetrics => {
    const frt = gestorFrt;
    let frtScore = 5;
    if (frt != null) {
      if (frt <= 15) frtScore = 10;
      else if (frt <= 30) frtScore = 8;
      else if (frt <= 60) frtScore = 6;
      else if (frt <= 120) frtScore = 4;
      else if (frt <= 240) frtScore = 2;
      else frtScore = 1;
    }
    const scores = { ...metrics.scores, frt: frtScore };
    const overall = Number(((scores.nps + scores.npsReal + scores.frt + scores.tasks + scores.resolutions + scores.sentiment + scores.inactivity) / 7).toFixed(1));
    return { ...metrics, frtAvg: frt ?? 0, scores: { ...scores, overall } };
  }, [metrics, gestorFrt]);

  const sentimentData = useMemo(() => {
    if (!teamData) return [];
    return teamData.sentiment_evolution.map((d) => ({
      ...d,
      date: formatDate(d.date),
    }));
  }, [teamData]);

  const chartData = useMemo(() => {
    if (!teamData) return [];
    return teamData.daily_volumes.map((d) => ({
      ...d,
      date: formatDate(d.date),
    }));
  }, [teamData]);

  const periodLabels: Record<Period, string> = {
    today: "Hoje",
    week: "7 dias",
    month: "Mês",
    quarter: "Trimestre",
  };

  const loading = dataLoading || teamLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando dados de performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Central de Performance</h1>
                <p className="text-xs text-muted-foreground">Métricas detalhadas por responsável</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Gestor Selector */}
              {isAdmin && (
                <Select value={selectedGestor} onValueChange={setSelectedGestor}>
                  <SelectTrigger className="w-[200px] text-xs">
                    <SelectValue placeholder="Selecionar responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos (Geral)</SelectItem>
                    {gestores.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Period Selector */}
              <div className="flex items-center gap-1">
                {(["today", "week", "month", "quarter"] as Period[]).map((p) => (
                  <Button
                    key={p}
                    variant={period === p ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setPeriod(p)}
                  >
                    {periodLabels[p]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-8">

        {/* ═══════════ SCORECARD (Notas 1-10) ═══════════ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold">
              Scorecard — {enhancedMetrics.name}
            </h2>
            <Badge variant="outline" className={cn("text-xs font-bold", getScoreColor(enhancedMetrics.scores.overall))}>
              Nota Geral: {enhancedMetrics.scores.overall}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.keys(SCORE_LABELS) as Array<keyof typeof SCORE_LABELS>).map((key) => {
              const score = enhancedMetrics.scores[key as keyof typeof enhancedMetrics.scores] as number;
              const Icon = SCORE_ICONS[key];
              return (
                <Card key={key} className={cn("border transition-colors", getScoreBg(score))}>
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <Icon className={cn("w-5 h-5 mb-1", getScoreColor(score))} />
                    <p className={cn("text-3xl font-black", getScoreColor(score))}>{score}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{SCORE_LABELS[key]}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ═══════════ KPIs RÁPIDOS ═══════════ */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "NPS Médio", value: enhancedMetrics.npsAvg.toFixed(1), icon: Heart, color: "text-primary" },
            { label: "FRT Médio", value: formatFrt(enhancedMetrics.frtAvg || null), icon: Timer, color: "text-amber-500" },
            { label: "Tarefas Concluídas", value: `${enhancedMetrics.tasksCompleted}/${enhancedMetrics.tasksTotal}`, icon: ListChecks, color: "text-blue-500" },
            { label: "Pendências Resolvidas", value: `${enhancedMetrics.pendingResolved}/${enhancedMetrics.pendingTotal}`, icon: CheckCircle, color: "text-emerald-500" },
            { label: "Clientes", value: enhancedMetrics.clients.length, icon: Users, color: "text-violet-500" },
            { label: "Grupos Ativos", value: `${enhancedMetrics.totalGroups - enhancedMetrics.inactiveGroups}/${enhancedMetrics.totalGroups}`, icon: Activity, color: "text-cyan-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-card/60 border-border/30">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={cn("w-7 h-7 shrink-0", color)} />
                <div>
                  <p className="text-xl font-black">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ═══════════ EVOLUÇÃO NPS PREDITIVO ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" /> Evolução NPS Preditivo (Geral)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              {enhancedMetrics.npsEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={enhancedMetrics.npsEvolution.map(e => ({ ...e, date: formatDate(e.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="score" name="NPS Médio" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de evolução NPS no período.</p>
              )}
            </CardContent>
          </Card>

          {/* NPS por Cliente */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">NPS Preditivo por Cliente</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              {clientNpsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientNpsData} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} height={60} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "NPS"]} />
                    <Bar dataKey="score" name="NPS" radius={[4, 4, 0, 0]}>
                      {clientNpsData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={getNpsBarColor(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de NPS.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════ EVOLUÇÃO SENTIMENTO + VOLUME ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4" /> Evolução do Sentimento
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              {sentimentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sentimentData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}`, "Score"]} />
                    <Line type="monotone" dataKey="score" name="Sentimento" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de sentimento.</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Volume Diário de Mensagens</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Area type="monotone" dataKey="entrada" name="Entrada" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="saida" name="Saída" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de volume.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════ TAREFAS + PENDÊNCIAS ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tarefas por Cliente */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-blue-500" /> Tarefas por Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              {clientTasksData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientTasksData} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} height={60} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="completed" name="Concluídas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.4} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de tarefas no período.</p>
              )}
            </CardContent>
          </Card>

          {/* Pendências por Cliente */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" /> Pendências Resolvidas por Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              {clientPendingData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientPendingData} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} height={60} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="resolved" name="Resolvidas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.3} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados de pendências no período.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════ EVOLUÇÃO TAREFAS + PENDÊNCIAS (Timeline) ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Evolução de Tarefas</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              {enhancedMetrics.tasksEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enhancedMetrics.tasksEvolution.map(e => ({ ...e, date: formatDate(e.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="completed" name="Concluídas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Criadas" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.4} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sem evolução de tarefas.</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Evolução de Pendências</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              {enhancedMetrics.pendingEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enhancedMetrics.pendingEvolution.map(e => ({ ...e, date: formatDate(e.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="resolved" name="Resolvidas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.3} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sem evolução de pendências.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════ LTV (Lifetime Value) ═══════════ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-semibold">LTV — Tempo de Vida do Cliente</h2>
            <Badge variant="outline" className="text-xs">
              Total Meses Acumulados: {ltvStats.totalMonths}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Média: {ltvStats.avgMonths.toFixed(1)} meses
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {ltvStats.clientCount} clientes
            </Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LTV Evolution */}
            <Card className="bg-card/60 border-border/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Evolução do LTV Acumulado
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {ltvEvolution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ltvEvolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "LTV Acumulado"]} />
                      <Area type="monotone" dataKey="value" name="LTV" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">Sem dados de LTV. Preencha a data de entrada e investimento dos clientes.</p>
                )}
              </CardContent>
            </Card>

            {/* LTV por Cliente */}
            <Card className="bg-card/60 border-border/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" /> Meses Ativos por Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {clientLtvData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientLtvData.slice(0, 15)} margin={{ bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" interval={0} height={60} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} meses`, "Tempo ativo"]} />
                      <Bar dataKey="months" name="Meses" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">Sem dados de LTV.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* LTV per Gestor ranking (when viewing all) */}
          {selectedGestor === "all" && gestores.length > 0 && (
            <div className="mt-4">
              <Card className="bg-card/60 border-border/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" /> LTV por Responsável
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {gestores.map((g, idx) => {
                      const stats = getLtvStats(g);
                      const RankIcon = rankIcons[idx] || null;
                      const rankColor = rankColors[idx] || "text-muted-foreground";
                      return (
                        <div key={g} className={cn("flex items-center justify-between p-3 rounded-lg border", idx === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card/40 border-border/20")}>
                          <div className="flex items-center gap-3">
                            <span className="w-6 text-center">
                              {RankIcon ? <RankIcon className={cn("w-5 h-5", rankColor)} /> : <span className="text-sm font-black text-muted-foreground">{idx + 1}º</span>}
                            </span>
                            <div>
                              <p className="text-sm font-semibold">{g}</p>
                              <p className="text-[10px] text-muted-foreground">{stats.clientCount} clientes • Tempo médio: {stats.avgMonths.toFixed(0)} meses</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-500">{stats.totalMonths} meses</p>
                            <p className="text-[10px] text-muted-foreground">Total Acumulado</p>
                          </div>
                        </div>
                      );
                    })
                    .sort(() => 0)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* ═══════════ FRT RANKING ═══════════ */}
        {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" /> Ranking de FRT
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredCollaborators
                  .filter(c => c.avg_frt_minutes != null && c.total_responses > 0)
                  .sort((a, b) => (a.avg_frt_minutes || 999) - (b.avg_frt_minutes || 999))
                  .map((c, idx) => {
                    const RankIcon = rankIcons[idx] || null;
                    const rankColor = rankColors[idx] || "text-muted-foreground";
                    return (
                      <div key={c.name} className={cn("flex items-center justify-between p-3 rounded-lg border", idx === 0 ? "bg-amber-500/5 border-amber-500/20" : "bg-card/40 border-border/20")}>
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center">
                            {RankIcon ? <RankIcon className={cn("w-5 h-5", rankColor)} /> : <span className="text-sm font-black text-muted-foreground">{idx + 1}º</span>}
                          </span>
                          <div>
                            <p className="text-sm font-semibold">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.role} • {c.total_responses} respostas</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{formatFrt(c.avg_frt_minutes)}</p>
                          <p className="text-[10px] text-muted-foreground">FRT</p>
                        </div>
                      </div>
                    );
                  })}
                {filteredCollaborators.filter(c => c.avg_frt_minutes != null).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados de FRT.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Volume Ranking */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" /> Ranking de Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCollaborators.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, filteredCollaborators.length * 45)}>
                  <BarChart data={filteredCollaborators.filter(c => c.total_responses > 0)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={75} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="total_responses" name="Respostas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados de volume.</p>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {/* ═══════════ RANKING GERAL DOS GESTORES (Scorecard comparativo) ═══════════ */}
        {selectedGestor === "all" && gestorRanking.length > 0 && (
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Ranking Geral por Responsável
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Responsável</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">NPS Pred.</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">NPS Real</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">FRT</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Tarefas</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Pendências</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Sentimento</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Atividade</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">GERAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gestorRanking.map((g, idx) => {
                      const RankIcon = rankIcons[idx] || null;
                      const rankColor = rankColors[idx] || "text-muted-foreground";
                      return (
                        <tr key={g.name} className={cn("border-b border-border/10", idx === 0 && "bg-amber-500/5")}>
                          <td className="py-3 px-2">
                            {RankIcon ? <RankIcon className={cn("w-4 h-4", rankColor)} /> : <span className="font-bold text-muted-foreground">{idx + 1}º</span>}
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-semibold">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground">{g.clients.length} clientes</p>
                          </td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.nps))}>{g.scores.nps}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.npsReal))}>{g.scores.npsReal}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.frt))}>{g.scores.frt}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.tasks))}>{g.scores.tasks}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.resolutions))}>{g.scores.resolutions}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.sentiment))}>{g.scores.sentiment}</td>
                          <td className={cn("py-3 px-2 text-center font-bold", getScoreColor(g.scores.inactivity))}>{g.scores.inactivity}</td>
                          <td className="py-3 px-2 text-center">
                            <Badge className={cn("text-xs font-bold", getScoreBg(g.scores.overall), getScoreColor(g.scores.overall))}>
                              {g.scores.overall}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════ KPIs INDIVIDUAIS ═══════════ */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">KPIs Individuais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredCollaborators.map((c) => (
              <Card key={c.name} className="bg-card/60 border-border/30">
                <CardHeader className="pb-1 p-4">
                  <CardTitle className="text-sm">{c.name}</CardTitle>
                  <p className="text-[10px] text-muted-foreground">{c.role}</p>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-black">{c.total_responses}</p>
                      <p className="text-[9px] text-muted-foreground">Respostas</p>
                    </div>
                    <div>
                      <p className={cn("text-lg font-black", c.avg_frt_minutes != null && c.avg_frt_minutes > 120 ? "text-red-500" : c.avg_frt_minutes != null && c.avg_frt_minutes <= 30 ? "text-emerald-500" : "")}>
                        {formatFrt(c.avg_frt_minutes)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">FRT</p>
                    </div>
                    <div>
                      <p className="text-lg font-black">{c.resolutions}</p>
                      <p className="text-[9px] text-muted-foreground">Resolvidas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
