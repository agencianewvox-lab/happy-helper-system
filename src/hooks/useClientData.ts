import { useState, useEffect, useCallback } from "react";
import { Grupo, GroupAnalytics } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";
import { businessMinutesSince, getEffectiveMessageTime, requiresResponse } from "@/lib/clientMonitoring";

export function useClientData() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [categoriaFilter, setCategoriaFilter] = useState<string | null>(null);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, GroupAnalytics>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-analytics");
      if (error) throw error;
      if (data?.analytics) {
        setAnalyticsMap(data.analytics);
      }
    } catch (err: any) {
      console.error("Analytics fetch error:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const { data: gruposData, error: gruposError } = await supabase
        .from("whatsapp_grupos")
        .select("*")
        .order("nome");

      if (gruposError) throw gruposError;

      // Paginate to fetch ALL conversations (Supabase default limit is 1000)
      let allConversas: { group_id: string | null; mensagem: string | null; created_at: string; recebido_em: string; direcao: string | null }[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page, error: convsError } = await supabase
          .from("whatsapp_conversas")
          .select("group_id, mensagem, created_at, recebido_em, direcao")
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (convsError) throw convsError;
        if (!page || page.length === 0) break;
        allConversas = allConversas.concat(page as typeof allConversas);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      const groupedConversas = new Map<string, { mensagem: string | null; created_at: string; recebido_em: string; direcao: string | null }[]>();
      for (const conversa of allConversas) {
        if (!conversa.group_id) continue;
        if (!groupedConversas.has(conversa.group_id)) groupedConversas.set(conversa.group_id, []);
        groupedConversas.get(conversa.group_id)?.push(conversa);
      }

      const msgMap = new Map<string, { count: number; todayCount: number; last_msg: string | null; last_time: string | null; last_direcao: string | null; last_client_time: string | null; actionable_waiting_since: string | null }>();
      
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

      const enriched: Grupo[] = (gruposData || []).map((g: any) => {
        const stats = msgMap.get(g.group_id);
        // SLA: last msg is from client and 30+ biz minutes without team response
        let sla_violated = false;
        let sla_delay_minutes = 0;
        if (stats?.actionable_waiting_since) {
          const elapsed = businessMinutesSince(stats.actionable_waiting_since);
          if (elapsed >= 30) {
            sla_violated = true;
            sla_delay_minutes = elapsed - 30;
          }
        }
        return {
          id: g.id,
          group_id: g.group_id,
          nome: g.nome,
          categoria: g.categoria,
          created_at: g.created_at,
          total_mensagens: stats?.count || 0,
          mensagens_hoje: stats?.todayCount || 0,
          ultima_mensagem: stats?.last_msg || null,
          ultimo_horario: stats?.last_time || null,
          sla_violated,
          sla_delay_minutes,
          investimento_ads: g.investimento_ads ?? null,
          investimento_google_ads: g.investimento_google_ads ?? null,
          plataforma_ads: g.plataforma_ads ?? null,
          data_ciclo_ads: g.data_ciclo_ads ?? null,
          gestor_responsavel: g.gestor_responsavel ?? null,
          estrelas_dificuldade: g.estrelas_dificuldade ?? null,
          estrelas_financeiro: g.estrelas_financeiro ?? null,
          estrelas_temperamento: g.estrelas_temperamento ?? null,
        };
      });

      setGrupos(enriched);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchAnalytics();

    const channel = supabase
      .channel("conversas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversas" }, () => {
        fetchData();
        fetchAnalytics();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_grupos" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_demand_resolutions" }, () => {
        fetchAnalytics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, fetchAnalytics]);

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
    refreshAnalytics: fetchAnalytics,
  };
}
