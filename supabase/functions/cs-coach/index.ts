import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Webhook URLs per team member
const WEBHOOK_MAP: Record<string, string> = {
  "Murillo Araújo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
  "Murilo Araújo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
  "Priscilla": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
  "Netto Monge": "https://bot-n8n.1lxz8u.easypanel.host/webhook/2ee4657c-1125-4337-8c80-1977daa94bd3",
  "Jader Costa": "https://bot-n8n.1lxz8u.easypanel.host/webhook/fb54db1e-c06c-4b55-bf2f-49a80c40943e",
};

function findWebhook(nome: string): string | null {
  for (const [key, url] of Object.entries(WEBHOOK_MAP)) {
    if (nome.toLowerCase().includes(key.toLowerCase().split(" ")[0])) return url;
  }
  return null;
}

const COACH_TYPES = [
  "grupo_parado", "sentimento_caindo", "pendencia_esquecida", "frt_alto",
  "cliente_elogiou", "aniversario", "ads_decolou", "ads_caiu",
  "onboarding_travou", "parabens_performance", "cliente_novo", "padrao_detectado"
];

const TYPE_LABELS: Record<string, string> = {
  grupo_parado: "Grupo parado, bora movimentar",
  sentimento_caindo: "Sentimento caindo, hora de agir",
  pendencia_esquecida: "Pendência aberta esquecida",
  frt_alto: "FRT alto, tá demorando",
  cliente_elogiou: "Cliente elogiou, aproveita!",
  aniversario: "Aniversário/data importante",
  ads_decolou: "Resultado de ads decolou",
  ads_caiu: "Resultado de ads caiu",
  onboarding_travou: "Onboarding travou",
  parabens_performance: "Parabéns pela performance",
  cliente_novo: "Cliente novo precisa de atenção",
  padrao_detectado: "Sugestão baseada em padrão",
};

interface CoachOpportunity {
  tipo: string;
  destinatario: string;
  group_id?: string;
  group_name?: string;
  context: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("openai");

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- STEP 0: Load config ---
    const { data: configs } = await supabase.from("coach_config").select("*").limit(1);
    const config = configs?.[0];
    if (!config?.ativo) {
      return new Response(JSON.stringify({ status: "coach desativado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check business hours (Brasília = UTC-3)
    const now = new Date();
    const brasiliaHour = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const currentTime = `${String(brasiliaHour.getUTCHours()).padStart(2, "0")}:${String(brasiliaHour.getUTCMinutes()).padStart(2, "0")}`;
    const dayOfWeek = brasiliaHour.getUTCDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(JSON.stringify({ status: "fim de semana" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (currentTime < config.horario_inicio || currentTime > config.horario_fim) {
      return new Response(JSON.stringify({ status: "fora do horário", currentTime }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tiposAtivos: string[] = config.tipos_ativos || COACH_TYPES;

    // --- STEP 1: Collect data ---
    const [
      { data: grupos },
      { data: conversasRecentes },
      { data: pendencias },
      { data: mensagensHoje },
      { data: npsSurveys },
    ] = await Promise.all([
      supabase.from("whatsapp_grupos").select("*"),
      supabase.from("whatsapp_conversas")
        .select("group_id, mensagem, nome_contato, direcao, recebido_em")
        .gte("recebido_em", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())
        .order("recebido_em", { ascending: false })
        .limit(1000),
      supabase.from("pending_demand_resolutions")
        .select("*")
        .eq("resolved", false),
      supabase.from("coach_messages")
        .select("*")
        .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("nps_surveys")
        .select("group_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (!grupos || grupos.length === 0) {
      return new Response(JSON.stringify({ status: "sem grupos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call group-analytics to get fresh data
    let analyticsMap: Record<string, any> = {};
    try {
      const analyticsResp = await fetch(`${supabaseUrl}/functions/v1/group-analytics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
      });
      const analyticsData = await analyticsResp.json();
      analyticsMap = analyticsData?.analytics || {};
    } catch (e) {
      console.error("Failed to fetch analytics:", e);
    }

    // Build message count per person today
    const msgCountToday: Record<string, number> = {};
    const lastMsgTime: Record<string, string> = {};
    const msgTypeGroupToday: Record<string, boolean> = {};

    for (const m of (mensagensHoje || [])) {
      const key = m.destinatario_nome;
      msgCountToday[key] = (msgCountToday[key] || 0) + 1;
      if (!lastMsgTime[key] || m.created_at > lastMsgTime[key]) {
        lastMsgTime[key] = m.created_at;
      }
      if (m.tipo && m.group_id) {
        msgTypeGroupToday[`${key}:${m.tipo}:${m.group_id}`] = true;
      }
    }

    // Build conversations per group
    const convByGroup: Record<string, any[]> = {};
    for (const c of (conversasRecentes || [])) {
      if (!c.group_id) continue;
      if (!convByGroup[c.group_id]) convByGroup[c.group_id] = [];
      convByGroup[c.group_id].push(c);
    }

    // --- STEP 2: Detect opportunities ---
    const opportunities: CoachOpportunity[] = [];

    for (const grupo of grupos) {
      const responsavel = grupo.gestor_responsavel;
      if (!responsavel) continue;

      const analytics = analyticsMap[grupo.group_id];
      const groupConvs = convByGroup[grupo.group_id] || [];
      const lastMsg = groupConvs[0];
      const lastMsgTimestamp = lastMsg?.recebido_em ? new Date(lastMsg.recebido_em).getTime() : null;
      const hoursSinceLastMsg = lastMsgTimestamp ? (now.getTime() - lastMsgTimestamp) / (1000 * 60 * 60) : 999;

      // TYPE 1: Grupo parado (48h+)
      if (tiposAtivos.includes("grupo_parado") && hoursSinceLastMsg > 48) {
        opportunities.push({
          tipo: "grupo_parado",
          destinatario: responsavel,
          group_id: grupo.group_id,
          group_name: grupo.nome,
          context: `Grupo "${grupo.nome}" sem mensagens há ${Math.round(hoursSinceLastMsg)} horas. Categoria: ${grupo.categoria || "N/A"}.`,
        });
      }

      // TYPE 2: Sentimento caindo
      if (tiposAtivos.includes("sentimento_caindo") && analytics?.sentiment_trend === "piorando") {
        opportunities.push({
          tipo: "sentimento_caindo",
          destinatario: responsavel,
          group_id: grupo.group_id,
          group_name: grupo.nome,
          context: `Grupo "${grupo.nome}" com sentimento ${analytics.sentiment} e tendência piorando. Score: ${analytics.sentiment_score?.toFixed(2)}. Reclamações recentes: ${analytics.complaint_count || 0}.`,
        });
      }

      // TYPE 4: FRT alto
      if (tiposAtivos.includes("frt_alto") && analytics?.avg_frt_minutes && analytics.avg_frt_minutes > 120) {
        opportunities.push({
          tipo: "frt_alto",
          destinatario: responsavel,
          group_id: grupo.group_id,
          group_name: grupo.nome,
          context: `FRT médio de ${Math.round(analytics.avg_frt_minutes)} minutos no grupo "${grupo.nome}". Ideal: abaixo de 30min.`,
        });
      }

      // TYPE 5: Cliente elogiou
      if (tiposAtivos.includes("cliente_elogiou") && analytics?.positive_count && analytics.positive_count >= 3) {
        const recentPositive = groupConvs.find((c: any) =>
          c.direcao === "entrada" && /adorei|amei|perfeito|excelente|lindo|show|top|maravilh/i.test(c.mensagem || "")
        );
        if (recentPositive) {
          opportunities.push({
            tipo: "cliente_elogiou",
            destinatario: responsavel,
            group_id: grupo.group_id,
            group_name: grupo.nome,
            context: `Cliente no grupo "${grupo.nome}" enviou elogio recente: "${(recentPositive.mensagem || "").slice(0, 100)}". Momento ideal para reforçar valor.`,
          });
        }
      }

      // TYPE 6: Aniversário/data importante
      if (tiposAtivos.includes("aniversario")) {
        const checkDate = (dateStr: string | null, label: string) => {
          if (!dateStr) return;
          const d = new Date(dateStr);
          const today = new Date(brasiliaHour.toISOString().split("T")[0]);
          const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
          const diff = (thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
          if (diff >= 0 && diff <= 7) {
            opportunities.push({
              tipo: "aniversario",
              destinatario: responsavel,
              group_id: grupo.group_id,
              group_name: grupo.nome,
              context: `${label} do grupo "${grupo.nome}" é em ${Math.round(diff)} dias (${dateStr}). Momento para mensagem especial.`,
            });
          }
        };
        checkDate(grupo.aniversario_cliente, "Aniversário do cliente");
        checkDate(grupo.aniversario_empresa, "Aniversário da empresa");

        // Check data_entrada for round months
        if (grupo.data_entrada) {
          const entrada = new Date(grupo.data_entrada);
          const months = (now.getFullYear() - entrada.getFullYear()) * 12 + (now.getMonth() - entrada.getMonth());
          if (months > 0 && (months % 6 === 0 || months === 1 || months === 3)) {
            const dayDiff = Math.abs(now.getDate() - entrada.getDate());
            if (dayDiff <= 3) {
              opportunities.push({
                tipo: "aniversario",
                destinatario: responsavel,
                group_id: grupo.group_id,
                group_name: grupo.nome,
                context: `Cliente "${grupo.nome}" completa ${months} meses como cliente! Ótimo momento para celebrar a parceria.`,
              });
            }
          }
        }
      }

      // TYPE 11: Cliente novo (< 30 dias, pouca interação)
      if (tiposAtivos.includes("cliente_novo") && grupo.data_entrada) {
        const diasCliente = (now.getTime() - new Date(grupo.data_entrada).getTime()) / (1000 * 60 * 60 * 24);
        if (diasCliente <= 30 && diasCliente > 3 && groupConvs.length < 10) {
          opportunities.push({
            tipo: "cliente_novo",
            destinatario: responsavel,
            group_id: grupo.group_id,
            group_name: grupo.nome,
            context: `Cliente "${grupo.nome}" é novo (${Math.round(diasCliente)} dias) e teve apenas ${groupConvs.length} mensagens. Primeiros 30 dias são críticos para retenção.`,
          });
        }
      }
    }

    // ============================
    // MONTHLY NFS TASK (Day 1 - Oral Center clinics)
    // ============================
    const dayOfMonth = brasiliaHour.getUTCDate();
    const NFS_CLINICS = [
      "120363145568211726@g.us", // Oral Center Araguari
      "120363316048469386@g.us", // Oral Center Catalão
    ];

    if (dayOfMonth === 1 && currentTime >= "08:30" && currentTime < "10:00") {
      for (const clinicId of NFS_CLINICS) {
        const grupo = grupos.find((g: any) => g.group_id === clinicId);
        if (!grupo) continue;
        const responsavel = grupo.gestor_responsavel;
        if (!responsavel) continue;

        const monthKey = `${brasiliaHour.getUTCFullYear()}-${String(brasiliaHour.getUTCMonth() + 1).padStart(2, "0")}`;

        const { data: existingTask } = await supabase
          .from("tasks")
          .select("id")
          .eq("group_id", clinicId)
          .ilike("title", "%NFS%Meta%Google%")
          .gte("created_at", `${monthKey}-01T00:00:00Z`)
          .limit(1);

        if (!existingTask || existingTask.length === 0) {
          await supabase.from("tasks").insert({
            title: `Enviar NFS Meta e Google Ads - ${grupo.nome}`,
            description: `Tarefa recorrente mensal (dia 01): Enviar as Notas Fiscais de Serviço referentes ao Meta Ads e Google Ads para o cliente ${grupo.nome}.`,
            assigned_to: responsavel,
            group_id: clinicId,
            priority: "alta",
            status: "pendente",
            due_date: `${monthKey}-01`,
          });
        }
      }
    }

    // ============================
    // WEEKLY REPORT TASKS (Fridays)
    // ============================
    if (dayOfWeek === 5) { // Friday
      const isMorning = currentTime >= "08:30" && currentTime < "10:00";
      const isNoon = currentTime >= "12:00" && currentTime < "13:00";

      if (isMorning) {
        // Create weekly report tasks for each gestor+client
        for (const grupo of grupos) {
          const responsavel = grupo.gestor_responsavel;
          if (!responsavel) continue;

          // Check if task already exists for this week
          const weekStart = new Date(brasiliaHour);
          weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1); // Monday
          weekStart.setUTCHours(0, 0, 0, 0);

          const { data: existingTask } = await supabase
            .from("tasks")
            .select("id")
            .eq("group_id", grupo.group_id)
            .ilike("title", "%relatório semanal%")
            .gte("created_at", weekStart.toISOString())
            .limit(1);

          if (!existingTask || existingTask.length === 0) {
            await supabase.from("tasks").insert({
              title: `Enviar relatório semanal - ${grupo.nome}`,
              description: `Envie o relatório dos últimos 7 dias para o cliente ${grupo.nome}. Inclua métricas de desempenho, resultados de ads e próximos passos.`,
              assigned_to: responsavel,
              group_id: grupo.group_id,
              priority: "alta",
              status: "pendente",
              due_date: new Date(brasiliaHour.toISOString().split("T")[0]).toISOString().split("T")[0],
            });
          }
        }
      }

      if (isNoon) {
        // Check if report was sent by analyzing WhatsApp messages
        // and send reminder if not
        for (const grupo of grupos) {
          const responsavel = grupo.gestor_responsavel;
          if (!responsavel) continue;

          // Find the weekly report task for this week
          const weekStart = new Date(brasiliaHour);
          weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1);
          weekStart.setUTCHours(0, 0, 0, 0);

          const { data: reportTasks } = await supabase
            .from("tasks")
            .select("id, status")
            .eq("group_id", grupo.group_id)
            .ilike("title", "%relatório semanal%")
            .gte("created_at", weekStart.toISOString())
            .eq("status", "pendente")
            .limit(1);

          if (!reportTasks || reportTasks.length === 0) continue;

          // Check WhatsApp for report-related messages sent today by team
          const todayStart = new Date(brasiliaHour.toISOString().split("T")[0] + "T00:00:00Z");
          const groupConvs = convByGroup[grupo.group_id] || [];
          const reportSent = groupConvs.some((c: any) => {
            if (c.direcao !== "saida") return false;
            if (new Date(c.recebido_em) < todayStart) return false;
            const msg = (c.mensagem || "").toLowerCase();
            return /relat[oó]rio|report|resultado.*semana|m[eé]tricas|desempenho.*semanal|resumo.*semana/i.test(msg);
          });

          if (reportSent) {
            // Auto-complete the task
            await supabase
              .from("tasks")
              .update({ status: "concluída", updated_at: new Date().toISOString() })
              .eq("id", reportTasks[0].id);
          } else {
            // Send coach nudge reminder
            opportunities.push({
              tipo: "pendencia_esquecida",
              destinatario: responsavel,
              group_id: grupo.group_id,
              group_name: grupo.nome,
              context: `O relatório semanal do cliente "${grupo.nome}" ainda não foi enviado e já passa do meio-dia! Envie agora para manter o cliente atualizado.`,
            });
          }
        }
      }
    }

    // NPS REAL REMINDER: Check if 3+ months since last survey response, create task & coach nudge
    const npsLastByGroup = new Map<string, string>();
    for (const s of (npsSurveys || [])) {
      if (!npsLastByGroup.has(s.group_id)) {
        npsLastByGroup.set(s.group_id, s.created_at);
      }
    }

    for (const grupo of grupos) {
      const responsavel = grupo.gestor_responsavel;
      if (!responsavel) continue;

      const lastSurvey = npsLastByGroup.get(grupo.group_id);
      if (!lastSurvey) continue;

      const monthsSinceSurvey = (now.getTime() - new Date(lastSurvey).getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSinceSurvey >= 3) {
        const { data: existingTask } = await supabase
          .from("tasks")
          .select("id")
          .eq("group_id", grupo.group_id)
          .ilike("title", "%pesquisa NPS%")
          .eq("status", "pendente")
          .limit(1);

        if (!existingTask || existingTask.length === 0) {
          const surveyType = (grupo.categoria || "").toLowerCase().includes("clínica") ? "clinica" : "operacao";
          await supabase.from("tasks").insert({
            title: `Enviar pesquisa NPS Real - ${grupo.nome}`,
            description: `Já se passaram ${Math.floor(monthsSinceSurvey)} meses desde a última pesquisa NPS. Envie o link de pesquisa (${surveyType}) ao cliente.`,
            assigned_to: responsavel,
            group_id: grupo.group_id,
            priority: "alta",
            status: "pendente",
          });

          opportunities.push({
            tipo: "padrao_detectado",
            destinatario: responsavel,
            group_id: grupo.group_id,
            group_name: grupo.nome,
            context: `Pesquisa NPS Real do cliente "${grupo.nome}" está pendente há ${Math.floor(monthsSinceSurvey)} meses. Hora de reenviar o link para coletar feedback atualizado.`,
          });
        }
      }
    }

    // TYPE 3: Pendências esquecidas (1h+)
    if (tiposAtivos.includes("pendencia_esquecida")) {
      for (const pend of (pendencias || [])) {
        const hoursOpen = (now.getTime() - new Date(pend.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursOpen >= 1) {
          const grupo = grupos.find((g: any) => g.group_id === pend.group_id);
          if (grupo?.gestor_responsavel) {
            opportunities.push({
              tipo: "pendencia_esquecida",
              destinatario: grupo.gestor_responsavel,
              group_id: pend.group_id,
              group_name: grupo?.nome || pend.group_id,
              context: `Pendência "${pend.term}" no grupo "${grupo?.nome}" está aberta há ${Math.round(hoursOpen)} horas. Status: ${pend.status}.`,
            });
          }
        }
      }
    }

    // TYPE 10: Parabéns pela performance (per person aggregate)
    if (tiposAtivos.includes("parabens_performance")) {
      const frtByPerson: Record<string, number[]> = {};
      for (const grupo of grupos) {
        const resp = grupo.gestor_responsavel;
        if (!resp) continue;
        const a = analyticsMap[grupo.group_id];
        if (a?.avg_frt_minutes != null && a.avg_frt_minutes < 15) {
          if (!frtByPerson[resp]) frtByPerson[resp] = [];
          frtByPerson[resp].push(a.avg_frt_minutes);
        }
      }
      for (const [person, frts] of Object.entries(frtByPerson)) {
        if (frts.length >= 3) {
          const avg = Math.round(frts.reduce((s, v) => s + v, 0) / frts.length);
          opportunities.push({
            tipo: "parabens_performance",
            destinatario: person,
            context: `FRT médio de ${avg} minutos em ${frts.length} grupos. Performance excelente!`,
          });
        }
      }
    }

    if (opportunities.length === 0) {
      return new Response(JSON.stringify({ status: "nenhuma oportunidade detectada", checked: grupos.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- STEP 3 & 4: Filter and generate messages ---
    const maxPerPerson = config.max_mensagens_dia_por_pessoa || 5;
    const minInterval = config.intervalo_minimo_minutos || 60;
    const results: any[] = [];

    for (const opp of opportunities) {
      // Filter: max per person
      if ((msgCountToday[opp.destinatario] || 0) >= maxPerPerson) continue;

      // Filter: min interval
      const lastTime = lastMsgTime[opp.destinatario];
      if (lastTime) {
        const elapsed = (now.getTime() - new Date(lastTime).getTime()) / (1000 * 60);
        if (elapsed < minInterval) continue;
      }

      // Filter: same type+group in last 24h
      if (opp.group_id && msgTypeGroupToday[`${opp.destinatario}:${opp.tipo}:${opp.group_id}`]) continue;

      // Find webhook
      const webhookUrl = findWebhook(opp.destinatario);
      if (!webhookUrl) {
        console.log(`No webhook for ${opp.destinatario}, skipping`);
        continue;
      }

      // Generate message with AI
      const firstName = opp.destinatario.split(" ")[0];
      const systemPrompt = `Você é a Vox, coach de CS da agência New Vox. Você manda mensagens curtas e diretas para os membros da equipe via WhatsApp. O tom é de colega de trabalho gente boa — informal, incentivador, nunca punitivo. Use emojis com moderação, faça piadas leves quando cabe, e sempre termine com uma ação concreta. As mensagens devem ter no máximo 300 caracteres. Trate a pessoa pelo primeiro nome "${firstName}". Varie o estilo — às vezes comece com "E aí", às vezes com "Opa", às vezes vá direto ao ponto. Seja natural, não robótica. No final, adicione "(responda 👍 se já fez)".`;

      const userPrompt = `Gere UMA mensagem de cutucada do tipo "${TYPE_LABELS[opp.tipo] || opp.tipo}" para ${firstName}.

Contexto: ${opp.context}

Regras:
- Máximo 300 caracteres
- Mencione o nome do grupo/cliente se relevante
- Termine com ação concreta
- Tom: amigável e motivador
- Adicione "(responda 👍 se já fez)" no final`;

      let mensagem = "";
      try {
        const aiUrl = "https://api.openai.com/v1/chat/completions";
        const aiKey = openaiKey;

        if (!aiKey) {
          console.error("No OpenAI API key configured");
          continue;
        }

        const aiResp = await fetch(aiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${aiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 200,
          }),
        });

        if (!aiResp.ok) {
          console.error("AI error:", await aiResp.text());
          continue;
        }

        const aiData = await aiResp.json();
        mensagem = aiData.choices?.[0]?.message?.content?.trim() || "";
      } catch (e) {
        console.error("AI generation failed:", e);
        continue;
      }

      if (!mensagem) continue;

      // --- STEP 5: Send via webhook (GET with query param) ---
      try {
        const encodedMsg = encodeURIComponent(mensagem);
        const sendResp = await fetch(`${webhookUrl}?message=${encodedMsg}`);
        console.log(`Sent to ${opp.destinatario}: ${sendResp.status}`);
      } catch (e) {
        console.error(`Failed to send to ${opp.destinatario}:`, e);
      }

      // Record in coach_messages
      const { error: insertErr } = await supabase.from("coach_messages").insert({
        destinatario_nome: opp.destinatario,
        mensagem,
        tipo: opp.tipo,
        group_id: opp.group_id || null,
        enviada: true,
        enviada_em: new Date().toISOString(),
      });
      if (insertErr) console.error("Insert error:", insertErr);

      // Update counts for subsequent filtering
      msgCountToday[opp.destinatario] = (msgCountToday[opp.destinatario] || 0) + 1;
      lastMsgTime[opp.destinatario] = new Date().toISOString();
      if (opp.group_id) {
        msgTypeGroupToday[`${opp.destinatario}:${opp.tipo}:${opp.group_id}`] = true;
      }

      results.push({
        destinatario: opp.destinatario,
        tipo: opp.tipo,
        group: opp.group_name,
        mensagem: mensagem.slice(0, 80) + "...",
      });

      // Small delay between sends
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({
      status: "ok",
      opportunities_detected: opportunities.length,
      messages_sent: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("cs-coach error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
