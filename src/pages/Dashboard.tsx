import { useState, useMemo } from "react";
import { useClientData } from "@/hooks/useClientData";
import { ClientCard } from "@/components/ClientCard";
import { ClientDetailModal } from "@/components/ClientDetailModal";
import { DashboardFilters, FilterType } from "@/components/DashboardFilters";
import { TVModeButton, TVModeOverlay } from "@/components/TVMode";
import { Cliente } from "@/types/client";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, AlertTriangle, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { clientes, lastUpdate } = useClientData();
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [filter, setFilter] = useState<FilterType>("todos");
  const [tvMode, setTvMode] = useState(false);

  const filtered = useMemo(() => {
    switch (filter) {
      case "em_risco":
        return clientes.filter(
          (c) => c.risco_churn === "medio" || c.risco_churn === "alto" || c.conversas_iniciadas === 0
        );
      case "sem_conversas":
        return clientes.filter((c) => c.conversas_iniciadas === 0);
      case "positivo":
        return clientes.filter((c) => c.satisfacao === "positivo");
      case "neutro":
        return clientes.filter((c) => c.satisfacao === "neutro");
      case "negativo":
        return clientes.filter((c) => c.satisfacao === "negativo");
      default:
        return clientes;
    }
  }, [clientes, filter]);

  const stats = useMemo(() => {
    const total = clientes.length;
    const emRisco = clientes.filter(
      (c) => c.risco_churn === "medio" || c.risco_churn === "alto"
    ).length;
    const positivos = clientes.filter((c) => c.satisfacao === "positivo").length;
    const mediaNotas =
      total > 0
        ? (clientes.reduce((sum, c) => sum + c.nota_gestor, 0) / total).toFixed(1)
        : "0";
    return { total, emRisco, positivos, mediaNotas };
  }, [clientes]);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Clientes", value: stats.total, icon: Users, color: "text-primary" },
            { label: "Em Risco", value: stats.emRisco, icon: AlertTriangle, color: "text-red-400" },
            { label: "Satisfeitos", value: stats.positivos, icon: TrendingUp, color: "text-emerald-400" },
            { label: "Nota Média", value: stats.mediaNotas, icon: Activity, color: "text-amber-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-card/60 border border-border/30 rounded-lg p-4 flex items-center gap-3"
            >
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <p className="text-2xl font-black">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <DashboardFilters activeFilter={filter} onFilterChange={setFilter} />
          <Badge variant="secondary" className="text-xs">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <ClientCard key={c.id} cliente={c} onClick={setSelectedClient} />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">
              Nenhum cliente encontrado com esse filtro.
            </p>
          )}
        </div>
      </main>

      {/* Modals */}
      <ClientDetailModal
        cliente={selectedClient}
        open={!!selectedClient}
        onClose={() => setSelectedClient(null)}
      />

      {tvMode && (
        <TVModeOverlay
          clientes={clientes}
          onSelectClient={setSelectedClient}
          onClose={() => setTvMode(false)}
        />
      )}
    </div>
  );
}
