import { useState, useEffect, useCallback } from "react";
import { Grupo, GroupAnalytics } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";

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

      const { data: conversas, error: convsError } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, mensagem, created_at")
        .order("created_at", { ascending: false });

      if (convsError) throw convsError;

      const msgMap = new Map<string, { count: number; last_msg: string | null; last_time: string | null }>();
      for (const c of conversas || []) {
        if (!c.group_id) continue;
        const existing = msgMap.get(c.group_id);
        if (!existing) {
          msgMap.set(c.group_id, { count: 1, last_msg: c.mensagem, last_time: c.created_at });
        } else {
          existing.count++;
        }
      }

      const enriched: Grupo[] = (gruposData || []).map((g: any) => {
        const stats = msgMap.get(g.group_id);
        return {
          id: g.id,
          group_id: g.group_id,
          nome: g.nome,
          categoria: g.categoria,
          created_at: g.created_at,
          total_mensagens: stats?.count || 0,
          ultima_mensagem: stats?.last_msg || null,
          ultimo_horario: stats?.last_time || null,
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
