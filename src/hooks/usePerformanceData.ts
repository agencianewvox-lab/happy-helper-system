import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GestorMetrics {
  name: string;
  clients: string[]; // group_ids
  npsAvg: number;
  npsEvolution: { date: string; score: number }[];
  npsRealAvg: number;
  npsRealCount: number;
  frtAvg: number;
  frtEvolution: { date: string; frt: number }[];
  tasksCompleted: number;
  tasksTotal: number;
  tasksEvolution: { date: string; completed: number; total: number }[];
  pendingResolved: number;
  pendingTotal: number;
  pendingEvolution: { date: string; resolved: number; total: number }[];
  sentimentAvg: number;
  sentimentEvolution: { date: string; score: number }[];
  inactiveGroups: number;
  totalGroups: number;
  // Scores 1-10
  scores: {
    nps: number;
    npsReal: number;
    frt: number;
    tasks: number;
    resolutions: number;
    sentiment: number;
    inactivity: number;
    overall: number;
  };
}

export interface GrupoInfo {
  group_id: string;
  nome: string;
  gestor_responsavel: string | null;
  estrelas_dificuldade: number | null;
  estrelas_financeiro: number | null;
  estrelas_temperamento: number | null;
  data_entrada: string | null;
  investimento_ads: number | null;
  plano: string | null;
}

function getDateRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "quarter") {
    start.setMonth(start.getMonth() - 3);
  }
  return { start, end };
}

export function usePerformanceData(period: string) {
  const [grupos, setGrupos] = useState<GrupoInfo[]>([]);
  const [npsHistory, setNpsHistory] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [pendingDemands, setPendingDemands] = useState<any[]>([]);
  const [npsPredictions, setNpsPredictions] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [npsSurveys, setNpsSurveys] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end } = useMemo(() => getDateRange(period), [period]);
  const startISO = start.toISOString();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gruposRes, npsHistRes, tasksRes, pendingRes, npsPredRes, npsSurveysRes, profilesRes] = await Promise.all([
        supabase.from("whatsapp_grupos").select("group_id, nome, gestor_responsavel, estrelas_dificuldade, estrelas_financeiro, estrelas_temperamento, data_entrada, investimento_ads, plano"),
        supabase.from("nps_prediction_history").select("*").gte("recorded_at", startISO).order("recorded_at"),
        supabase.from("tasks").select("*").gte("created_at", startISO),
        supabase.from("pending_demand_resolutions").select("*").gte("created_at", startISO),
        supabase.from("nps_predictions").select("*"),
        supabase.from("nps_surveys").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, full_name"),
      ]);

      if (gruposRes.data) setGrupos(gruposRes.data as GrupoInfo[]);
      if (npsHistRes.data) setNpsHistory(npsHistRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (pendingRes.data) setPendingDemands(pendingRes.data);
      if (npsPredRes.data) setNpsPredictions(npsPredRes.data);
      if (npsSurveysRes.data) setNpsSurveys(npsSurveysRes.data as any[]);
      if (profilesRes.data) setProfiles(profilesRes.data as any[]);
    } catch (err) {
      console.error("Performance data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [startISO]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const gestores = useMemo(() => {
    const set = new Set<string>();
    for (const g of grupos) {
      if (g.gestor_responsavel) set.add(g.gestor_responsavel);
    }
    return Array.from(set).sort();
  }, [grupos]);

  // Map user_id to gestor_responsavel name
  const PROFILE_TO_GESTOR: Record<string, string> = {
    "Murillo": "Murilo Araújo",
    "Netto": "Netto Monge",
    "Jader": "Jader Costa",
    "Priscilla": "Priscilla Borges",
    "Alisson": "Alisson Lima",
  };

  const userIdToGestorName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) {
      const gestorName = PROFILE_TO_GESTOR[p.full_name];
      if (gestorName) map[p.user_id] = gestorName;
    }
    return map;
  }, [profiles]);

  const gruposMap = useMemo(() => {
    const map: Record<string, GrupoInfo> = {};
    for (const g of grupos) map[g.group_id] = g;
    return map;
  }, [grupos]);

  // Compute per-gestor metrics
  const computeGestorMetrics = useCallback((gestorName: string | null): GestorMetrics => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;
    const clientIds = new Set(clientGrupos.map(g => g.group_id));
    const name = gestorName || "Geral";

    // NPS
    const clientNps = npsPredictions.filter(p => clientIds.has(p.group_id));
    const npsAvg = clientNps.length > 0
      ? Number((clientNps.reduce((s: number, p: any) => s + Number(p.nps_score), 0) / clientNps.length).toFixed(1))
      : 0;

    // NPS Evolution
    const npsHistFiltered = npsHistory.filter(h => clientIds.has(h.group_id));
    const npsDateMap = new Map<string, { sum: number; count: number }>();
    for (const h of npsHistFiltered) {
      const date = h.recorded_at.substring(0, 10);
      const entry = npsDateMap.get(date) || { sum: 0, count: 0 };
      entry.sum += Number(h.nps_score);
      entry.count++;
      npsDateMap.set(date, entry);
    }
    const npsEvolution = Array.from(npsDateMap.entries())
      .map(([date, d]) => ({ date, score: Number((d.sum / d.count).toFixed(1)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Tasks - only count as completed by this gestor if they actually completed it
    const clientTasks = tasks.filter(t => clientIds.has(t.group_id));
    const tasksCompleted = gestorName
      ? clientTasks.filter(t => {
          const isCompleted = t.status === "concluida" || t.status === "concluída" || t.status === "feito";
          if (!isCompleted) return false;
          // If completed_by is set, check if this gestor actually completed it
          if (t.completed_by) {
            const completedByGestor = userIdToGestorName[t.completed_by];
            return completedByGestor === gestorName;
          }
          // Legacy: no completed_by, attribute to assigned person
          return true;
        }).length
      : clientTasks.filter(t => t.status === "concluida" || t.status === "concluída" || t.status === "feito").length;
    const tasksTotal = clientTasks.length;

    // Tasks Evolution
    const taskDateMap = new Map<string, { completed: number; total: number }>();
    for (const t of clientTasks) {
      const date = t.created_at.substring(0, 10);
      const entry = taskDateMap.get(date) || { completed: 0, total: 0 };
      entry.total++;
      const isCompleted = t.status === "concluida" || t.status === "concluída" || t.status === "feito";
      if (isCompleted) {
        if (gestorName && t.completed_by) {
          const completedByGestor = userIdToGestorName[t.completed_by];
          if (completedByGestor === gestorName) entry.completed++;
        } else if (!gestorName || !t.completed_by) {
          entry.completed++;
        }
      }
      taskDateMap.set(date, entry);
    }
    const tasksEvolution = Array.from(taskDateMap.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Pending Demands - only count as resolved by this gestor if they actually resolved it
    const clientPending = pendingDemands.filter(p => clientIds.has(p.group_id));
    const pendingResolved = gestorName
      ? clientPending.filter(p => {
          if (!p.resolved) return false;
          if (p.resolved_by) {
            const resolvedByGestor = userIdToGestorName[p.resolved_by];
            return resolvedByGestor === gestorName;
          }
          // Legacy: no resolved_by, attribute to assigned gestor
          return true;
        }).length
      : clientPending.filter(p => p.resolved).length;
    const pendingTotal = clientPending.length;

    // Pending Evolution
    const pendDateMap = new Map<string, { resolved: number; total: number }>();
    for (const p of clientPending) {
      const date = p.created_at.substring(0, 10);
      const entry = pendDateMap.get(date) || { resolved: 0, total: 0 };
      entry.total++;
      if (p.resolved) entry.resolved++;
      pendDateMap.set(date, entry);
    }
    const pendingEvolution = Array.from(pendDateMap.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Sentiment (use current NPS predictions dimension_scores as proxy)
    const sentimentAvg = npsAvg; // simplified
    const sentimentEvolution = npsEvolution.map(e => ({ date: e.date, score: e.score }));

    // Inactivity: groups without recent messages (simplified - using grupos count)
    const totalGroups = clientGrupos.length;
    const inactiveGroups = 0; // would need conversation data

    // FRT placeholder
    const frtAvg = 0;
    const frtEvolution: { date: string; frt: number }[] = [];

    // NPS Real (from nps_surveys)
    const clientSurveys = npsSurveys.filter((s: any) => clientIds.has(s.group_id));
    const npsRealAvg = clientSurveys.length > 0
      ? Number((clientSurveys.reduce((s: number, sv: any) => s + sv.score, 0) / clientSurveys.length).toFixed(1))
      : 0;
    const npsRealCount = clientSurveys.length;

    // Balanced NPS Real score with complexity factor
    const avgComplexity = clientGrupos.length > 0
      ? clientGrupos.reduce((s, g) => s + ((g.estrelas_dificuldade || 1) + (g.estrelas_financeiro || 1) + (g.estrelas_temperamento || 1)) / 3, 0) / clientGrupos.length
      : 1;
    const complexityBonus = 1 - ((avgComplexity - 1) / 2) * 0.4;
    const rawNpsRealScore = npsRealCount > 0 ? Math.min(10, Math.max(1, Math.round(npsRealAvg))) : 5;
    const npsRealScore = Math.min(10, Math.max(1, Math.round(rawNpsRealScore / complexityBonus)));

    // Scores 1-10
    const npsScore = Math.min(10, Math.max(1, Math.round(npsAvg)));
    const frtScore = 5; // placeholder without FRT data
    const tasksScore = tasksTotal > 0 ? Math.min(10, Math.max(1, Math.round((tasksCompleted / tasksTotal) * 10))) : 5;
    const resolutionsScore = pendingTotal > 0 ? Math.min(10, Math.max(1, Math.round((pendingResolved / pendingTotal) * 10))) : 5;
    const sentimentScore = npsScore;
    const inactivityScore = totalGroups > 0 ? Math.min(10, Math.max(1, Math.round(((totalGroups - inactiveGroups) / totalGroups) * 10))) : 5;
    const overall = Number(((npsScore + npsRealScore + frtScore + tasksScore + resolutionsScore + sentimentScore + inactivityScore) / 7).toFixed(1));

    return {
      name,
      clients: Array.from(clientIds),
      npsAvg,
      npsEvolution,
      npsRealAvg,
      npsRealCount,
      frtAvg,
      frtEvolution,
      tasksCompleted,
      tasksTotal,
      tasksEvolution,
      pendingResolved,
      pendingTotal,
      pendingEvolution,
      sentimentAvg,
      sentimentEvolution,
      inactiveGroups,
      totalGroups,
      scores: { nps: npsScore, npsReal: npsRealScore, frt: frtScore, tasks: tasksScore, resolutions: resolutionsScore, sentiment: sentimentScore, inactivity: inactivityScore, overall },
    };
  }, [grupos, npsPredictions, npsHistory, tasks, pendingDemands, npsSurveys, userIdToGestorName]);

  // Per-client NPS data
  const getClientNpsData = useCallback((gestorName: string | null) => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;
    const clientIds = new Set(clientGrupos.map(g => g.group_id));

    return npsPredictions
      .filter(p => clientIds.has(p.group_id) && p.confianca >= 20)
      .map(p => ({
        group_id: p.group_id,
        name: gruposMap[p.group_id]?.nome?.replace(/\s*\(.*?\)/, '').substring(0, 20) || p.group_id.substring(0, 12),
        score: Number(Number(p.nps_score).toFixed(1)),
        categoria: p.nps_categoria,
      }))
      .sort((a: any, b: any) => b.score - a.score);
  }, [grupos, npsPredictions, gruposMap]);

  // Per-client tasks
  const getClientTasksData = useCallback((gestorName: string | null) => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;
    const clientIds = new Set(clientGrupos.map(g => g.group_id));

    const tasksByClient = new Map<string, { total: number; completed: number }>();
    for (const t of tasks) {
      if (!clientIds.has(t.group_id)) continue;
      const entry = tasksByClient.get(t.group_id) || { total: 0, completed: 0 };
      entry.total++;
      if (t.status === "concluida" || t.status === "concluída") entry.completed++;
      tasksByClient.set(t.group_id, entry);
    }

    return Array.from(tasksByClient.entries()).map(([gid, d]) => ({
      name: gruposMap[gid]?.nome?.replace(/\s*\(.*?\)/, '').substring(0, 20) || gid.substring(0, 12),
      completed: d.completed,
      total: d.total,
    })).sort((a, b) => b.completed - a.completed);
  }, [grupos, tasks, gruposMap]);

  // Per-client pending demands
  const getClientPendingData = useCallback((gestorName: string | null) => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;
    const clientIds = new Set(clientGrupos.map(g => g.group_id));

    const pendByClient = new Map<string, { total: number; resolved: number }>();
    for (const p of pendingDemands) {
      if (!clientIds.has(p.group_id)) continue;
      const entry = pendByClient.get(p.group_id) || { total: 0, resolved: 0 };
      entry.total++;
      if (p.resolved) entry.resolved++;
      pendByClient.set(p.group_id, entry);
    }

    return Array.from(pendByClient.entries()).map(([gid, d]) => ({
      name: gruposMap[gid]?.nome?.replace(/\s*\(.*?\)/, '').substring(0, 20) || gid.substring(0, 12),
      resolved: d.resolved,
      total: d.total,
    })).sort((a, b) => b.resolved - a.resolved);
  }, [grupos, pendingDemands, gruposMap]);

  // LTV calculation: months as active client
  const getClientLtvData = useCallback((gestorName: string | null) => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;

    const now = new Date();
    return clientGrupos
      .filter(g => g.data_entrada)
      .map(g => {
        const entrada = new Date(g.data_entrada!);
        const months = Math.max(1, Math.floor((now.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        return {
          group_id: g.group_id,
          name: gruposMap[g.group_id]?.nome?.replace(/\s*\(.*?\)/, '').substring(0, 20) || g.group_id.substring(0, 12),
          months,
        };
      })
      .sort((a, b) => b.months - a.months);
  }, [grupos, gruposMap]);

  // LTV evolution: number of active clients per month
  const getLtvEvolution = useCallback((gestorName: string | null) => {
    const clientGrupos = gestorName
      ? grupos.filter(g => g.gestor_responsavel === gestorName)
      : grupos;

    const now = new Date();
    const monthlyMap = new Map<string, number>();

    for (const g of clientGrupos) {
      if (!g.data_entrada) continue;
      const entrada = new Date(g.data_entrada);
      const totalMonths = Math.max(1, Math.floor((now.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      for (let m = 0; m < Math.min(totalMonths, 24); m++) {
        const date = new Date(entrada);
        date.setMonth(date.getMonth() + m);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
      }
    }

    const sorted = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative = 0;
    return sorted.map(([month, value]) => {
      cumulative += value;
      return { month, value: cumulative };
    });
  }, [grupos]);

  // LTV summary stats (months-based)
  const getLtvStats = useCallback((gestorName: string | null) => {
    const ltvData = getClientLtvData(gestorName);
    const totalMonths = ltvData.reduce((s, d) => s + d.months, 0);
    const avgMonths = ltvData.length > 0 ? totalMonths / ltvData.length : 0;
    return { totalMonths, avgMonths, clientCount: ltvData.length };
  }, [getClientLtvData]);

  // All gestors ranking
  const gestorRanking = useMemo(() => {
    return gestores.map(g => computeGestorMetrics(g)).sort((a, b) => b.scores.overall - a.scores.overall);
  }, [gestores, computeGestorMetrics]);

  return {
    loading,
    gestores,
    gruposMap,
    computeGestorMetrics,
    getClientNpsData,
    getClientTasksData,
    getClientPendingData,
    getClientLtvData,
    getLtvEvolution,
    getLtvStats,
    gestorRanking,
  };
}
