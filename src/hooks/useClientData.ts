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

      const msgMap = new Map<string, { count: number; todayCount: number; last_msg: string | null; last_time: string | null; last_direcao: string | null; last_client_time: string | null }>();
      
      // Calculate start of today in local timezone
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartISO = todayStart.toISOString();

      for (const c of allConversas) {
        if (!c.group_id) continue;
        const msgTime = c.recebido_em && c.recebido_em > c.created_at ? c.recebido_em : c.created_at;
        const isToday = msgTime >= todayStartISO;
        const existing = msgMap.get(c.group_id);
        if (!existing) {
          msgMap.set(c.group_id, {
            count: 1,
            todayCount: isToday ? 1 : 0,
            last_msg: c.mensagem,
            last_time: msgTime,
            last_direcao: c.direcao,
            last_client_time: c.direcao === "entrada" ? msgTime : null,
          });
        } else {
          existing.count++;
          if (isToday) existing.todayCount++;
          if (existing.last_time && msgTime > existing.last_time) {
            existing.last_time = msgTime;
            existing.last_msg = c.mensagem;
            existing.last_direcao = c.direcao;
          } else if (!existing.last_time) {
            existing.last_time = msgTime;
            existing.last_msg = c.mensagem;
            existing.last_direcao = c.direcao;
          }
          // Track latest client message time
          if (c.direcao === "entrada") {
            if (!existing.last_client_time || msgTime > existing.last_client_time) {
              existing.last_client_time = msgTime;
            }
          }
        }
      }

      // SLA helper: compute business minutes since a timestamp (BRT 08-18, Mon-Fri)
      function bizMinutesSince(isoTime: string): number {
        const BRT_OFFSET = -3;
        const BIZ_START = 8;
        const BIZ_END = 18;
        const start = new Date(new Date(isoTime).getTime() + BRT_OFFSET * 3600000);
        const now = new Date(Date.now() + BRT_OFFSET * 3600000);
        if (now <= start) return 0;

        let total = 0;
        const clamp = (d: Date) => {
          const h = d.getHours() + d.getMinutes() / 60;
          if (h < BIZ_START) d.setHours(BIZ_START, 0, 0, 0);
          else if (h >= BIZ_END) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          return d;
        };

        const s = clamp(new Date(start));
        if (s >= now) return 0;

        if (s.toDateString() === now.toDateString()) {
          const endH = Math.min(now.getHours() + now.getMinutes() / 60, BIZ_END);
          return Math.max(0, Math.round((endH - (s.getHours() + s.getMinutes() / 60)) * 60));
        }

        total += (BIZ_END - (s.getHours() + s.getMinutes() / 60)) * 60;
        const cur = new Date(s);
        cur.setDate(cur.getDate() + 1);
        cur.setHours(BIZ_START, 0, 0, 0);
        while (cur.toDateString() !== now.toDateString()) {
          if (cur.getDay() !== 0 && cur.getDay() !== 6) total += (BIZ_END - BIZ_START) * 60;
          cur.setDate(cur.getDate() + 1);
          if (total > 30 * 600) break;
        }
        if (now.getDay() !== 0 && now.getDay() !== 6) {
          const endH = Math.min(now.getHours() + now.getMinutes() / 60, BIZ_END);
          if (endH > BIZ_START) total += (endH - BIZ_START) * 60;
        }
        return Math.max(0, Math.round(total));
      }

      const enriched: Grupo[] = (gruposData || []).map((g: any) => {
        const stats = msgMap.get(g.group_id);
        // SLA: last msg is from client and 30+ biz minutes without team response
        let sla_violated = false;
        let sla_delay_minutes = 0;
        if (stats?.last_direcao === "entrada" && stats.last_time) {
          const elapsed = bizMinutesSince(stats.last_time);
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
