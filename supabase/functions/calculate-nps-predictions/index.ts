import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Sentiment keyword lists ──
const CRITICAL_TERMS = ["cancelar", "cancelamento", "trocar de agência", "outra agência", "advogado", "rescisão", "processo", "procon"];
const STRONG_POSITIVE = ["melhor agência", "excelente", "nota 10", "recomendo", "parabéns", "incrível", "maravilhoso", "top demais", "sensacional"];
const NEGATIVE_TERMS = ["péssimo", "horrível", "absurdo", "vergonha", "nunca mais", "insatisfeito", "decepcionado", "raiva", "frustrado"];
const POSITIVE_TERMS = ["obrigado", "perfeito", "aprovado", "gostei", "ótimo", "bom trabalho", "ficou lindo", "amei", "show"];
const LOYALTY_SIGNALS = ["indiquei", "indicação", "recomendei", "trouxe um cliente", "upsell", "aumentar investimento", "resultado incrível"];
const ABANDON_SIGNALS = ["outra agência", "concorrente", "reduzir investimento", "acesso às contas", "parar", "desistir", "vocês não"];
const RESULTS_TERMS = ["lead", "resultado", "vendendo", "funcionando", "retorno", "investimento", "conversão", "venda", "cliente novo"];

function containsAny(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t));
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
}

interface DimensionResult {
  nome: string;
  score: number;
  peso: number;
  detalhes: string;
}

interface Factor {
  fator: string;
  dimensao: string;
  impacto: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Fetch all groups
    const { data: grupos, error: gErr } = await supabase.from("whatsapp_grupos").select("*");
    if (gErr) throw gErr;
    if (!grupos || grupos.length === 0) {
      return new Response(JSON.stringify({ message: "No groups found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch existing predictions for score_anterior
    const { data: existingPreds } = await supabase.from("nps_predictions").select("group_id, nps_score");
    const prevScoreMap: Record<string, number> = {};
    if (existingPreds) for (const p of existingPreds) prevScoreMap[p.group_id] = Number(p.nps_score);

    // Fetch analytics
    let analyticsMap: Record<string, any> = {};
    try {
      const analyticsResp = await fetch(`${SUPABASE_URL}/functions/v1/group-analytics`, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      });
      if (analyticsResp.ok) {
        const aData = await analyticsResp.json();
        analyticsMap = aData.analytics || {};
      }
    } catch (_) { /* analytics optional */ }

    // Fetch pending demand resolutions
    const { data: allResolutions } = await supabase.from("pending_demand_resolutions").select("*");
    const resolutionsByGroup: Record<string, any[]> = {};
    if (allResolutions) for (const r of allResolutions) {
      if (!resolutionsByGroup[r.group_id]) resolutionsByGroup[r.group_id] = [];
      resolutionsByGroup[r.group_id].push(r);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const predictions: any[] = [];
    const historyEntries: any[] = [];

    for (const grupo of grupos) {
      const groupId = grupo.group_id;

      // Fetch conversations for this group (last 30 days)
      let allMsgs: any[] = [];
      let offset = 0;
      while (true) {
        const { data: page } = await supabase
          .from("whatsapp_conversas")
          .select("mensagem, direcao, recebido_em, nome_contato")
          .eq("group_id", groupId)
          .gte("recebido_em", thirtyDaysAgo.toISOString())
          .order("recebido_em", { ascending: true })
          .range(offset, offset + 999);
        if (!page || page.length === 0) break;
        allMsgs = allMsgs.concat(page);
        if (page.length < 1000) break;
        offset += 1000;
      }

      const clientMsgs = allMsgs.filter(m => m.direcao === "entrada");
      const teamMsgs = allMsgs.filter(m => m.direcao === "saida");
      const totalMsgs = clientMsgs.length;
      const analytics = analyticsMap[groupId] || {};

      const positiveFactors: Factor[] = [];
      const negativeFactors: Factor[] = [];
      const dimensions: DimensionResult[] = [];

      // ── DIMENSION 1: Tom das Conversas (25%) ──
      let dim1Score = 6;
      {
        let strongPositiveCount = 0, positiveCount = 0, negativeCount = 0, criticalCount = 0;
        const recentWeight = (msg: any) => new Date(msg.recebido_em) >= sevenDaysAgo ? 2 : 1;

        for (const msg of clientMsgs) {
          const text = (msg.mensagem || "").toLowerCase();
          const w = recentWeight(msg);
          const foundCritical = containsAny(text, CRITICAL_TERMS);
          const foundStrongPos = containsAny(text, STRONG_POSITIVE);
          const foundNeg = containsAny(text, NEGATIVE_TERMS);
          const foundPos = containsAny(text, POSITIVE_TERMS);

          if (foundCritical.length > 0) { criticalCount += w; negativeFactors.push({ fator: `Termo crítico: "${foundCritical[0]}"`, dimensao: "Tom das Conversas", impacto: -2 }); }
          if (foundStrongPos.length > 0) { strongPositiveCount += w; positiveFactors.push({ fator: `Elogio forte: "${foundStrongPos[0]}"`, dimensao: "Tom das Conversas", impacto: 2 }); }
          if (foundNeg.length > 0) negativeCount += w;
          if (foundPos.length > 0) positiveCount += w;
        }

        if (criticalCount > 0) dim1Score = Math.max(0, 2 - criticalCount);
        else if (negativeCount > positiveCount) dim1Score = 3 + Math.max(0, 1 - (negativeCount - positiveCount) * 0.5);
        else if (positiveCount > 0 && negativeCount === 0 && strongPositiveCount === 0) dim1Score = 5 + Math.min(2, positiveCount * 0.5);
        else if (strongPositiveCount > 0 && negativeCount === 0) dim1Score = 8 + Math.min(2, strongPositiveCount * 0.5);
        else if (positiveCount > negativeCount) dim1Score = 7 + Math.min(1, (positiveCount - negativeCount) * 0.3);
        else dim1Score = 5.5;

        dim1Score = Math.max(0, Math.min(10, dim1Score));
        dimensions.push({ nome: "Tom das Conversas", score: dim1Score, peso: 0.25, detalhes: `${positiveCount} positivas, ${negativeCount} negativas, ${criticalCount} críticas` });
      }

      // ── DIMENSION 2: Engajamento do Cliente (15%) ──
      let dim2Score = 5;
      {
        const engType = analytics.engagement_type || "inativo";
        const weeklyMsgs = totalMsgs / 4;

        // Check if low-volume but all positive (silent promoter)
        const allPositive = clientMsgs.every(m => containsAny(m.mensagem || "", POSITIVE_TERMS).length > 0 || (m.mensagem || "").length < 20);
        const isSilentPromoter = totalMsgs > 0 && totalMsgs < 15 && allPositive && dim1Score >= 7;

        if (isSilentPromoter) { dim2Score = 8.5; positiveFactors.push({ fator: "Promotor silencioso — poucas msgs mas todas positivas", dimensao: "Engajamento", impacto: 1.5 }); }
        else if (engType === "saudável" && weeklyMsgs >= 5) dim2Score = 9;
        else if (engType === "saudável") dim2Score = 8;
        else if (engType === "misto" && weeklyMsgs >= 3) dim2Score = 6.5;
        else if (engType === "misto") dim2Score = 6;
        else if (engType === "cobrança") { dim2Score = 3.5; negativeFactors.push({ fator: "Engajamento predominantemente de cobrança", dimensao: "Engajamento", impacto: -1.5 }); }
        else if (engType === "inativo") { dim2Score = 2; negativeFactors.push({ fator: "Cliente inativo — sem interação recente", dimensao: "Engajamento", impacto: -2 }); }

        if (totalMsgs === 0) { dim2Score = 1; negativeFactors.push({ fator: "Zero mensagens nos últimos 30 dias", dimensao: "Engajamento", impacto: -3 }); }

        dimensions.push({ nome: "Engajamento do Cliente", score: Math.max(0, Math.min(10, dim2Score)), peso: 0.15, detalhes: `${totalMsgs} msgs/30d, tipo: ${engType}` });
      }

      // ── DIMENSION 3: Resolução de Problemas (15%) ──
      let dim3Score = 8;
      {
        const resolutions = resolutionsByGroup[groupId] || [];
        const pendingDetails = analytics.pending_demand_details || [];
        const totalPending = pendingDetails.length;
        const resolved = resolutions.filter((r: any) => r.resolved).length;
        const unresolved = totalPending;
        const urgentUnresolved = pendingDetails.filter((d: any) => d.priority === "urgente").length;

        if (totalPending === 0 && resolved === 0) dim3Score = 9;
        else if (unresolved === 0) dim3Score = 9.5;
        else if (urgentUnresolved > 0) { dim3Score = 2; negativeFactors.push({ fator: `${urgentUnresolved} pendência(s) urgente(s) não resolvida(s)`, dimensao: "Resolução de Problemas", impacto: -2.5 }); }
        else if (unresolved > 3) { dim3Score = 4; negativeFactors.push({ fator: `${unresolved} pendências abertas`, dimensao: "Resolução de Problemas", impacto: -1.5 }); }
        else if (unresolved > 0) dim3Score = 6;

        dimensions.push({ nome: "Resolução de Problemas", score: Math.max(0, Math.min(10, dim3Score)), peso: 0.15, detalhes: `${unresolved} pendentes, ${resolved} resolvidas` });
      }

      // ── DIMENSION 4: Tempo de Resposta (10%) ──
      let dim4Score = 6;
      {
        const frt = analytics.avg_frt_minutes;
        if (frt != null) {
          if (frt <= 15) dim4Score = 9.5;
          else if (frt <= 30) dim4Score = 8.5;
          else if (frt <= 60) dim4Score = 6.5;
          else if (frt <= 120) dim4Score = 4.5;
          else if (frt <= 240) dim4Score = 2.5;
          else { dim4Score = 1; negativeFactors.push({ fator: `FRT muito alto: ${Math.round(frt)}min`, dimensao: "Tempo de Resposta", impacto: -2 }); }
          if (frt <= 15) positiveFactors.push({ fator: `FRT excelente: ${Math.round(frt)}min`, dimensao: "Tempo de Resposta", impacto: 1.5 });
        }
        dimensions.push({ nome: "Tempo de Resposta", score: Math.max(0, Math.min(10, dim4Score)), peso: 0.10, detalhes: frt != null ? `FRT médio: ${Math.round(frt)}min` : "Sem dados de FRT" });
      }

      // ── DIMENSION 5: Resultados de Anúncios (15%) ──
      let dim5Score = 6;
      {
        let clientPerception = 0; // -1 negative, 0 neutral, 1 positive
        let mentionsResults = false;
        for (const msg of clientMsgs) {
          const text = (msg.mensagem || "").toLowerCase();
          const hasResults = containsAny(text, RESULTS_TERMS);
          if (hasResults.length > 0) {
            mentionsResults = true;
            const hasNeg = containsAny(text, ["não tá", "não está", "caiu", "parou", "sumiu", "cadê", "zero", "nenhum"]);
            const hasPos = containsAny(text, ["vendendo", "funcionando", "resultado", "deu certo", "tá vindo", "aumentou"]);
            if (hasNeg.length > 0) clientPerception--;
            if (hasPos.length > 0) clientPerception++;
          }
        }

        if (clientPerception > 0) { dim5Score = 8.5; positiveFactors.push({ fator: "Cliente elogia resultados de anúncios", dimensao: "Resultados de Anúncios", impacto: 1.5 }); }
        else if (clientPerception < 0) { dim5Score = 3; negativeFactors.push({ fator: "Cliente reclama dos resultados de anúncios", dimensao: "Resultados de Anúncios", impacto: -2 }); }
        else if (mentionsResults) dim5Score = 6;
        else dim5Score = 6; // neutral when no mentions

        dimensions.push({ nome: "Resultados de Anúncios", score: Math.max(0, Math.min(10, dim5Score)), peso: 0.15, detalhes: mentionsResults ? `Percepção: ${clientPerception > 0 ? "positiva" : clientPerception < 0 ? "negativa" : "neutra"}` : "Sem menções a resultados" });
      }

      // ── DIMENSION 6: Tempo como Cliente (5%) ──
      let dim6Score = 6.5;
      {
        const dataEntrada = grupo.data_entrada ? new Date(grupo.data_entrada) : null;
        const monthsAsClient = dataEntrada ? daysBetween(now, dataEntrada) / 30 : null;
        const sentTrend = analytics.sentiment_trend;
        const sentiment = analytics.sentiment;

        if (monthsAsClient != null) {
          if (monthsAsClient > 12 && sentiment === "positivo") { dim6Score = 9.5; positiveFactors.push({ fator: `Cliente fiel há ${Math.round(monthsAsClient)} meses`, dimensao: "Tempo como Cliente", impacto: 1 }); }
          else if (monthsAsClient > 6 && sentiment === "positivo") dim6Score = 8.5;
          else if (monthsAsClient > 3 && sentiment === "positivo") dim6Score = 7.5;
          else if (monthsAsClient < 3) dim6Score = 6.5;
          else if (monthsAsClient > 6 && sentTrend === "piorando") { dim6Score = 4; negativeFactors.push({ fator: "Sentimento caindo ao longo do tempo (fadiga)", dimensao: "Tempo como Cliente", impacto: -1 }); }
          else if (monthsAsClient > 12 && sentiment === "negativo") { dim6Score = 2; negativeFactors.push({ fator: `Cliente desencantado após ${Math.round(monthsAsClient)} meses`, dimensao: "Tempo como Cliente", impacto: -1.5 }); }
          else dim6Score = 6;
        }
        dimensions.push({ nome: "Tempo como Cliente", score: Math.max(0, Math.min(10, dim6Score)), peso: 0.05, detalhes: monthsAsClient != null ? `${Math.round(monthsAsClient)} meses` : "Sem data de entrada" });
      }

      // ── DIMENSION 7: Proatividade da Equipe (10%) ──
      let dim7Score = 5;
      {
        // Analyze conversation blocks (4h+ gaps)
        let initiativeCount = 0, responseCount = 0;
        if (allMsgs.length > 0) {
          let blockStart = true;
          let lastTime = new Date(allMsgs[0].recebido_em).getTime();

          for (const msg of allMsgs) {
            const msgTime = new Date(msg.recebido_em).getTime();
            if (msgTime - lastTime > 4 * 60 * 60 * 1000) blockStart = true;

            if (blockStart) {
              if (msg.direcao === "saida") initiativeCount++;
              else responseCount++;
              blockStart = false;
            }
            lastTime = msgTime;
          }
        }

        const totalBlocks = initiativeCount + responseCount;
        const initiativeRatio = totalBlocks > 0 ? initiativeCount / totalBlocks : 0;

        if (initiativeRatio >= 0.4) { dim7Score = 9; positiveFactors.push({ fator: `Equipe proativa (${Math.round(initiativeRatio * 100)}% de iniciativas)`, dimensao: "Proatividade", impacto: 1.5 }); }
        else if (initiativeRatio >= 0.2) dim7Score = 7;
        else if (initiativeRatio >= 0.1) dim7Score = 5;
        else if (totalBlocks > 0) { dim7Score = 3; negativeFactors.push({ fator: "Equipe raramente toma iniciativa", dimensao: "Proatividade", impacto: -1 }); }
        else dim7Score = 5;

        dimensions.push({ nome: "Proatividade da Equipe", score: Math.max(0, Math.min(10, dim7Score)), peso: 0.10, detalhes: `${initiativeCount} iniciativas / ${responseCount} respostas` });
      }

      // ── DIMENSION 8: Sinais de Fidelidade/Abandono (5%) ──
      let dim8Score = 5.5;
      {
        let loyaltySignals = 0, abandonSignals = 0;
        for (const msg of clientMsgs) {
          const text = (msg.mensagem || "").toLowerCase();
          loyaltySignals += containsAny(text, LOYALTY_SIGNALS).length;
          abandonSignals += containsAny(text, ABANDON_SIGNALS).length;
        }

        if (loyaltySignals >= 3) { dim8Score = 9.5; positiveFactors.push({ fator: `${loyaltySignals} sinais de fidelidade detectados`, dimensao: "Sinais de Fidelidade", impacto: 1.5 }); }
        else if (loyaltySignals >= 1) { dim8Score = 7.5; positiveFactors.push({ fator: "Sinais de fidelidade detectados", dimensao: "Sinais de Fidelidade", impacto: 1 }); }
        else if (abandonSignals >= 2) { dim8Score = 1; negativeFactors.push({ fator: `${abandonSignals} sinais de abandono detectados`, dimensao: "Sinais de Fidelidade", impacto: -3 }); }
        else if (abandonSignals === 1) { dim8Score = 3; negativeFactors.push({ fator: "Sinal de abandono detectado", dimensao: "Sinais de Fidelidade", impacto: -1.5 }); }

        dimensions.push({ nome: "Sinais de Fidelidade", score: Math.max(0, Math.min(10, dim8Score)), peso: 0.05, detalhes: `${loyaltySignals} fidelidade, ${abandonSignals} abandono` });
      }

      // ── FINAL SCORE ──
      const npsScore = Number((
        dim1Score * 0.25 +
        dim2Score * 0.15 +
        dim3Score * 0.15 +
        dim4Score * 0.10 +
        dim5Score * 0.15 +
        dim6Score * 0.05 +
        dim7Score * 0.10 +
        dim8Score * 0.05
      ).toFixed(1));

      const npsCategoria = npsScore >= 9 ? "promotor" : npsScore >= 7 ? "neutro" : "detrator";

      // Confidence
      let confianca = 50;
      if (totalMsgs >= 50) confianca = 85;
      else if (totalMsgs >= 20) confianca = 65;
      else if (totalMsgs >= 5) confianca = 35;
      else confianca = 10;

      // Trend
      const scoreAnterior = prevScoreMap[groupId] ?? null;
      let tendencia = "estavel";
      if (scoreAnterior != null) {
        const diff = npsScore - scoreAnterior;
        if (diff > 0.5) tendencia = "subindo";
        else if (diff < -0.5) tendencia = "caindo";
      }

      // Find main factor
      const allFactors = [...positiveFactors, ...negativeFactors];
      const mainFactor = allFactors.sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))[0];
      const fatorPrincipal = mainFactor?.fator || dimensions.sort((a, b) => a.score - b.score)[0]?.nome || "";

      // Recommendation
      let recomendacao = "";
      if (npsScore >= 9) recomendacao = "Cliente promotor — pedir depoimento/case, propor indicação com benefício, considerar upsell";
      else if (npsScore >= 8) recomendacao = "Cliente satisfeito — manter qualidade, enviar relatório proativo, reforçar relação";
      else if (npsScore >= 7) {
        const lowest = dimensions.sort((a, b) => a.score - b.score)[0];
        recomendacao = `Quase promotor — ${lowest.nome} é o ponto a melhorar (${lowest.score.toFixed(1)}/10)`;
      } else if (npsScore >= 6) {
        const lowest = dimensions.sort((a, b) => a.score - b.score)[0];
        recomendacao = `Zona de risco neutro — priorizar ${lowest.nome}. Qualquer problema pode empurrar pra detrator`;
      } else if (npsScore >= 5) {
        const lowest = dimensions.sort((a, b) => a.score - b.score)[0];
        recomendacao = `Detrator leve — ação preventiva urgente. Focar em ${lowest.nome}. Agendar call de alinhamento`;
      } else if (npsScore >= 3) {
        recomendacao = `Detrator ativo — risco de churn alto. Ação imediata: resolver ${fatorPrincipal}`;
      } else {
        recomendacao = `DETRATOR CRÍTICO — provável cancelamento. Reunião de emergência. ${fatorPrincipal}`;
      }

      // Keep only top 5 factors each, unique
      const topPositive = positiveFactors.slice(0, 5);
      const topNegative = negativeFactors.slice(0, 5);

      predictions.push({
        group_id: groupId,
        nps_score: npsScore,
        nps_categoria: npsCategoria,
        confianca,
        fatores_positivos: topPositive,
        fatores_negativos: topNegative,
        fator_principal: fatorPrincipal,
        recomendacao,
        tendencia,
        score_anterior: scoreAnterior,
        dimension_scores: dimensions.map(d => ({ nome: d.nome, score: Number(d.score.toFixed(1)), peso: d.peso, detalhes: d.detalhes })),
        calculated_at: now.toISOString(),
      });

      historyEntries.push({
        group_id: groupId,
        nps_score: npsScore,
        nps_categoria: npsCategoria,
        recorded_at: now.toISOString(),
      });
    }

    // Upsert predictions
    for (const pred of predictions) {
      await supabase.from("nps_predictions").upsert(pred, { onConflict: "group_id" });
    }

    // Insert history
    if (historyEntries.length > 0) {
      await supabase.from("nps_prediction_history").insert(historyEntries);
    }

    return new Response(JSON.stringify({
      success: true,
      count: predictions.length,
      summary: {
        promotores: predictions.filter(p => p.nps_categoria === "promotor").length,
        neutros: predictions.filter(p => p.nps_categoria === "neutro").length,
        detratores: predictions.filter(p => p.nps_categoria === "detrator").length,
        avgScore: Number((predictions.reduce((s, p) => s + p.nps_score, 0) / predictions.length).toFixed(1)),
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("NPS calculation error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
