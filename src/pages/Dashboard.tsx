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
import { Activity, Users, MessageSquare, AlertTriangle, TrendingUp, Timer, AlertCircle } from "lucide-react";
import newvoxLogo from "@/assets/newvox-logo.jpg";

export default function Dashboard() {
  const { grupos, allGrupos, categorias, lastUpdate, categoriaFilter, setCategoriaFilter } = useClientData();
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
    const totalMsgs = allGrupos.reduce((sum, g) => sum + g.total_mensagens, 0);
    const comMsgs = allGrupos.filter((g) => g.total_mensagens > 0).length;
    const highRisk = allGrupos.filter((g) => g.analytics && g.analytics.churn_risk >= 60).length;
    const avgFrtAll = allGrupos.filter((g) => g.analytics?.avg_frt_minutes != null);
    const avgFrt = avgFrtAll.length > 0
      ? Math.round(avgFrtAll.reduce((s, g) => s + (g.analytics!.avg_frt_minutes || 0), 0) / avgFrtAll.length)
      : null;
    const positiveSent = allGrupos.filter((g) => g.analytics?.sentiment === "positivo").length;
    const pendencias = allGrupos.filter((g) => g.analytics?.has_pending_demands).length;
    return { total, totalMsgs, comMsgs, highRisk, avgFrt, positiveSent, pendencias };
  }, [allGrupos]);

  // Filter groups by clicked metric
  const metricFilteredGrupos = useMemo(() => {
    if (!metricFilter) return grupos;
    switch (metricFilter) {
      case "total": return grupos;
      case "totalMsgs": return grupos.filter(g => g.total_mensagens > 0);
      case "ativos": return grupos.filter(g => g.total_mensagens > 0);
      case "highRisk": return grupos.filter(g => g.analytics && g.analytics.churn_risk >= 60);
      case "pendencias": return grupos.filter(g => g.analytics?.has_pending_demands);
      case "frt": return grupos.filter(g => g.analytics?.avg_frt_minutes != null);
      case "positive": return grupos.filter(g => g.analytics?.sentiment === "positivo");
      default: return grupos;
    }
  }, [grupos, metricFilter]);

  const metricLabels: Record<string, string> = {
    total: "Total Grupos",
    totalMsgs: "Com Mensagens",
    ativos: "Grupos Ativos",
    highRisk: "Risco Alto",
    pendencias: "Pendências",
    frt: "Com FRT",
    positive: "Sentimento Positivo",
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { key: "total", label: "Total Grupos", value: stats.total, icon: Users, color: "text-primary" },
            { key: "totalMsgs", label: "Total Mensagens", value: stats.totalMsgs, icon: MessageSquare, color: "text-emerald-500" },
            { key: "ativos", label: "Grupos Ativos", value: stats.comMsgs, icon: Activity, color: "text-amber-500" },
            { key: "highRisk", label: "Risco Alto", value: stats.highRisk, icon: AlertTriangle, color: "text-red-500" },
            { key: "pendencias", label: "Pendências", value: stats.pendencias, icon: AlertCircle, color: "text-orange-500" },
            { key: "frt", label: "FRT Médio", value: stats.avgFrt != null ? `${stats.avgFrt}min` : "—", icon: Timer, color: "text-blue-500" },
            { key: "positive", label: "Sentimento +", value: stats.positiveSent, icon: TrendingUp, color: "text-emerald-500" },
          ].map(({ key, label, value, icon: Icon, color }) => (
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
            >
              <Icon className={`w-7 h-7 ${color}`} />
              <div>
                <p className="text-xl font-black">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
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
