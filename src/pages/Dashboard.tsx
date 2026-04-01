import { useState, useMemo } from "react";
import { usePendingAlert, useHighRiskAlert } from "@/hooks/usePendingAlert";
import { cn } from "@/lib/utils";
import { useClientData } from "@/hooks/useClientData";
import { AIChatPanel } from "@/components/AIChatPanel";
import { ClientCard } from "@/components/ClientCard";
import { ClientDetailModal } from "@/components/ClientDetailModal";
import { DashboardFilters } from "@/components/DashboardFilters";
import { TVModeButton, TVModeOverlay } from "@/components/TVMode";
import { Grupo } from "@/types/client";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, MessageSquare, AlertTriangle, TrendingUp, Timer, AlertCircle, LogOut, Moon, Flame, ShieldAlert } from "lucide-react";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { grupos, allGrupos, categorias, lastUpdate, categoriaFilter, setCategoriaFilter } = useClientData();
  const { signOut } = useAuth();
  const [selectedGrupo, setSelectedGrupo] = useState<Grupo | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [metricFilter, setMetricFilter] = useState<string | null>(null);

  // Sound alert for pending demands
  const pendingCount = useMemo(
    () => allGrupos.filter((g) => g.analytics?.has_pending_demands).length,
    [allGrupos]
  );
  const highRiskCount = useMemo(
    () => allGrupos.filter((g) => g.analytics && g.analytics.churn_risk >= 60).length,
    [allGrupos]
  );
  usePendingAlert(pendingCount);
  useHighRiskAlert(highRiskCount);

  const stats = useMemo(() => {
    const total = allGrupos.length;
    const totalMsgsHoje = allGrupos.reduce((sum, g) => sum + (g.mensagens_hoje || 0), 0);
    const now24 = Date.now() - 24 * 60 * 60 * 1000;
    const comMsgs = allGrupos.filter((g) => g.ultimo_horario && new Date(g.ultimo_horario).getTime() > now24).length;
    const highRisk = allGrupos.filter((g) => g.analytics && g.analytics.churn_risk >= 60).length;
    const avgFrtAll = allGrupos.filter((g) => g.analytics?.avg_frt_minutes != null);
    const avgFrt = avgFrtAll.length > 0
      ? Math.round(avgFrtAll.reduce((s, g) => s + (g.analytics!.avg_frt_minutes || 0), 0) / avgFrtAll.length)
      : null;
    const positiveSent = allGrupos.filter((g) => g.analytics?.sentiment === "positivo").length;
    const pendencias = allGrupos.filter((g) => g.analytics?.has_pending_demands).length;
    const slaViolations = allGrupos.filter((g) => g.sla_violated).length;
    const priorityCount = allGrupos.filter((g) => g.sla_violated || (g.analytics && g.analytics.churn_risk >= 60)).length;
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const inativos = allGrupos.filter((g) => {
      if (!g.ultimo_horario) return true;
      return now - new Date(g.ultimo_horario).getTime() > h24;
    }).length;
    const h48 = 48 * 60 * 60 * 1000;
    const dengue = allGrupos.filter((g) => {
      if (!g.ultimo_horario) return true;
      return now - new Date(g.ultimo_horario).getTime() > h48;
    }).length;
    return { total, totalMsgsHoje, comMsgs, highRisk, avgFrt, positiveSent, pendencias, inativos, dengue, slaViolations, priorityCount };
  }, [allGrupos]);

  // Filter groups by clicked metric
  const metricFilteredGrupos = useMemo(() => {
    let result = grupos;
    if (metricFilter) {
      switch (metricFilter) {
        case "total": result = grupos; break;
        case "totalMsgs": result = grupos.filter(g => g.total_mensagens > 0); break;
        case "ativos": result = grupos.filter(g => g.ultimo_horario && Date.now() - new Date(g.ultimo_horario).getTime() < 24 * 60 * 60 * 1000); break;
        case "highRisk": result = grupos.filter(g => g.analytics && g.analytics.churn_risk >= 60); break;
        case "pendencias": result = grupos.filter(g => g.analytics?.has_pending_demands); break;
        case "frt": result = grupos.filter(g => g.analytics?.avg_frt_minutes != null); break;
        case "positive": result = grupos.filter(g => g.analytics?.sentiment === "positivo"); break;
        case "inativos": result = grupos.filter(g => {
          if (!g.ultimo_horario) return true;
          return Date.now() - new Date(g.ultimo_horario).getTime() > 24 * 60 * 60 * 1000;
        }); break;
        case "dengue": result = grupos.filter(g => {
          if (!g.ultimo_horario) return true;
          return Date.now() - new Date(g.ultimo_horario).getTime() > 48 * 60 * 60 * 1000;
        }); break;
        case "sla": result = grupos.filter(g => g.sla_violated); break;
        case "priority": result = grupos.filter(g => g.sla_violated || (g.analytics && g.analytics.churn_risk >= 60)); break;
        default: break;
      }
    }
    // Sort: SLA violated groups always on top
    return [...result].sort((a, b) => {
      if (a.sla_violated && !b.sla_violated) return -1;
      if (!a.sla_violated && b.sla_violated) return 1;
      if (a.sla_violated && b.sla_violated) return b.sla_delay_minutes - a.sla_delay_minutes;
      return 0;
    });
  }, [grupos, metricFilter]);

  const metricLabels: Record<string, string> = {
    total: "Total Grupos",
    totalMsgs: "Com Mensagens",
    ativos: "Grupos Ativos",
    highRisk: "Risco Alto",
    pendencias: "Pendências",
    frt: "Com FRT",
    positive: "Sentimento Positivo",
    inativos: "Grupos Inativos",
    dengue: "Grupos da Dengue",
    sla: "SLA Violado",
    priority: "Prioridade Máxima",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Painel de Controle New Vox</h1>
                <p className="text-xs text-muted-foreground">
                  Última atualização: {lastUpdate.toLocaleTimeString("pt-BR")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                AO VIVO
              </div>
              <TVModeButton onClick={() => setTvMode(true)} />
              <button onClick={signOut} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-11 gap-4">
          {[
            { key: "total", label: "Total Grupos", desc: "Todos os grupos cadastrados", value: stats.total, icon: Users, color: "text-primary" },
            { key: "totalMsgs", label: "Mensagens Hoje", desc: "Total de mensagens do dia", value: stats.totalMsgsHoje, icon: MessageSquare, color: "text-emerald-500" },
            { key: "ativos", label: "Grupos Ativos", desc: "Com atividade nas últimas 24h", value: stats.comMsgs, icon: Activity, color: "text-amber-500" },
            { key: "highRisk", label: "Risco Alto", desc: "Risco de churn ≥ 60%", value: stats.highRisk, icon: AlertTriangle, color: "text-red-500" },
            { key: "pendencias", label: "Pendências", desc: "Demandas ainda não resolvidas", value: stats.pendencias, icon: AlertCircle, color: "text-orange-500" },
            { key: "frt", label: "FRT Médio", desc: "Tempo médio de 1ª resposta", value: stats.avgFrt != null ? `${stats.avgFrt}min` : "—", icon: Timer, color: "text-blue-500" },
            { key: "positive", label: "Sentimento +", desc: "Grupos com sentimento positivo", value: stats.positiveSent, icon: TrendingUp, color: "text-emerald-500" },
            { key: "inativos", label: "Grupos Inativos", desc: "Sem atividade há mais de 24h", value: stats.inativos, icon: Moon, color: "text-zinc-400" },
            { key: "dengue", label: "Grupos da Dengue", desc: "Sem atividade há mais de 48h", value: stats.dengue, icon: Flame, color: "text-red-600" },
          ].map(({ key, label, desc, value, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setMetricFilter(metricFilter === key ? null : key)}
              className={cn(
                "bg-card/60 border rounded-lg p-4 flex items-center gap-3 transition-all text-left w-full",
                "hover:border-primary/40 hover:bg-card/80 cursor-pointer",
                metricFilter === key
                  ? "border-primary ring-1 ring-primary/30 bg-card"
                  : "border-border/30"
              )}
              title={desc}
            >
              <Icon className={`w-7 h-7 ${color}`} />
              <div>
                <p className="text-xl font-black">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-[9px] text-muted-foreground/60">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <DashboardFilters
            categorias={categorias}
            activeFilter={categoriaFilter}
            onFilterChange={(f) => { setCategoriaFilter(f); setMetricFilter(null); }}
          />
          <div className="flex items-center gap-2">
            {metricFilter && (
              <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setMetricFilter(null)}>
                {metricLabels[metricFilter]} ✕
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {metricFilteredGrupos.length} grupo{metricFilteredGrupos.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {metricFilteredGrupos.map((g) => (
            <ClientCard key={g.id} grupo={g} onClick={setSelectedGrupo} />
          ))}
          {metricFilteredGrupos.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">
              Nenhum grupo encontrado.
            </p>
          )}
        </div>
      </main>

      {/* Modal */}
      <ClientDetailModal
        grupo={selectedGrupo}
        open={!!selectedGrupo}
        onClose={() => setSelectedGrupo(null)}
      />

      {tvMode && (
        <TVModeOverlay
          grupos={allGrupos}
          onSelectGrupo={setSelectedGrupo}
          onClose={() => setTvMode(false)}
        />
      )}

      <AIChatPanel />
    </div>
  );
}
