import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Negative sentiment keywords
const COMPLAINT_KEYWORDS = [
  "de novo", "sempre", "não resolveu", "ninguém responde", "ninguem responde",
  "insatisfeito", "problema", "reclamação", "reclamacao", "absurdo",
  "péssimo", "pessimo", "horrível", "horrivel", "demora", "cadê", "cade",
  "não funciona", "nao funciona", "nunca", "pior", "falta de", "descaso",
  "cancelar", "cancela", "insatisfação", "decepcionado", "decepcionada",
];

// Positive engagement keywords
const POSITIVE_KEYWORDS = [
  "👍", "obrigado", "obrigada", "perfeito", "excelente", "ótimo", "otimo",
  "top", "parabéns", "parabens", "maravilhoso", "maravilhosa", "show",
  "muito bom", "adorei", "incrível", "incrivel", "sensacional", "ficou ótimo",
  "aprovado", "aprovada", "gostei", "amei", "mandou bem", "arrasou",
  "valeu", "gratidão", "gratidao", "satisfeito", "satisfeita",
];

// Neutral/negative demand keywords
const DEMAND_KEYWORDS = [
  "quando fica pronto", "prazo", "urgente", "urgência", "urgencia",
  "atrasado", "atraso", "cobra", "cobrando", "cadê", "cade",
  "quanto tempo", "demora", "esperando", "aguardando",
];

interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number; // -100 to 100
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number; // 0-100
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
}

function countKeywordMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const lower = text.toLowerCase();
  let count = 0;
  const matched: string[] = [];
  for (const kw of keywords) {
    const regex = new RegExp(kw.toLowerCase(), "gi");
    const matches = lower.match(regex);
    if (matches) {
      count += matches.length;
      if (!matched.includes(kw)) matched.push(kw);
    }
  }
  return { count, matched };
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

    // Fetch all conversations (paginated to avoid 1000 limit)
    let allConversas: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, direcao")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allConversas = allConversas.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // Group conversations by group_id
    const groupedConvs = new Map<string, any[]>();
    for (const c of allConversas) {
      if (!c.group_id) continue;
      if (!groupedConvs.has(c.group_id)) groupedConvs.set(c.group_id, []);
      groupedConvs.get(c.group_id)!.push(c);
    }

    const analytics: Record<string, GroupAnalytics> = {};

    for (const [groupId, msgs] of groupedConvs) {
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      // 1. FRT - Average First Response Time (business hours only: 08-18 BRT, UTC-3)
      // Calculates elapsed business-hours minutes between client msg and team response
      const BRT_OFFSET = -3; // Brasília UTC offset
      const BIZ_START = 8; // 08:00
      const BIZ_END = 18;  // 18:00
      const BIZ_MINUTES_PER_DAY = (BIZ_END - BIZ_START) * 60; // 600

      function toBrt(d: Date): Date {
        return new Date(d.getTime() + BRT_OFFSET * 60 * 60 * 1000);
      }

      function businessMinutesBetween(start: Date, end: Date): number {
        const s = toBrt(start);
        const e = toBrt(end);
        if (e <= s) return 0;

        let total = 0;
        const cur = new Date(s);

        // Cap start to biz hours
        const clampToBiz = (d: Date): Date => {
          const h = d.getHours() + d.getMinutes() / 60;
          if (h < BIZ_START) { d.setHours(BIZ_START, 0, 0, 0); }
          else if (h >= BIZ_END) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          // Skip weekends
          while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          return d;
        };

        const cStart = clampToBiz(new Date(cur));
        const cEnd = new Date(e);

        if (cStart >= cEnd) return 0;

        // Same day?
        const sameDay = cStart.toDateString() === cEnd.toDateString();
        if (sameDay) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          const startH = cStart.getHours() + cStart.getMinutes() / 60;
          return Math.max(0, Math.round((endH - startH) * 60));
        }

        // First partial day
        total += (BIZ_END - (cStart.getHours() + cStart.getMinutes() / 60)) * 60;

        // Full days in between
        const nextDay = new Date(cStart);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(BIZ_START, 0, 0, 0);
        while (nextDay.toDateString() !== cEnd.toDateString()) {
          if (nextDay.getDay() !== 0 && nextDay.getDay() !== 6) {
            total += BIZ_MINUTES_PER_DAY;
          }
          nextDay.setDate(nextDay.getDate() + 1);
          // Safety: max 30 days
          if (total > 30 * BIZ_MINUTES_PER_DAY) break;
        }

        // Last partial day
        if (cEnd.getDay() !== 0 && cEnd.getDay() !== 6) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          if (endH > BIZ_START) {
            total += (endH - BIZ_START) * 60;
          }
        }

        return Math.max(0, Math.round(total));
      }

      let totalFrt = 0;
      let frtCount = 0;
      let waitingForResponse = false;
      let clientMsgTime: Date | null = null;

      for (const msg of msgs) {
        if (msg.direcao === "entrada" && !waitingForResponse) {
          waitingForResponse = true;
          clientMsgTime = new Date(msg.created_at);
        } else if (msg.direcao === "saida" && waitingForResponse && clientMsgTime) {
          const responseTime = new Date(msg.created_at);
          const bizMinutes = businessMinutesBetween(clientMsgTime, responseTime);
          if (bizMinutes > 0 && bizMinutes < 30 * BIZ_MINUTES_PER_DAY) {
            totalFrt += bizMinutes;
            frtCount++;
          }
          waitingForResponse = false;
          clientMsgTime = null;
        }
      }

      const avgFrt = frtCount > 0 ? Math.round(totalFrt / frtCount) : null;

      // 2 & 3. Sentiment and complaint analysis
      const allClientText = clientMsgs.map((m: any) => m.mensagem || "").join(" ");
      const { count: complaintCount, matched: complaintTerms } = countKeywordMatches(allClientText, COMPLAINT_KEYWORDS);
      const { count: positiveCount } = countKeywordMatches(allClientText, POSITIVE_KEYWORDS);
      const { count: demandCount } = countKeywordMatches(allClientText, DEMAND_KEYWORDS);

      // Sentiment score: -100 to 100
      const totalSignals = positiveCount + complaintCount + demandCount || 1;
      const sentimentScore = Math.round(((positiveCount - complaintCount - demandCount * 0.5) / totalSignals) * 100);
      const sentiment: "positivo" | "neutro" | "negativo" =
        sentimentScore > 20 ? "positivo" : sentimentScore < -20 ? "negativo" : "neutro";

      // 4. Engagement type
      let engagementType: "saudável" | "cobrança" | "misto" | "inativo";
      if (clientMsgs.length === 0) {
        engagementType = "inativo";
      } else if (positiveCount > complaintCount + demandCount) {
        engagementType = "saudável";
      } else if (complaintCount + demandCount > positiveCount * 2) {
        engagementType = "cobrança";
      } else {
        engagementType = "misto";
      }

      // 5. Churn risk score (0-100)
      let churnRisk = 50; // base
      // Higher complaints = higher risk
      churnRisk += Math.min(complaintCount * 5, 25);
      // More demands = higher risk
      churnRisk += Math.min(demandCount * 3, 15);
      // Positive signals reduce risk
      churnRisk -= Math.min(positiveCount * 4, 30);
      // Slow FRT increases risk
      if (avgFrt !== null) {
        if (avgFrt > 480) churnRisk += 15; // >8h
        else if (avgFrt > 120) churnRisk += 8; // >2h
        else if (avgFrt < 30) churnRisk -= 10; // <30min
      }
      // No team responses = high risk
      if (teamMsgs.length === 0 && clientMsgs.length > 0) churnRisk += 20;
      // Inactivity (no recent msgs)
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        const daysSince = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 14) churnRisk += 15;
        else if (daysSince > 7) churnRisk += 8;
      }
      churnRisk = Math.max(0, Math.min(100, churnRisk));

      // 6. Pending demands - client sent demand keywords and last msg is from client (no team response yet)
      const lastMsgIsClient = msgs.length > 0 && msgs[msgs.length - 1].direcao === "entrada";
      const { matched: pendingDemandTerms } = countKeywordMatches(
        lastMsgIsClient ? (msgs[msgs.length - 1].mensagem || "") : "",
        DEMAND_KEYWORDS
      );
      // Also check last 3 client msgs for demand keywords without subsequent team response
      const lastClientMsgs = msgs.slice(-5).filter((m: any) => m.direcao === "entrada");
      const lastTeamMsg = [...msgs].reverse().find((m: any) => m.direcao === "saida");
      const lastTeamTime = lastTeamMsg ? new Date(lastTeamMsg.created_at).getTime() : 0;
      const unresolvedDemands: string[] = [];
      for (const cm of lastClientMsgs) {
        if (new Date(cm.created_at).getTime() > lastTeamTime) {
          const { matched } = countKeywordMatches(cm.mensagem || "", [...DEMAND_KEYWORDS, ...COMPLAINT_KEYWORDS]);
          unresolvedDemands.push(...matched);
        }
      }
      const uniquePendingTerms = [...new Set([...pendingDemandTerms, ...unresolvedDemands])].slice(0, 5);
      const hasPendingDemands = uniquePendingTerms.length > 0 || (lastMsgIsClient && demandCount > 0 && clientMsgs.length > teamMsgs.length);

      analytics[groupId] = {
        group_id: groupId,
        avg_frt_minutes: avgFrt,
        sentiment,
        sentiment_score: sentimentScore,
        complaint_count: complaintCount,
        complaint_terms: complaintTerms.slice(0, 5),
        positive_count: positiveCount,
        demand_count: demandCount,
        engagement_type: engagementType,
        churn_risk: Math.round(churnRisk),
        total_client_msgs: clientMsgs.length,
        total_team_msgs: teamMsgs.length,
        has_pending_demands: hasPendingDemands,
        pending_demand_terms: uniquePendingTerms,
      };
    }

    return new Response(JSON.stringify({ analytics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
