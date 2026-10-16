import { useState, useEffect, useCallback, useRef } from "react";
import { Grupo, GroupAnalytics } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";
import { calculateSlaStatus } from "@/lib/clientMonitoring";
import { clientWorkspace } from "@/lib/client-workspace";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

// Global cache to persist data across component remounts (tab switches)
let globalCache: {
  ownerId: string;
  grupos: Grupo[];
  analyticsMap: Record<string, GroupAnalytics>;
  lastFetch: number;
} | null = null;

const CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const ANALYTICS_TTL = 2 * 60 * 1000;

type MessageStats = {
  count: number;
  todayCount: number;
  last_msg: string | null;
  last_time: string | null;
  last_direcao: string | null;
  last_client_time: string | null;
  actionable_waiting_since: string | null;
};
type GroupRow = Database["public"]["Tables"]["whatsapp_grupos"]["Row"] & {
  manager_user_id?: string | null;
  archived_at?: string | null;
};

function toGrupo(g: GroupRow, stats?: MessageStats, previous?: Grupo): Grupo {
  const waitingSince = stats
    ? stats.actionable_waiting_since
    : (previous?.actionable_waiting_since ?? null);
  const slaStatus = calculateSlaStatus(waitingSince);
  return {
    id: g.id,
    group_id: g.group_id,
    nome: g.nome,
    plano: g.plano,
    manager_user_id: g.manager_user_id,
    categoria: g.categoria,
    created_at: g.created_at,
    total_mensagens: stats?.count ?? previous?.total_mensagens ?? 0,
    mensagens_hoje: stats?.todayCount ?? previous?.mensagens_hoje ?? 0,
    ultima_mensagem: stats
      ? stats.last_msg
      : (previous?.ultima_mensagem ?? null),
    ultimo_horario: stats
      ? stats.last_time
      : (previous?.ultimo_horario ?? null),
    actionable_waiting_since: waitingSince,
    sla_violated: slaStatus.violated,
    sla_delay_minutes: slaStatus.delayMinutes,
    investimento_ads: g.investimento_ads ?? null,
    investimento_google_ads: g.investimento_google_ads ?? null,
    plataforma_ads: g.plataforma_ads ?? null,
    data_ciclo_ads: g.data_ciclo_ads ?? null,
    gestor_responsavel: g.gestor_responsavel ?? null,
    estrelas_dificuldade: g.estrelas_dificuldade ?? null,
    estrelas_financeiro: g.estrelas_financeiro ?? null,
    estrelas_temperamento: g.estrelas_temperamento ?? null,
  };
}

export function useClientData() {
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const activeOwner = useRef(ownerId);
  activeOwner.current = ownerId;
  const [loadedOwner, setLoadedOwner] = useState(ownerId);
  const cached = globalCache?.ownerId === ownerId ? globalCache : null;
  const [grupos, setGrupos] = useState<Grupo[]>(cached?.grupos || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [categoriaFilter, setCategoriaFilter] = useState<string | null>(null);
  const [analyticsMap, setAnalyticsMap] = useState<
    Record<string, GroupAnalytics>
  >(cached?.analyticsMap || {});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(!cached);
  const [hasMessageStats, setHasMessageStats] = useState(!!cached);
  const lastAnalyticsFetch = useRef(0);
  const activeFetch = useRef<Promise<void> | null>(null);
  const queuedFetch = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyticsRefreshQueued = useRef(false);

  const fetchAnalytics = useCallback(async () => {
    if (!ownerId || activeOwner.current !== ownerId) return;
    if (Date.now() - lastAnalyticsFetch.current < ANALYTICS_TTL) return;
    lastAnalyticsFetch.current = Date.now();
    setAnalyticsLoading(true);
    try {
      const { data, error } =
        await supabase.functions.invoke("group-analytics");
      if (error) throw error;
      if (activeOwner.current === ownerId && data?.analytics) {
        setAnalyticsMap(data.analytics);
        if (globalCache?.ownerId === ownerId)
          globalCache.analyticsMap = data.analytics;
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      if (activeOwner.current === ownerId) setAnalyticsLoading(false);
    }
  }, [ownerId]);

  const fetchData = useCallback(async () => {
    if (!ownerId || activeOwner.current !== ownerId) return;
    if (activeFetch.current) {
      queuedFetch.current = true;
      return activeFetch.current;
    }
    const work = (async () => {
      setMessagesLoading(true);
      try {
        const groupsRequest = supabase
          .from("whatsapp_grupos")
          .select("*")
          .is("archived_at", null)
          .order("nome");
        const statsRequest =
          clientWorkspace<Record<string, MessageStats>>("stats");
        // Attach an immediate rejection handler while the client directory is loading.
        const statsOutcome = statsRequest.then(
          (data) => ({ data, error: null }),
          (error) => ({ data: null, error }),
        );
        const { data: gruposData, error: gruposError } = await groupsRequest;

        if (activeOwner.current !== ownerId) return;
        if (gruposError) throw gruposError;

        // Render the client list immediately; message statistics arrive in the background.
        const previousById = new Map(
          (globalCache?.ownerId === ownerId ? globalCache.grupos : []).map(
            (grupo) => [grupo.id, grupo],
          ),
        );
        const rawGroups = gruposData || [];
        setLoadedOwner(ownerId);
        setGrupos(
          rawGroups.map((g) => {
            const previous = previousById.get(g.id);
            return toGrupo(
              g,
              undefined,
              previous?.group_id === g.group_id ? previous : undefined,
            );
          }),
        );
        setLoading(false);
        setError(null);

        const stats = await statsOutcome;
        if (activeOwner.current !== ownerId) return;
        if (stats.error || !stats.data)
          throw stats.error || new Error("Indicadores indisponíveis.");
        const msgMap = new Map<string, MessageStats>(
          Object.entries(stats.data as Record<string, MessageStats>),
        );

        const enriched: Grupo[] = rawGroups.map((g) =>
          toGrupo(g, msgMap.get(g.group_id)),
        );

        setGrupos(enriched);
        globalCache = {
          ownerId,
          analyticsMap:
            globalCache?.ownerId === ownerId ? globalCache.analyticsMap : {},
          grupos: enriched,
          lastFetch: Date.now(),
        };
        setHasMessageStats(true);
        setError(null);
      } catch (err) {
        if (activeOwner.current === ownerId)
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao atualizar os clientes.",
          );
      } finally {
        if (activeOwner.current === ownerId) {
          setLoading(false);
          setMessagesLoading(false);
          setLastUpdate(new Date());
        }
      }
    })();
    activeFetch.current = work;
    try {
      await work;
    } finally {
      if (activeFetch.current === work) activeFetch.current = null;
      if (activeOwner.current === ownerId && queuedFetch.current) {
        queuedFetch.current = false;
        void fetchData();
      }
    }
  }, [ownerId]);

  useEffect(() => {
    activeFetch.current = null;
    queuedFetch.current = false;
    lastAnalyticsFetch.current = 0;
    setAnalyticsMap(
      globalCache?.ownerId === ownerId ? globalCache.analyticsMap : {},
    );
    setHasMessageStats(globalCache?.ownerId === ownerId);
    setCategoriaFilter(null);
    // Skip initial fetch if cache is fresh
    const isCacheFresh =
      globalCache?.ownerId === ownerId &&
      Date.now() - globalCache.lastFetch < CACHE_TTL;
    if (!isCacheFresh) {
      void fetchData().then(() => fetchAnalytics());
    }

    const scheduleRefresh = (refreshAnalytics = false) => {
      analyticsRefreshQueued.current ||= refreshAnalytics;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        void fetchData();
        if (analyticsRefreshQueued.current) void fetchAnalytics();
        analyticsRefreshQueued.current = false;
      }, 750);
    };

    const channel = supabase
      .channel("conversas-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversas" },
        () => {
          scheduleRefresh(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_grupos" },
        () => {
          scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_demand_resolutions" },
        () => {
          fetchAnalytics();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchData, fetchAnalytics, ownerId]);

  // Merge analytics into groups
  const gruposWithAnalytics = (loadedOwner === ownerId ? grupos : []).map(
    (g) => ({
      ...g,
      analytics: analyticsMap[g.group_id] || undefined,
    }),
  );

  const categorias = [
    ...new Set(gruposWithAnalytics.map((g) => g.categoria).filter(Boolean)),
  ] as string[];

  const filtered = categoriaFilter
    ? gruposWithAnalytics.filter((g) => g.categoria === categoriaFilter)
    : gruposWithAnalytics;

  return {
    grupos: filtered,
    allGrupos: gruposWithAnalytics,
    categorias,
    loading: loadedOwner !== ownerId || loading,
    error,
    lastUpdate,
    categoriaFilter,
    setCategoriaFilter,
    analyticsLoading,
    messagesLoading,
    hasMessageStats,
    refreshAnalytics: fetchAnalytics,
  };
}
