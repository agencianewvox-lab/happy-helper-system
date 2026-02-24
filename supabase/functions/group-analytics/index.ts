import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Client dissatisfaction keywords - signals unhappiness with results/partnership
const DISSATISFACTION_KEYWORDS = [
  // Results dissatisfaction
  "não chegou lead", "nao chegou lead", "sem lead", "zero lead", "nenhum lead",
  "não estou vendo resultado", "nao estou vendo resultado", "sem resultado",
  "não tá funcionando", "nao ta funcionando", "não está funcionando", "nao esta funcionando",
  "não funciona", "nao funciona", "não deu resultado", "nao deu resultado",
  "resultado ruim", "resultado péssimo", "resultado pessimo", "sem retorno",
  // Partnership discomfort
  "isso não pode acontecer", "isso nao pode acontecer", "inaceitável", "inaceitavel",
  "não pode continuar assim", "nao pode continuar assim",
  "vou cancelar", "quero cancelar", "cancelar contrato", "rescindir",
  "trocar de agência", "trocar de agencia", "outra agência", "outra agencia",
  "insatisfeito", "insatisfeita", "insatisfação", "insatisfacao",
  "decepcionado", "decepcionada", "decepção", "decepcao",
  "péssimo", "pessimo", "horrível", "horrivel", "absurdo",
  "descaso", "falta de compromisso", "falta de comprometimento",
  "estou pagando", "pago caro", "jogando dinheiro fora",
  "não recomendo", "nao recomendo", "arrependido", "arrependida",
  "pior", "piorou", "caiu", "despencou",
  "não vale a pena", "nao vale a pena", "perda de tempo",
  "vocês não entregam", "voces nao entregam", "não entrega", "nao entrega",
  "prometeram", "prometeu", "foi prometido",
  "cadê os resultados", "cade os resultados",
  "ninguém resolve", "ninguem resolve", "não resolveu", "nao resolveu",
  "sempre a mesma coisa", "de novo isso", "de novo",
  "nunca funciona", "nunca dá certo", "nunca da certo",
];

// General negative sentiment keywords (lighter weight)
const COMPLAINT_KEYWORDS = [
  "problema", "reclamação", "reclamacao", "demora",
  "falta de", "cobrando", "cobra",
];

// Positive engagement keywords
const POSITIVE_KEYWORDS = [
  "👍", "perfeito", "excelente", "ótimo", "otimo",
  "top", "parabéns", "parabens", "maravilhoso", "maravilhosa", "show",
  "muito bom", "adorei", "incrível", "incrivel", "sensacional", "ficou ótimo",
  "aprovado", "aprovada", "gostei", "amei", "mandou bem", "arrasou",
  "satisfeito", "satisfeita",
];

// Solicitation/request keywords - actionable demands from clients
const SOLICITATION_KEYWORDS = [
  "criativo", "criativos", "arte", "artes", "banner", "post", "feed",
  "verba", "orçamento", "orcamento", "campanha", "anúncio", "anuncio",
  "alterar", "mudar", "trocar", "atualizar", "ajustar", "modificar",
  "preciso", "precisamos", "solicito", "solicitar", "pedido", "enviar",
  "fazer", "pode fazer", "consegue", "quando fica pronto", "prazo",
  "urgente", "urgência", "urgencia", "aprovação", "aprovacao",
  "relatório", "relatorio", "planilha", "proposta", "briefing",
  "logo", "logotipo", "vídeo", "video", "stories", "reels",
  "landing page", "site", "página", "pagina", "link",
  "subir campanha", "pausar campanha", "ativar", "desativar",
  "me envia", "me manda", "pode enviar", "pode mandar",
];

// General demand keywords (waiting/follow-up)
const DEMAND_KEYWORDS = [
  "cadê", "cade", "esperando", "aguardando", "cobrando",
  "quanto tempo", "demora", "atrasado", "atraso",
];

// Solution suggestions based on detected pending demand terms
const SOLUTION_MAP: Record<string, string> = {
  // Criativo / Arte
  "criativo": "Equipe criar e enviar o criativo para o cliente",
  "criativos": "Equipe criar e enviar os criativos para o cliente",
  "arte": "Equipe produzir e enviar a arte solicitada",
  "artes": "Equipe produzir e enviar as artes solicitadas",
  "banner": "Equipe criar e enviar o banner para o cliente",
  "post": "Equipe criar e enviar o post para aprovação",
  "feed": "Equipe preparar o conteúdo do feed e enviar",
  "stories": "Equipe criar os stories e enviar para aprovação",
  "reels": "Equipe produzir o reels e enviar para o cliente",
  // Verba / Orçamento
  "verba": "Equipe enviar a recarga/verba para o cliente",
  "orçamento": "Equipe enviar o orçamento solicitado",
  "orcamento": "Equipe enviar o orçamento solicitado",
  // Campanha
  "campanha": "Equipe configurar/ajustar a campanha conforme solicitado",
  "anúncio": "Equipe criar/ajustar o anúncio solicitado",
  "anuncio": "Equipe criar/ajustar o anúncio solicitado",
  "subir campanha": "Equipe subir a campanha no gerenciador",
  "pausar campanha": "Equipe pausar a campanha conforme pedido",
  "ativar": "Equipe ativar o item conforme solicitado",
  "desativar": "Equipe desativar conforme pedido do cliente",
  // Alterações
  "alterar": "Equipe realizar a alteração solicitada pelo cliente",
  "mudar": "Equipe realizar a mudança pedida",
  "trocar": "Equipe fazer a troca solicitada",
  "atualizar": "Equipe atualizar conforme pedido do cliente",
  "ajustar": "Equipe ajustar conforme solicitação",
  "modificar": "Equipe modificar conforme pedido",
  // Envios / Solicitações
  "preciso": "Equipe atender à necessidade do cliente",
  "precisamos": "Equipe atender à necessidade do cliente",
  "solicito": "Equipe atender à solicitação do cliente",
  "solicitar": "Equipe processar a solicitação",
  "pedido": "Equipe atender ao pedido do cliente",
  "enviar": "Equipe enviar o material solicitado",
  "me envia": "Equipe enviar o que foi pedido ao cliente",
  "me manda": "Equipe enviar o material para o cliente",
  "pode enviar": "Equipe enviar o que foi solicitado",
  "pode mandar": "Equipe enviar o que foi solicitado",
  // Urgência / Prazo
  "urgente": "Equipe priorizar e resolver com urgência",
  "urgência": "Equipe priorizar e resolver com urgência",
  "urgencia": "Equipe priorizar e resolver com urgência",
  "quando fica pronto": "Equipe informar prazo de entrega ao cliente",
  "prazo": "Equipe informar/cumprir o prazo solicitado",
  // Documentos / Relatórios
  "relatório": "Equipe preparar e enviar o relatório",
  "relatorio": "Equipe preparar e enviar o relatório",
  "planilha": "Equipe preparar e enviar a planilha",
  "proposta": "Equipe elaborar e enviar a proposta",
  "briefing": "Equipe preencher/enviar o briefing",
  // Digital
  "logo": "Equipe criar/enviar o logo solicitado",
  "logotipo": "Equipe criar/enviar o logotipo",
  "vídeo": "Equipe produzir e enviar o vídeo",
  "video": "Equipe produzir e enviar o vídeo",
  "landing page": "Equipe criar/ajustar a landing page",
  "site": "Equipe atualizar/criar o site conforme pedido",
  "página": "Equipe atualizar a página solicitada",
  "pagina": "Equipe atualizar a página solicitada",
  "link": "Equipe enviar/corrigir o link solicitado",
  "aprovação": "Equipe enviar material para aprovação do cliente",
  "aprovacao": "Equipe enviar material para aprovação do cliente",
  // Cobranças / Espera
  "cadê": "Equipe responder e dar retorno ao cliente",
  "cade": "Equipe responder e dar retorno ao cliente",
  "esperando": "Equipe dar retorno ao cliente que está aguardando",
  "aguardando": "Equipe dar retorno ao cliente que está aguardando",
  "cobrando": "Equipe resolver a pendência cobrada pelo cliente",
  "demora": "Equipe agilizar e dar retorno ao cliente",
  "atrasado": "Equipe resolver o atraso e informar o cliente",
  "atraso": "Equipe resolver o atraso e informar o cliente",
  // Genérico
  "sem resposta": "Equipe responder a mensagem do cliente",
  "fazer": "Equipe executar o que foi solicitado",
  "pode fazer": "Equipe atender ao pedido do cliente",
  "consegue": "Equipe avaliar e responder a viabilidade",
};

function getSuggestedSolution(term: string, excerpt: string): string {
  const lower = term.toLowerCase();
  return SOLUTION_MAP[lower] || `Equipe dar retorno sobre "${term}" ao cliente`;
}

interface PendingDemandDetail {
  term: string;
  requested_at: string;
  message_excerpt: string;
  suggested_solution: string;
}

interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number;
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
  pending_demand_details: PendingDemandDetail[];
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

    // Fetch resolved pending demands to filter them out
    const { data: resolvedDemands, error: resolvedError } = await supabase
      .from("pending_demand_resolutions")
      .select("group_id, term, requested_at")
      .eq("resolved", true);
    if (resolvedError) throw resolvedError;

    // Build a set of resolved keys for fast lookup: "group_id|term|requested_at"
    const resolvedSet = new Set<string>();
    for (const r of (resolvedDemands || [])) {
      resolvedSet.add(`${r.group_id}|${r.term}|${r.requested_at}`);
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
      const { count: dissatisfactionCount, matched: dissatisfactionTerms } = countKeywordMatches(allClientText, DISSATISFACTION_KEYWORDS);
      const { count: complaintCount } = countKeywordMatches(allClientText, COMPLAINT_KEYWORDS);
      const { count: positiveCount } = countKeywordMatches(allClientText, POSITIVE_KEYWORDS);
      const { count: demandCount } = countKeywordMatches(allClientText, DEMAND_KEYWORDS);

      // Sentiment score: -100 to 100 (dissatisfaction weighs heavily)
      const totalSignals = positiveCount + complaintCount + dissatisfactionCount + demandCount || 1;
      const sentimentScore = Math.round(((positiveCount - dissatisfactionCount * 2 - complaintCount - demandCount * 0.5) / totalSignals) * 100);
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

      // 5. Churn risk score (0-100) — driven primarily by client dissatisfaction
      let churnRisk = 30; // base (lower default)
      // Dissatisfaction is the PRIMARY driver of high risk
      churnRisk += Math.min(dissatisfactionCount * 12, 50);
      // General complaints add moderate risk
      churnRisk += Math.min(complaintCount * 3, 10);
      // Demands add slight risk
      churnRisk += Math.min(demandCount * 2, 8);
      // Positive signals reduce risk
      churnRisk -= Math.min(positiveCount * 4, 25);
      // Slow FRT increases risk
      if (avgFrt !== null) {
        if (avgFrt > 480) churnRisk += 10;
        else if (avgFrt > 120) churnRisk += 5;
        else if (avgFrt < 30) churnRisk -= 5;
      }
      // No team responses = higher risk
      if (teamMsgs.length === 0 && clientMsgs.length > 0) churnRisk += 15;
      // Inactivity
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        const daysSince = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 14) churnRisk += 10;
        else if (daysSince > 7) churnRisk += 5;
      }
      churnRisk = Math.max(0, Math.min(100, churnRisk));

      // 6. Pending demands - detect unanswered client solicitations
      // Group by MESSAGE (not by keyword) to avoid duplicates from same message
      const lastTeamMsg = [...msgs].reverse().find((m: any) => m.direcao === "saida");
      const lastTeamTime = lastTeamMsg ? new Date(lastTeamMsg.created_at).getTime() : 0;

      const unansweredClientMsgs = msgs.filter(
        (m: any) => m.direcao === "entrada" && new Date(m.created_at).getTime() > lastTeamTime
      );

      const pendingDetails: PendingDemandDetail[] = [];
      const seenMsgTimes = new Set<string>();

      // Helper: process a client message, pick the BEST matching keyword (not all)
      function addPendingFromMsg(cm: any) {
        const timeKey = cm.created_at;
        if (seenMsgTimes.has(timeKey)) return;
        const { matched: solMatched } = countKeywordMatches(cm.mensagem || "", SOLICITATION_KEYWORDS);
        const { matched: demMatched } = countKeywordMatches(cm.mensagem || "", DEMAND_KEYWORDS);
        // Pick only the first/best match to represent this message
        const bestTerm = solMatched[0] || demMatched[0];
        if (bestTerm) {
          seenMsgTimes.add(timeKey);
          pendingDetails.push({
            term: bestTerm,
            requested_at: cm.created_at,
            message_excerpt: (cm.mensagem || "").slice(0, 120),
            suggested_solution: getSuggestedSolution(bestTerm, cm.mensagem || ""),
          });
        }
      }

      for (const cm of unansweredClientMsgs) {
        addPendingFromMsg(cm);
      }

      // Also check last 10 messages for unanswered solicitations
      const lastFewMsgs = msgs.slice(-10);
      for (let i = 0; i < lastFewMsgs.length; i++) {
        const m = lastFewMsgs[i];
        if (m.direcao === "entrada") {
          const subsequentTeamMsgs = lastFewMsgs.slice(i + 1).filter((x: any) => x.direcao === "saida");
          if (subsequentTeamMsgs.length === 0) {
            addPendingFromMsg(m);
          }
        }
      }

      // "Left on read" - client waiting 2h+ with no specific terms
      const lastMsgIsClient = msgs.length > 0 && msgs[msgs.length - 1].direcao === "entrada";
      const clientLeftWaiting = lastMsgIsClient && unansweredClientMsgs.length >= 1 &&
        (Date.now() - new Date(msgs[msgs.length - 1].created_at).getTime()) > 2 * 60 * 60 * 1000;

      if (clientLeftWaiting && pendingDetails.length === 0) {
        const lastClientMsg = unansweredClientMsgs[unansweredClientMsgs.length - 1];
        pendingDetails.push({
          term: "sem resposta",
          requested_at: lastClientMsg.created_at,
          message_excerpt: (lastClientMsg.mensagem || "").slice(0, 120),
          suggested_solution: getSuggestedSolution("sem resposta", lastClientMsg.mensagem || ""),
        });
      }

      // Filter out resolved demands
      const unresolvedDetails = pendingDetails.filter(d => {
        const key = `${groupId}|${d.term}|${d.requested_at}`;
        return !resolvedSet.has(key);
      });

      const uniqueDetails = unresolvedDetails.slice(0, 5);
      const uniquePendingTerms = uniqueDetails.map(d => d.term);

      analytics[groupId] = {
        group_id: groupId,
        avg_frt_minutes: avgFrt,
        sentiment,
        sentiment_score: sentimentScore,
        complaint_count: complaintCount,
        complaint_terms: dissatisfactionTerms.slice(0, 5),
        positive_count: positiveCount,
        demand_count: demandCount,
        engagement_type: engagementType,
        churn_risk: Math.round(churnRisk),
        total_client_msgs: clientMsgs.length,
        total_team_msgs: teamMsgs.length,
        has_pending_demands: uniqueDetails.length > 0,
        pending_demand_terms: uniquePendingTerms,
        pending_demand_details: uniqueDetails,
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
