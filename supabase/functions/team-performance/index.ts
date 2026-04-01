import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEAM_MEMBERS: { name: string; phone: string; role: string }[] = [
  { name: "Priscila Borges", phone: "64992946041", role: "Sócia proprietária" },
  { name: "Thais", phone: "6496601341", role: "Social Media" },
  { name: "Murilo Araújo", phone: "9299894316", role: "Gestor de Tráfego / Gerente" },
  { name: "Netto Monge", phone: "14991797829", role: "Gestor de Tráfego" },
  { name: "Jader Costa", phone: "6984470232", role: "Gestor de Tráfego" },
  { name: "Alisson Lima", phone: "6492565779", role: "Sócio proprietário" },
  { name: "Jiza Reis", phone: "4891871846", role: "Financeiro" },
  { name: "Victor Botto", phone: "6492286733", role: "Design gráfico" },
];

const TEAM_NAME_KEYWORDS = TEAM_MEMBERS.map((m) => m.name.toLowerCase().split(" ")[0]);

function matchTeamMember(contactName: string | null): string | null {
  if (!contactName) return null;
  const lower = contactName.toLowerCase();
  for (let i = 0; i < TEAM_NAME_KEYWORDS.length; i++) {
    if (lower.includes(TEAM_NAME_KEYWORDS[i])) {
      return TEAM_MEMBERS[i].name;
    }
  }
  return null;
}

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const BRT_OFFSET = -3;
  const brtNow = new Date(now.getTime() + BRT_OFFSET * 3600000);

  let start: Date;
  const end = now;

  switch (period) {
    case "today": {
      start = new Date(brtNow);
      start.setHours(0, 0, 0, 0);
      start = new Date(start.getTime() - BRT_OFFSET * 3600000);
      break;
    }
    case "week": {
      start = new Date(brtNow);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      start = new Date(start.getTime() - BRT_OFFSET * 3600000);
      break;
    }
    case "month": {
      start = new Date(brtNow);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      start = new Date(start.getTime() - BRT_OFFSET * 3600000);
      break;
    }
    default: {
      start = new Date(brtNow);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      start = new Date(start.getTime() - BRT_OFFSET * 3600000);
    }
  }

  return { start, end };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "week";
    const { start, end } = getDateRange(period);

    // Fetch all conversations in period (paginated)
    let allConversas: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, direcao, telefone")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allConversas = allConversas.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // Fetch resolutions in period
    const { data: resolutions, error: resError } = await supabase
      .from("pending_demand_resolutions")
      .select("resolved_by, resolved, resolved_at")
      .eq("resolved", true)
      .gte("resolved_at", start.toISOString());
    if (resError) throw resError;

    // Per-collaborator metrics
    interface CollabStats {
      name: string;
      role: string;
      total_responses: number;
      frt_total: number;
      frt_count: number;
      resolutions: number;
      daily_volumes: Record<string, number>;
    }

    const collabMap = new Map<string, CollabStats>();
    for (const m of TEAM_MEMBERS) {
      collabMap.set(m.name, {
        name: m.name,
        role: m.role,
        total_responses: 0,
        frt_total: 0,
        frt_count: 0,
        resolutions: 0,
        daily_volumes: {},
      });
    }

    // Group conversations by group_id for FRT calculation
    const groupedConvs = new Map<string, any[]>();
    for (const c of allConversas) {
      if (!c.group_id) continue;
      if (!groupedConvs.has(c.group_id)) groupedConvs.set(c.group_id, []);
      groupedConvs.get(c.group_id)!.push(c);
    }

    // Count responses per collaborator & compute FRT
    const BRT_OFFSET = -3;
    const BIZ_START = 8;
    const BIZ_END = 18;

    function toBrt(d: Date): Date {
      return new Date(d.getTime() + BRT_OFFSET * 60 * 60 * 1000);
    }

    function businessMinutesBetween(startD: Date, endD: Date): number {
      const s = toBrt(startD);
      const e = toBrt(endD);
      if (e <= s) return 0;

      const clampToBiz = (d: Date): Date => {
        const h = d.getHours() + d.getMinutes() / 60;
        if (h < BIZ_START) d.setHours(BIZ_START, 0, 0, 0);
        else if (h >= BIZ_END) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
        while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
        return d;
      };

      const cStart = clampToBiz(new Date(s));
      const cEnd = new Date(e);
      if (cStart >= cEnd) return 0;

      if (cStart.toDateString() === cEnd.toDateString()) {
        const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
        const startH = cStart.getHours() + cStart.getMinutes() / 60;
        return Math.max(0, Math.round((endH - startH) * 60));
      }

      let total = (BIZ_END - (cStart.getHours() + cStart.getMinutes() / 60)) * 60;
      const nextDay = new Date(cStart);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(BIZ_START, 0, 0, 0);

      while (nextDay.toDateString() !== cEnd.toDateString()) {
        if (nextDay.getDay() !== 0 && nextDay.getDay() !== 6) {
          total += (BIZ_END - BIZ_START) * 60;
        }
        nextDay.setDate(nextDay.getDate() + 1);
        if (total > 30 * 600) break;
      }

      if (cEnd.getDay() !== 0 && cEnd.getDay() !== 6) {
        const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
        if (endH > BIZ_START) total += (endH - BIZ_START) * 60;
      }

      return Math.max(0, Math.round(total));
    }

    // Process each group for FRT per collaborator
    for (const [, msgs] of groupedConvs) {
      let waitingForResponse = false;
      let clientMsgTime: Date | null = null;

      for (const msg of msgs) {
        if (msg.direcao === "entrada" && !waitingForResponse) {
          waitingForResponse = true;
          clientMsgTime = new Date(msg.created_at);
        } else if (msg.direcao === "saida" && waitingForResponse && clientMsgTime) {
          const member = matchTeamMember(msg.nome_contato);
          if (member && collabMap.has(member)) {
            const bizMin = businessMinutesBetween(clientMsgTime, new Date(msg.created_at));
            if (bizMin > 0 && bizMin < 18000) {
              const stats = collabMap.get(member)!;
              stats.frt_total += bizMin;
              stats.frt_count++;
            }
          }
          waitingForResponse = false;
          clientMsgTime = null;
        }
      }
    }

    // Count total responses per collaborator + daily volumes
    for (const c of allConversas) {
      if (c.direcao !== "saida") continue;
      const member = matchTeamMember(c.nome_contato);
      if (member && collabMap.has(member)) {
        const stats = collabMap.get(member)!;
        stats.total_responses++;
        const day = new Date(c.created_at).toISOString().slice(0, 10);
        stats.daily_volumes[day] = (stats.daily_volumes[day] || 0) + 1;
      }
    }

    // Count resolutions (note: resolved_by is uuid, we can't match directly,
    // so we count all resolutions and distribute — or just show total)
    // For now, show total resolutions count
    const totalResolutions = (resolutions || []).length;

    // Build daily volume chart data (entrada vs saida)
    const dailyMap = new Map<string, { entrada: number; saida: number }>();
    for (const c of allConversas) {
      const day = new Date(c.created_at).toISOString().slice(0, 10);
      if (!dailyMap.has(day)) dailyMap.set(day, { entrada: 0, saida: 0 });
      const d = dailyMap.get(day)!;
      if (c.direcao === "entrada") d.entrada++;
      else if (c.direcao === "saida") d.saida++;
    }

    const dailyVolumes = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, entrada: v.entrada, saida: v.saida, total: v.entrada + v.saida }));

    // Build sentiment evolution (simple: count positive/negative keywords per day)
    // We'll compute a simple daily sentiment score
    const POSITIVE_KW = ["perfeito", "excelente", "ótimo", "otimo", "top", "parabéns", "parabens", "show", "muito bom", "adorei", "aprovado", "gostei", "amei"];
    const NEGATIVE_KW = ["problema", "reclamação", "reclamacao", "demora", "insatisfeito", "insatisfeita", "cancelar", "péssimo", "pessimo", "horrível", "horrivel"];

    const sentimentDaily = new Map<string, { pos: number; neg: number }>();
    for (const c of allConversas) {
      if (c.direcao !== "entrada") continue;
      const day = new Date(c.created_at).toISOString().slice(0, 10);
      if (!sentimentDaily.has(day)) sentimentDaily.set(day, { pos: 0, neg: 0 });
      const s = sentimentDaily.get(day)!;
      const text = (c.mensagem || "").toLowerCase();
      for (const kw of POSITIVE_KW) {
        if (text.includes(kw)) s.pos++;
      }
      for (const kw of NEGATIVE_KW) {
        if (text.includes(kw)) s.neg++;
      }
    }

    const sentimentEvolution = Array.from(sentimentDaily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => {
        const total = s.pos + s.neg || 1;
        return { date, score: Math.round(((s.pos - s.neg) / total) * 100) };
      });

    // Build collaborator results
    const collaborators = Array.from(collabMap.values()).map((s) => ({
      name: s.name,
      role: s.role,
      total_responses: s.total_responses,
      avg_frt_minutes: s.frt_count > 0 ? Math.round(s.frt_total / s.frt_count) : null,
      resolutions: s.resolutions,
      daily_volumes: s.daily_volumes,
    }));

    // Sort by total_responses descending for ranking
    collaborators.sort((a, b) => b.total_responses - a.total_responses);

    // Global stats
    const totalEntrada = allConversas.filter((c) => c.direcao === "entrada").length;
    const totalSaida = allConversas.filter((c) => c.direcao === "saida").length;
    const avgFrtAll = collaborators.filter((c) => c.avg_frt_minutes != null);
    const globalAvgFrt = avgFrtAll.length > 0
      ? Math.round(avgFrtAll.reduce((s, c) => s + (c.avg_frt_minutes || 0), 0) / avgFrtAll.length)
      : null;

    return new Response(
      JSON.stringify({
        period,
        global: {
          total_entrada: totalEntrada,
          total_saida: totalSaida,
          avg_frt_minutes: globalAvgFrt,
          total_resolutions: totalResolutions,
          total_conversations: allConversas.length,
        },
        collaborators,
        daily_volumes: dailyVolumes,
        sentiment_evolution: sentimentEvolution,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Team performance error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
