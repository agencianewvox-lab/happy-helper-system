import { useState, useMemo } from "react";
import { usePendingAlert, useHighRiskAlert } from "@/hooks/usePendingAlert";
import { cn } from "@/lib/utils";
import { useClientData } from "@/hooks/useClientData";
import { AIChatPanel } from "@/components/AIChatPanel";
import { ClientCard } from "@/components/ClientCard";
import { ClientDetailModal } from "@/components/ClientDetailModal";
import { DashboardFilters } from "@/components/DashboardFilters";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { TVModeButton, TVModeOverlay } from "@/components/TVMode";
import { Grupo } from "@/types/client";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Activity, Users, MessageSquare, AlertTriangle, TrendingUp, Timer, AlertCircle, Moon, Flame, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { CoachPanel } from "@/components/CoachPanel";
import { useNpsPredictions } from "@/hooks/useNpsPredictions";
import { BirthdayAlerts } from "@/components/BirthdayAlerts";

export default function Dashboard() {
  const navigate = useNavigate();
  const { grupos, allGrupos, categorias, lastUpdate, categoriaFilter, setCategoriaFilter } = useClientData();
  const { signOut } = useAuth();
  const { isAdmin, isMaster, gestorFilter, loading: profileLoading, profile } = useProfile();
  const [selectedGrupo, setSelectedGrupo] = useState<Grupo | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [metricFilter, setMetricFilter] = useState<string | null>(null);
  const { predictionsMap, npsGlobal } = useNpsPredictions();

  const roleGrupos = useMemo(() => {
    if (profileLoading) return [];
    if (isAdmin) return grupos;
    if (!gestorFilter) return [];
    return grupos.filter(g => g.gestor_responsavel === gestorFilter);
  }, [grupos, isAdmin, gestorFilter, profileLoading]);

  const roleAllGrupos = useMemo(() => {
    if (profileLoading) return [];
    if (isAdmin) return allGrupos;
    if (!gestorFilter) return [];
    return allGrupos.filter(g => g.gestor_responsavel === gestorFilter);
  }, [allGrupos, isAdmin, gestorFilter, profileLoading]);

  // Sound alert for pending demands
  const pendingCount = useMemo(
    () => roleAllGrupos.filter((g) => g.analytics?.has_pending_demands).length,
    [roleAllGrupos]
  );
  const highRiskCount = useMemo(
    () => roleAllGrupos.filter((g) => g.analytics && g.analytics.churn_risk >= 60).length,
    [roleAllGrupos]
  );
  usePendingAlert(pendingCount);
  useHighRiskAlert(highRiskCount);

  const stats = useMemo(() => {
    const total = roleAllGrupos.length;
    const totalMsgsHoje = roleAllGrupos.reduce((sum, g) => sum + (g.mensagens_hoje || 0), 0);
    const now24 = Date.now() - 24 * 60 * 60 * 1000;
    const comMsgs = roleAllGrupos.filter((g) => g.ultimo_horario && new Date(g.ultimo_horario).getTime() > now24).length;
    const highRisk = roleAllGrupos.filter((g) => g.analytics && g.analytics.churn_risk >= 60).length;
    const avgFrtAll = roleAllGrupos.filter((g) => g.analytics?.avg_frt_minutes != null);
    const avgFrt = avgFrtAll.length > 0
      ? Math.round(avgFrtAll.reduce((s, g) => s + (g.analytics!.avg_frt_minutes || 0), 0) / avgFrtAll.length)
      : null;
    const positiveSent = roleAllGrupos.filter((g) => g.analytics?.sentiment === "positivo").length;
    const slaViolations = roleAllGrupos.filter((g) => g.sla_violated).length;
    const priorityCount = roleAllGrupos.filter((g) => g.analytics?.priority_level === "maxima").length;
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const inativos = roleAllGrupos.filter((g) => {
      if (!g.ultimo_horario) return true;
      return now - new Date(g.ultimo_horario).getTime() > h24;
    }).length;
    const h48 = 48 * 60 * 60 * 1000;
    const dengue = roleAllGrupos.filter((g) => {
      if (!g.ultimo_horario) return true;
      return now - new Date(g.ultimo_horario).getTime() > h48;
    }).length;

    // Pending breakdown by priority/confidence
    let pendUrgentes = 0;
    let pendNormais = 0;
    let pendPossiveis = 0;
    for (const g of roleAllGrupos) {
      const details = g.analytics?.pending_demand_details || [];
      for (const d of details) {
        if (d.category === "possivel" || d.confidence === "media") {
          pendPossiveis++;
        } else if (d.priority === "urgente") {
          pendUrgentes++;
        } else {
          pendNormais++;
        }
      }
    }
    const pendencias = roleAllGrupos.filter((g) => g.analytics?.has_pending_demands).length;

    return { total, totalMsgsHoje, comMsgs, highRisk, avgFrt, positiveSent, pendencias, pendUrgentes, pendNormais, pendPossiveis, inativos, dengue, slaViolations, priorityCount };
  }, [roleAllGrupos]);

  // Filter groups by clicked metric
  const metricFilteredGrupos = useMemo(() => {
    // Hide groups with 0 messages by default
    let result = roleGrupos.filter(g => g.total_mensagens > 0);
    if (metricFilter) {
      switch (metricFilter) {
        case "total": result = roleGrupos; break;
        case "totalMsgs": result = roleGrupos.filter(g => g.total_mensagens > 0); break;
        case "ativos": result = roleGrupos.filter(g => g.ultimo_horario && Date.now() - new Date(g.ultimo_horario).getTime() < 24 * 60 * 60 * 1000); break;
        case "highRisk": result = roleGrupos.filter(g => g.analytics && g.analytics.churn_risk >= 60); break;
        case "pendencias": result = roleGrupos.filter(g => g.analytics?.has_pending_demands); break;
        case "frt": result = roleGrupos.filter(g => g.analytics?.avg_frt_minutes != null); break;
        case "positive": result = roleGrupos.filter(g => g.analytics?.sentiment === "positivo"); break;
        case "inativos": result = roleGrupos.filter(g => {
          if (!g.ultimo_horario) return true;
          return Date.now() - new Date(g.ultimo_horario).getTime() > 24 * 60 * 60 * 1000;
        }); break;
        case "dengue": result = roleGrupos.filter(g => {
          if (!g.ultimo_horario) return true;
          return Date.now() - new Date(g.ultimo_horario).getTime() > 48 * 60 * 60 * 1000;
        }); break;
        case "sla": result = roleGrupos.filter(g => g.sla_violated); break;
        case "priority": result = roleGrupos.filter(g => g.analytics?.priority_level === "maxima"); break;
        default: break;
      }
    }
    // Sort: Priority máxima first, then SLA violated, then rest
    return [...result].sort((a, b) => {
      const aPM = a.analytics?.priority_level === "maxima" ? 1 : 0;
      const bPM = b.analytics?.priority_level === "maxima" ? 1 : 0;
      if (aPM !== bPM) return bPM - aPM;
      if (a.sla_violated && !b.sla_violated) return -1;
      if (!a.sla_violated && b.sla_violated) return 1;
      if (a.sla_violated && b.sla_violated) return b.sla_delay_minutes - a.sla_delay_minutes;
      return 0;
    });
  }, [roleGrupos, metricFilter]);

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

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar isAdmin={isAdmin} onSignOut={signOut} />
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
            <div className="max-w-[1600px] mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="text-muted-foreground" />
                  <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
                  <div>
                    <h1 className="text-lg font-bold tracking-tight">Bem-vindo de volta, {profile?.full_name || "Usuário"}</h1>
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
                  <CoachPanel />
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6 w-full">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-11 gap-4">
          {[
            { key: "total", label: "Total Grupos", desc: "Todos os grupos cadastrados", value: stats.total, icon: Users, color: "text-primary" },
            { key: "totalMsgs", label: "Mensagens Hoje", desc: "Total de mensagens do dia", value: stats.totalMsgsHoje, icon: MessageSquare, color: "text-emerald-500" },
            { key: "ativos", label: "Grupos Ativos", desc: "Com atividade nas últimas 24h", value: stats.comMsgs, icon: Activity, color: "text-amber-500" },
            { key: "highRisk", label: "Risco Alto", desc: "Risco de churn ≥ 60%", value: stats.highRisk, icon: AlertTriangle, color: "text-red-500" },
            { key: "pendencias", label: "Pendências", desc: `${stats.pendUrgentes} urgentes / ${stats.pendNormais} normais / ${stats.pendPossiveis} possíveis`, value: stats.pendencias, icon: AlertCircle, color: "text-orange-500" },
            { key: "frt", label: "FRT Médio", desc: "Tempo médio de 1ª resposta", value: stats.avgFrt != null ? `${stats.avgFrt}min` : "—", icon: Timer, color: "text-blue-500" },
            { key: "positive", label: "Sentimento +", desc: "Grupos com sentimento positivo", value: stats.positiveSent, icon: TrendingUp, color: "text-emerald-500" },
            { key: "inativos", label: "Grupos Inativos", desc: "Sem atividade há mais de 24h", value: stats.inativos, icon: Moon, color: "text-zinc-400" },
            { key: "dengue", label: "Grupos da Dengue", desc: "Sem atividade há mais de 48h", value: stats.dengue, icon: Flame, color: "text-red-600" },
            { key: "sla", label: "SLA Violado", desc: "Equipe sem responder há +30min", value: stats.slaViolations, icon: AlertCircle, color: "text-red-500" },
            { key: "priority", label: "Prioridade Máxima", desc: "Clientes em estado crítico combinado", value: stats.priorityCount, icon: ShieldAlert, color: "text-red-600" },
          ].map(({ key, label, desc, value, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => {
                if (key === "pendencias") {
                  navigate("/pendencias");
                } else {
                  setMetricFilter(metricFilter === key ? null : key);
                }
              }}
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

        {/* Filters + Birthday Alerts */}
        <div className="flex items-center justify-between">
          <DashboardFilters
            categorias={categorias}
            activeFilter={categoriaFilter}
            onFilterChange={(f) => { setCategoriaFilter(f); setMetricFilter(null); }}
            onPriorityFilter={() => setMetricFilter(metricFilter === "priority" ? null : "priority")}
            isPriorityActive={metricFilter === "priority"}
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

        {/* Birthday Alerts for Admins */}
        {isAdmin && <BirthdayAlerts />}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {metricFilteredGrupos.map((g) => (
            <ClientCard key={g.id} grupo={g} onClick={setSelectedGrupo} npsPrediction={predictionsMap.get(g.group_id)} />
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
          npsPrediction={selectedGrupo ? predictionsMap.get(selectedGrupo.group_id) : undefined}
        />

        {tvMode && (
          <TVModeOverlay
            grupos={roleAllGrupos}
            onSelectGrupo={setSelectedGrupo}
            onClose={() => setTvMode(false)}
          />
        )}

        <AIChatPanel />
        </div>
      </div>
    </SidebarProvider>
  );
}
