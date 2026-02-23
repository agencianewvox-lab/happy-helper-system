import { useState, useEffect, useCallback } from "react";
import { Grupo } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";

export function useClientData() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [categoriaFilter, setCategoriaFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch groups
      const { data: gruposData, error: gruposError } = await supabase
        .from("whatsapp_grupos")
        .select("*")
        .order("nome");

      if (gruposError) throw gruposError;

      // Fetch message counts per group
      const { data: conversas, error: convsError } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, mensagem, created_at")
        .order("created_at", { ascending: false });

      if (convsError) throw convsError;

      // Aggregate
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

    // Realtime subscription for new messages
    const channel = supabase
      .channel("conversas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversas" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const categorias = [...new Set(grupos.map((g) => g.categoria).filter(Boolean))] as string[];

  const filtered = categoriaFilter
    ? grupos.filter((g) => g.categoria === categoriaFilter)
    : grupos;

  return { grupos: filtered, allGrupos: grupos, categorias, loading, error, lastUpdate, categoriaFilter, setCategoriaFilter };
}
