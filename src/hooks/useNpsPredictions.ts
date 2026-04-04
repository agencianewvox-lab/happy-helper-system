import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NpsPrediction } from "@/types/client";

export function useNpsPredictions() {
  const [predictions, setPredictions] = useState<NpsPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("nps_predictions").select("*");
      if (data) setPredictions(data as unknown as NpsPrediction[]);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel("nps-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "nps_predictions" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const predictionsMap = useMemo(() => {
    const map = new Map<string, NpsPrediction>();
    for (const p of predictions) map.set(p.group_id, p);
    return map;
  }, [predictions]);

  const stats = useMemo(() => {
    const promotores = predictions.filter(p => p.nps_categoria === "promotor").length;
    const neutros = predictions.filter(p => p.nps_categoria === "neutro").length;
    const detratores = predictions.filter(p => p.nps_categoria === "detrator").length;
    const total = predictions.length;
    const npsGlobal = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : 0;
    return { promotores, neutros, detratores, npsGlobal, total };
  }, [predictions]);

  return { predictions, predictionsMap, loading, ...stats };
}
