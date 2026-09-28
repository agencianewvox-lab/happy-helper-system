import { useState, useEffect, useCallback, useRef } from "react";
import { Grupo, GroupAnalytics } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";
import { calculateSlaStatus, getEffectiveMessageTime, requiresResponse } from "@/lib/clientMonitoring";
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
type GroupRow = Database["public"]["Tables"]["whatsapp_grupos"]["Row"];

function toGrupo(g: GroupRow, stats?: MessageStats, previous?: Grupo): Grupo {
  const waitingSince = stats ? stats.actionable_waiting_since : previous?.actionable_waiting_since ?? null;
  const slaStatus = calculateSlaStatus(waitingSince);
  return {
    id: g.id,
    group_id: g.group_id,
    nome: g.nome,
    categoria: g.categoria,
    created_at: g.created_at,
    total_mensagens: stats?.count ?? previous?.total_mensagens ?? 0,
    mensagens_hoje: stats?.todayCount ?? previous?.mensagens_hoje ?? 0,
    ultima_mensagem: stats ? stats.last_msg : previous?.ultima_mensagem ?? null,
    ultimo_horario: stats ? stats.last_time : previous?.ultimo_horario ?? null,
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
  const cached = globalCache?.ownerId === ownerId ? globalCache : null;
  const [grupos, setGrupos] = useState<Grupo[]>(cached?.grupos || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [categoriaFilter, setCategoriaFilter] = useState<string | null>(null);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, GroupAnalytics>>(cached?.analyticsMap || {});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(!cached);
  const [hasMessageStats, setHasMessageStats] = useState(!!cached);
  const lastAnalyticsFetch = useRef(0);
  const activeFetch = useRef<Promise<void> | null>(null);
  const queuedFetch = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyticsRefreshQueued = useRef(false);

  const fetchAnalytics = useCallback(async () => {
    if (Date.now() - lastAnalyticsFetch.current < ANALYTICS_TTL) return;
    lastAnalyticsFetch.current = Date.now();
    setAnalyticsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-analytics");
      if (error) throw error;
      if (data?.analytics) {
        setAnalyticsMap(data.analytics);
        if (globalCache?.ownerId === ownerId) globalCache.analyticsMap = data.analytics;
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [ownerId]);

  const fetchData = useCallback(async () => {
    if (activeFetch.current) {
      queuedFetch.current = true;
      return activeFetch.current;
    }
    const work = (async () => {
    setMessagesLoading(true);
    try {
      const pageSize = 1000;
      const columns = "group_id, mensagem, created_at, recebido_em, direcao";
      const groupsRequest = supabase
        .from("whatsapp_grupos")
        .select("*")
        .order("nome");
      const firstMessagesRequest = supabase
        .from("whatsapp_conversas")
        .select(columns, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, pageSize - 1);
      const { data: gruposData, error: gruposError } = await groupsRequest;

      if (gruposError) throw gruposError;

      // Render the client list immediately; message statistics arrive in the background.
      const previousById = new Map((globalCache?.ownerId === ownerId ? globalCache.grupos : []).map((grupo) => [grupo.id, grupo]));
      const rawGroups = gruposData || [];
      setGrupos(rawGroups.map((g) => {
        const previous = previousById.get(g.id);
        return toGrupo(g, undefined, previous?.group_id === g.group_id ? previous : undefined);
      }));
      setLoading(false);
      setError(null);

      // Request the remaining pages concurrently instead of making one round trip per 1,000 messages.
      const { data: firstPage, error: firstError, count } = await firstMessagesRequest;
      if (firstError) throw firstError;
      const allConversas = [...(firstPage || [])];
      if (count === null) {
        // Some gateways omit exact counts; retain full pagination in that case.
        let offset = pageSize;
        let lastPageSize = firstPage?.length ?? 0;
        while (lastPageSize === pageSize) {
          const page = await supabase.from("whatsapp_conversas").select(columns)
            .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
          if (page.error) throw page.error;
          lastPageSize = page.data?.length ?? 0;
          allConversas.push(...(page.data || []));
          offset += pageSize;
        }
      } else {
        for (let offset = pageSize; offset < count; offset += pageSize * 4) {
          const offsets = Array.from({ length: 4 }, (_, index) => offset + index * pageSize).filter((start) => start < count);
          const pages = await Promise.all(offsets.map((start) => supabase
            .from("whatsapp_conversas")
            .select(columns)
            .order("created_at", { ascending: false })
            .range(start, start + pageSize - 1)));
          for (const page of pages) {
            if (page.error) throw page.error;
            allConversas.push(...(page.data || []));
          }
        }
      }

      const groupedConversas = new Map<string, { mensagem: string | null; created_at: string; recebido_em: string; direcao: string | null }[]>();
      for (const conversa of allConversas) {
        if (!conversa.group_id) continue;
        if (!groupedConversas.has(conversa.group_id)) groupedConversas.set(conversa.group_id, []);
        groupedConversas.get(conversa.group_id)?.push(conversa);
      }

      const msgMap = new Map<string, MessageStats>();
      
      // Calculate start of today in local timezone
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartISO = todayStart.toISOString();

      for (const [groupId, conversas] of groupedConversas) {
        const ordered = [...conversas].sort((a, b) => getEffectiveMessageTime(a.created_at, a.recebido_em).localeCompare(getEffectiveMessageTime(b.created_at, b.recebido_em)));
        let latest: typeof ordered[number] | null = null;
        let lastClientTime: string | null = null;
        let todayCount = 0;
        let actionableWaitingSince: string | null = null;

        for (const conversa of ordered) {
          const msgTime = getEffectiveMessageTime(conversa.created_at, conversa.recebido_em);
          latest = conversa;
          if (msgTime >= todayStartISO) todayCount++;

          if (conversa.direcao === "entrada") {
            lastClientTime = msgTime;
            if (requiresResponse(conversa.mensagem)) {
              actionableWaitingSince = msgTime;
            }
          }

          if (conversa.direcao === "saida") {
            actionableWaitingSince = null;
          }
        }

        msgMap.set(groupId, {
          count: ordered.length,
          todayCount,
          last_msg: latest?.mensagem || null,
          last_time: latest ? getEffectiveMessageTime(latest.created_at, latest.recebido_em) : null,
          last_direcao: latest?.direcao || null,
          last_client_time: lastClientTime,
          actionable_waiting_since: actionableWaitingSince,
        });
      }

      const enriched: Grupo[] = rawGroups.map((g) => toGrupo(g, msgMap.get(g.group_id)));

      setGrupos(enriched);
      globalCache = { ownerId, analyticsMap: globalCache?.ownerId === ownerId ? globalCache.analyticsMap : {}, grupos: enriched, lastFetch: Date.now() };
      setHasMessageStats(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar os clientes.");
    } finally {
      setLoading(false);
      setMessagesLoading(false);
      setLastUpdate(new Date());
    }
    })();
    activeFetch.current = work;
    try {
      await work;
    } finally {
      activeFetch.current = null;
      if (queuedFetch.current) {
        queuedFetch.current = false;
        void fetchData();
      }
    }
  }, [ownerId]);

  useEffect(() => {
    // Skip initial fetch if cache is fresh
    const isCacheFresh = globalCache?.ownerId === ownerId && (Date.now() - globalCache.lastFetch) < CACHE_TTL;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversas" }, () => {
        scheduleRefresh(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_grupos" }, () => {
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_demand_resolutions" }, () => {
        fetchAnalytics();
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchData, fetchAnalytics, ownerId]);

  // Merge analytics into groups
  const gruposWithAnalytics = grupos.map((g) => ({
    ...g,
    analytics: analyticsMap[g.group_id] || undefined,
  }));

  const categorias = [...new Set(gruposWithAnalytics.map((g) => g.categoria).filter(Boolean))] as string[];

  const filtered = categoriaFilter
    ? gruposWithAnalytics.filter((g) => g.categoria === categoriaFilter)
    : gruposWithAnalytics;

  return {
    grupos: filtered,
    allGrupos: gruposWithAnalytics,
    categorias,
    loading,
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
