import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import {
  MessageSquare, Timer, CheckCircle, TrendingUp, Users, ArrowUpDown,
  Trophy, Medal, Award,
} from "lucide-react";
import newvoxLogo from "@/assets/newvox-logo.jpg";

type Period = "today" | "week" | "month";

interface Collaborator {
  name: string;
  role: string;
  total_responses: number;
  avg_frt_minutes: number | null;
  resolutions: number;
  daily_volumes: Record<string, number>;
}

interface PerformanceData {
  period: string;
  global: {
    total_entrada: number;
    total_saida: number;
    avg_frt_minutes: number | null;
    total_resolutions: number;
    total_conversations: number;
  };
  collaborators: Collaborator[];
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

export default function Performance() {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-performance?period=${period}`;
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
        });
        if (!resp.ok) throw new Error("Erro ao buscar dados");
        const json = await resp.json();
        setData(json);
      } catch (err) {
        console.error("Performance fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period]);

  const periodLabels: Record<Period, string> = {
    today: "Hoje",
    week: "Últimos 7 dias",
    month: "Mês Atual",
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.daily_volumes.map((d) => ({
      ...d,
      date: formatDate(d.date),
    }));
  }, [data]);

  const sentimentData = useMemo(() => {
    if (!data) return [];
    return data.sentiment_evolution.map((d) => ({
      ...d,
      date: formatDate(d.date),
    }));
  }, [data]);

  // Sort collaborators by FRT (best first) for ranking
  const frtRanking = useMemo(() => {
    if (!data) return [];
    return [...data.collaborators]
      .filter((c) => c.avg_frt_minutes != null && c.total_responses > 0)
      .sort((a, b) => (a.avg_frt_minutes || 999) - (b.avg_frt_minutes || 999));
  }, [data]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Central de Performance</h1>
                <p className="text-xs text-muted-foreground">
                  Métricas de equipe e evolução operacional
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(["today", "week", "month"] as Period[]).map((p) => (
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
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-8">
        {/* Global KPI Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Mensagens Recebidas", value: data.global.total_entrada, icon: MessageSquare, color: "text-blue-500" },
              { label: "Mensagens Enviadas", value: data.global.total_saida, icon: MessageSquare, color: "text-emerald-500" },
              { label: "FRT Médio Global", value: formatFrt(data.global.avg_frt_minutes), icon: Timer, color: "text-amber-500" },
              { label: "Pendências Resolvidas", value: data.global.total_resolutions, icon: CheckCircle, color: "text-emerald-500" },
              { label: "Total Interações", value: data.global.total_conversations, icon: TrendingUp, color: "text-primary" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="bg-card/60 border-border/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={cn("w-8 h-8", color)} />
                  <div>
                    <p className="text-2xl font-black">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Volume Chart */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Volume Diário de Mensagens</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="entrada" name="Entrada" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="saida" name="Saída" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sentiment Evolution */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Evolução do Sentimento Geral</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sentimentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[-100, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value}`, "Score"]}
                  />
                  <Line type="monotone" dataKey="score" name="Sentimento" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Collaborator Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ranking by Response Volume */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" /> Ranking de Volume de Respostas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data && (
                <ResponsiveContainer width="100%" height={Math.max(200, data.collaborators.length * 45)}>
                  <BarChart
                    data={data.collaborators.filter((c) => c.total_responses > 0)}
                    layout="vertical"
                    margin={{ left: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      width={75}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="total_responses" name="Respostas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* FRT Ranking Table */}
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" /> Ranking de Tempo de Resposta (FRT)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {frtRanking.map((c, idx) => {
                  const RankIcon = rankIcons[idx] || null;
                  const rankColor = rankColors[idx] || "text-muted-foreground";
                  return (
                    <div
                      key={c.name}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        idx === 0
                          ? "bg-amber-500/5 border-amber-500/20"
                          : "bg-card/40 border-border/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-muted-foreground w-6 text-center">
                          {RankIcon ? <RankIcon className={cn("w-5 h-5", rankColor)} /> : `${idx + 1}º`}
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-bold">{formatFrt(c.avg_frt_minutes)}</p>
                          <p className="text-[10px] text-muted-foreground">FRT</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold">{c.total_responses}</p>
                          <p className="text-[10px] text-muted-foreground">Respostas</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {frtRanking.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Sem dados de FRT no período selecionado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Individual Collaborator Cards */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">KPIs Individuais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data?.collaborators.map((c) => (
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
