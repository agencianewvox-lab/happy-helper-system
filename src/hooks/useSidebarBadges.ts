import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isToday, parseISO } from "date-fns";

interface SidebarBadges {
  agenda: number;
  tarefas: number;
  pendencias: number;
}

export function useSidebarBadges() {
  const [badges, setBadges] = useState<SidebarBadges>({ agenda: 0, tarefas: 0, pendencias: 0 });

  const load = async () => {
    const today = new Date().toISOString().split("T")[0];

    const [eventsRes, tasksRes, pendingsRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("start_time")
        .gte("start_time", `${today}T00:00:00`)
        .lte("start_time", `${today}T23:59:59`),
      supabase
        .from("tasks")
        .select("id")
        .in("status", ["todo", "in_progress"]),
      supabase
        .from("pending_demand_resolutions")
        .select("id")
        .eq("resolved", false),
    ]);

    setBadges({
      agenda: eventsRes.data?.length || 0,
      tarefas: tasksRes.data?.length || 0,
      pendencias: pendingsRes.data?.length || 0,
    });
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_demand_resolutions" }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return badges;
}
