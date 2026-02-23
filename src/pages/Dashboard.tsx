import { useState, useMemo } from "react";
import { useClientData } from "@/hooks/useClientData";
import { AIChatPanel } from "@/components/AIChatPanel";
import { ClientCard } from "@/components/ClientCard";
import { ClientDetailModal } from "@/components/ClientDetailModal";
import { DashboardFilters } from "@/components/DashboardFilters";
import { TVModeButton, TVModeOverlay } from "@/components/TVMode";
import { Grupo } from "@/types/client";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, MessageSquare, AlertTriangle, TrendingUp, Timer } from "lucide-react";

export default function Dashboard() {
  const { grupos, allGrupos, categorias, lastUpdate, categoriaFilter, setCategoriaFilter } = useClientData();
  const [selectedGrupo, setSelectedGrupo] = useState<Grupo | null>(null);
  const [tvMode, setTvMode] = useState(false);

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
    return { total, totalMsgs, comMsgs, highRisk, avgFrt, positiveSent };
  }, [allGrupos]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Central de Operações CS</h1>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Grupos", value: stats.total, icon: Users, color: "text-primary" },
            { label: "Total Mensagens", value: stats.totalMsgs, icon: MessageSquare, color: "text-emerald-500" },
            { label: "Grupos Ativos", value: stats.comMsgs, icon: Activity, color: "text-amber-500" },
            { label: "Risco Alto", value: stats.highRisk, icon: AlertTriangle, color: "text-red-500" },
            { label: "FRT Médio", value: stats.avgFrt != null ? `${stats.avgFrt}min` : "—", icon: Timer, color: "text-blue-500" },
            { label: "Sentimento +", value: stats.positiveSent, icon: TrendingUp, color: "text-emerald-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-card/60 border border-border/30 rounded-lg p-4 flex items-center gap-3"
            >
              <Icon className={`w-7 h-7 ${color}`} />
              <div>
                <p className="text-xl font-black">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <DashboardFilters
            categorias={categorias}
            activeFilter={categoriaFilter}
            onFilterChange={setCategoriaFilter}
          />
          <Badge variant="secondary" className="text-xs">
            {grupos.length} grupo{grupos.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {grupos.map((g) => (
            <ClientCard key={g.id} grupo={g} onClick={setSelectedGrupo} />
          ))}
          {grupos.length === 0 && (
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
