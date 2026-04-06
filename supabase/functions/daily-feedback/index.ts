import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Team members with their roles, name variations, and webhooks
const TEAM_MEMBERS = [
  {
    name: "Murilo Araújo",
    firstName: "Murillo",
    cargo: "Gestor de Tráfego / Gerente",
    nameVariations: ["murilo", "murillo", "murilo araujo", "murillo araujo", "murilo araújo", "murillo araújo"],
    webhook: "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
  },
  {
    name: "Netto Monge",
    firstName: "Netto",
    cargo: "Gestor de Tráfego",
    nameVariations: ["netto", "netto monge"],
    webhook: "https://bot-n8n.1lxz8u.easypanel.host/webhook/2ee4657c-1125-4337-8c80-1977daa94bd3",
  },
  {
    name: "Jader Costa",
    firstName: "Jader",
    cargo: "Gestor de Tráfego",
    nameVariations: ["jader", "jader costa"],
    webhook: "https://bot-n8n.1lxz8u.easypanel.host/webhook/fb54db1e-c06c-4b55-bf2f-49a80c40943e",
  },
  {
    name: "Priscilla Borges",
    firstName: "Priscilla",
    cargo: "Social Media / Sócia",
    nameVariations: ["priscilla", "priscila", "priscilla borges", "priscila borges"],
    webhook: "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
  },
];

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isTeamMember(nomeContato: string, member: typeof TEAM_MEMBERS[0]): boolean {
  const norm = normalize(nomeContato);
  return member.nameVariations.some(v => norm.includes(v));
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

    // Load configurable prompts from DB
    const { data: promptConfigs } = await supabase.from("ai_prompts_config").select("prompt_key, prompt_value");
    const promptMap = new Map<string, string>();
    for (const pc of (promptConfigs || [])) promptMap.set(pc.prompt_key, pc.prompt_value);
    const DB_FEEDBACK_SYSTEM = promptMap.get("daily_feedback_system_prompt");
    const DB_FEEDBACK_RULES = promptMap.get("daily_feedback_rules");

    // Check day/time (BRT = UTC-3)
    const now = new Date();
    const brasiliaMs = now.getTime() - 3 * 3600000;
    const brasilia = new Date(brasiliaMs);
    const dayOfWeek = brasilia.getUTCDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(JSON.stringify({ status: "fim de semana, sem feedback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentTime = `${String(brasilia.getUTCHours()).padStart(2, "0")}:${String(brasilia.getUTCMinutes()).padStart(2, "0")}`;
    if (currentTime < "17:30" || currentTime > "18:30") {
      return new Response(JSON.stringify({ status: "fora do horário", currentTime }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Today boundaries in BRT
    const todayStr = brasilia.toISOString().split("T")[0]; // YYYY-MM-DD
    const todayStartUTC = new Date(`${todayStr}T03:00:00Z`); // 00:00 BRT = 03:00 UTC
    const todayEndUTC = new Date(`${todayStr}T02:59:59Z`);
    todayEndUTC.setDate(todayEndUTC.getDate() + 1); // next day 02:59 UTC = 23:59 BRT

    const todayStartISO = todayStartUTC.toISOString();
    const todayEndISO = todayEndUTC.toISOString();

    // Check which members already got feedback today
    const { data: existingFeedback } = await supabase
      .from("daily_feedback_log")
      .select("member_name")
      .eq("feedback_date", todayStr);
    const alreadySent = new Set((existingFeedback || []).map(f => f.member_name));

    // Fetch all data in parallel
    const [
      { data: grupos },
      { data: conversasHoje },
      { data: pendenciasAbertas },
      { data: pendenciasResolvidasHoje },
      { data: coachMsgsHoje },
    ] = await Promise.all([
      supabase.from("whatsapp_grupos").select("*"),
      supabase.from("whatsapp_conversas")
        .select("group_id, mensagem, nome_contato, direcao, recebido_em")
        .gte("recebido_em", todayStartISO)
        .lte("recebido_em", todayEndISO)
        .order("recebido_em", { ascending: true }),
      supabase.from("pending_demand_resolutions")
        .select("*")
        .eq("resolved", false),
      supabase.from("pending_demand_resolutions")
        .select("*")
        .eq("resolved", true)
        .gte("resolved_at", todayStartISO),
      supabase.from("coach_messages")
        .select("destinatario_nome, tipo, mensagem")
        .gte("created_at", todayStartISO),
    ]);

    if (!grupos || !conversasHoje) {
      return new Response(JSON.stringify({ status: "sem dados" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group map
    const grupoMap = new Map<string, any>();
    for (const g of grupos) grupoMap.set(g.group_id, g);

    // Positive/negative keywords
    const POSITIVE_WORDS = /perfeito|[oó]timo|adorei|amei|top|parab[eé]ns|show|mandou bem|excelente|ficou lindo|aprovado|maravilh|incr[ií]vel|arrasou/i;
    const NEGATIVE_WORDS = /insatisfeito|cancelar|p[eé]ssimo|horr[ií]vel|absurdo|reclama[çc][aã]o|problema|demora|atraso|ruim|piorou|cad[eê]|decep[çc]/i;

    const results: any[] = [];

    for (const member of TEAM_MEMBERS) {
      if (alreadySent.has(member.name)) {
        console.log(`Feedback já enviado para ${member.name} hoje`);
        continue;
      }

      // a) Messages this member sent today
      const memberSentMsgs = conversasHoje.filter(c =>
        c.direcao === "saida" && c.nome_contato && isTeamMember(c.nome_contato, member)
      );
      const sentGroupIds = new Set(memberSentMsgs.map(m => m.group_id).filter(Boolean));
      const totalSent = memberSentMsgs.length;
      const groupsSent = sentGroupIds.size;

      // b) Groups this member is responsible for
      const memberGroups = grupos.filter(g =>
        g.gestor_responsavel && member.nameVariations.some(v =>
          normalize(g.gestor_responsavel).includes(v)
        )
      );

      // c) FRT calculation
      const frtSamples: number[] = [];
      for (const mg of memberGroups) {
        const groupMsgs = conversasHoje.filter(c => c.group_id === mg.group_id);
        // Find client messages and the first team response after
        for (let i = 0; i < groupMsgs.length; i++) {
          if (groupMsgs[i].direcao !== "entrada") continue;
          // Find next outgoing from this member
          for (let j = i + 1; j < groupMsgs.length; j++) {
            if (groupMsgs[j].direcao === "saida" && groupMsgs[j].nome_contato && isTeamMember(groupMsgs[j].nome_contato, member)) {
              const diff = (new Date(groupMsgs[j].recebido_em).getTime() - new Date(groupMsgs[i].recebido_em).getTime()) / 60000;
              if (diff > 0 && diff < 1440) frtSamples.push(diff);
              break;
            }
          }
        }
      }
      const avgFrt = frtSamples.length > 0
        ? Math.round(frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length)
        : null;

      // d) Pending demands resolved today
      const resolvedToday = (pendenciasResolvidasHoje || []).filter(p => {
        const grupo = grupoMap.get(p.group_id);
        if (!grupo?.gestor_responsavel) return false;
        return member.nameVariations.some(v => normalize(grupo.gestor_responsavel).includes(v));
      });

      // e) Open pending demands in member's groups
      const openPending: { grupo: string; term: string }[] = [];
      for (const mg of memberGroups) {
        const groupPending = (pendenciasAbertas || []).filter(p => p.group_id === mg.group_id);
        for (const p of groupPending) {
          openPending.push({ grupo: mg.nome, term: p.term });
        }
      }

      // f) Compliments received today
      const compliments: { grupo: string; trecho: string }[] = [];
      for (const mg of memberGroups) {
        const clientMsgs = conversasHoje.filter(c =>
          c.group_id === mg.group_id && c.direcao === "entrada" && POSITIVE_WORDS.test(c.mensagem || "")
        );
        for (const m of clientMsgs) {
          compliments.push({ grupo: mg.nome, trecho: (m.mensagem || "").slice(0, 80) });
        }
      }

      // g) Complaints received today
      const complaints: { grupo: string; trecho: string }[] = [];
      for (const mg of memberGroups) {
        const clientMsgs = conversasHoje.filter(c =>
          c.group_id === mg.group_id && c.direcao === "entrada" && NEGATIVE_WORDS.test(c.mensagem || "")
        );
        for (const m of clientMsgs) {
          complaints.push({ grupo: mg.nome, trecho: (m.mensagem || "").slice(0, 80) });
        }
      }

      // h) Coach alerts received today
      const alertsToday = (coachMsgsHoje || []).filter(c =>
        member.nameVariations.some(v => normalize(c.destinatario_nome).includes(v))
      ).length;

      // Groups without activity today
      const inactiveGroups: string[] = [];
      for (const mg of memberGroups) {
        const hasActivity = conversasHoje.some(c => c.group_id === mg.group_id);
        if (!hasActivity) inactiveGroups.push(mg.nome);
      }

      // Day classification
      const dayClassification = totalSent > 30 ? "movimentado" : totalSent > 10 ? "normal" : "calmo";

      // Format date
      const dateFormatted = `${todayStr.split("-").reverse().join("/")}`;

      // Build user prompt
      const userPrompt = `Gere a mensagem de feedback de final de dia para ${member.firstName} (${member.cargo}).

Dados de hoje (${dateFormatted}):
- Mensagens enviadas: ${totalSent} em ${groupsSent} grupos
- FRT médio hoje: ${avgFrt !== null ? `${avgFrt} minutos` : "sem dados suficientes"}
- Pendências resolvidas hoje: ${resolvedToday.length}
- Pendências ainda abertas: ${openPending.length > 0 ? openPending.slice(0, 5).map(p => `"${p.term}" (${p.grupo})`).join(", ") : "nenhuma"}
- Elogios recebidos: ${compliments.length > 0 ? compliments.slice(0, 3).map(c => `"${c.trecho}" (${c.grupo})`).join(", ") : "nenhum"}
- Reclamações nos grupos dele: ${complaints.length > 0 ? complaints.slice(0, 3).map(c => `"${c.trecho}" (${c.grupo})`).join(", ") : "nenhuma"}
- Grupos dele sem atividade hoje: ${inactiveGroups.length > 0 ? inactiveGroups.slice(0, 5).join(", ") : "todos tiveram atividade"}
- Alertas/cutucadas recebidas hoje: ${alertsToday}
- Dia em geral: ${dayClassification}
- Total de grupos sob responsabilidade: ${memberGroups.length}

Lembre: máximo 500 caracteres. Uma mensagem de WhatsApp curta e pessoal.`;

      const systemPrompt = DB_FEEDBACK_SYSTEM || `Você é a Vox, colega de trabalho da equipe da agência New Vox. Todo dia às 18h você manda uma mensagem rápida pra cada pessoa da equipe fazendo um resumão de como foi o dia. O tom é de amigo de trabalho — informal, sincero, incentivador mas honesto. Você trata a pessoa pelo primeiro nome. Você usa emojis com moderação. Você NUNCA é robótico, formal ou corporativo.`;

      const rulesPrompt = DB_FEEDBACK_RULES || `Regras da mensagem:
- MÁXIMO 500 caracteres. Isso é inegociável. Se passar, cortar. É uma mensagem de WhatsApp, não um email.
- Começar sempre com o nome da pessoa e uma saudação casual variada (nunca a mesma todo dia). Exemplos: 'Netto, bora fechar o dia!', 'E aí Jader, resumão do dia:', 'Priscila, olha como foi hoje:', 'Murillo, fechando o expediente!', 'Thais, rapidinho antes de ir:'
- Ir direto ao ponto. Não precisa de introdução.
- Mencionar 2-3 coisas no máximo. Priorizar nesta ordem:
  1. Se teve elogio de cliente → SEMPRE mencionar primeiro, é o que mais motiva
  2. Se tem pendência aberta → mencionar qual cliente e o que pediu, sugerir priorizar amanhã
  3. Se o FRT foi muito bom ou muito ruim → mencionar
  4. Se o dia foi cheio (muitas msgs) → reconhecer o esforço
  5. Se o dia foi parado → mencionar de forma leve
- Se a pessoa fez tudo certo, mandou bem, resolveu pendências e tem elogios → parabenizar genuinamente
- Se a pessoa tem pendências abertas ou FRT alto → mencionar de forma construtiva, NUNCA como bronca. Tom de 'bora resolver amanhã' e não 'você não fez'
- Se a pessoa não teve atividade nenhuma hoje → pode ser que estava em outra função ou era dia tranquilo. Não julgar, apenas mencionar que foi um dia calmo nos grupos
- Finalizar com algo incentivador curto. Exemplos: 'Amanhã a gente deita! 💪', 'Bom descanso!', 'Tmj! 🤝', 'Amanhã tem mais, bora! 🚀'
- NUNCA listar métricas como números frios. Integrar naturalmente
- NUNCA repetir a mesma estrutura de mensagem. Variar sempre.
- Se não tem muita informação sobre a pessoa, mandar algo breve e genérico mas ainda pessoal
- IMPORTANTE: No final da mensagem, SEMPRE adicione uma quebra de linha e depois: "Quer que eu agende alguma tarefa pra você amanhã? Me conta se fez algo hoje que eu não vi, assim fico mais esperta sobre seus projetos! 😉"`;

      const fullSystemPrompt = systemPrompt + "\n\n" + rulesPrompt;

      // Generate with AI
      let feedbackMsg = "";
      try {
        // Try OpenAI first, fallback to Lovable AI
        let aiSuccess = false;

        if (openaiKey) {
          const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              max_tokens: 300,
            }),
          });

          if (aiResp.ok) {
            const aiData = await aiResp.json();
            feedbackMsg = aiData.choices?.[0]?.message?.content?.trim() || "";
            if (feedbackMsg) aiSuccess = true;
          } else {
            const errText = await aiResp.text();
            console.error(`OpenAI error for ${member.name}: ${errText}`);
          }
        }

        // No fallback - OpenAI is the only provider

        if (!feedbackMsg) {
          console.error(`No AI response for ${member.name}, skipping`);
          continue;
        }
      } catch (e) {
        console.error(`AI failed for ${member.name}:`, e);
        continue;
      }

      if (!feedbackMsg) continue;

      // Truncate to 500 chars if needed (the CTA at the end may push it over)
      if (feedbackMsg.length > 700) {
        feedbackMsg = feedbackMsg.slice(0, 697) + "...";
      }

      // Send via webhook
      try {
        const encodedMsg = encodeURIComponent(feedbackMsg);
        const sendResp = await fetch(`${member.webhook}?message=${encodedMsg}`);
        console.log(`Feedback sent to ${member.name}: ${sendResp.status}`);
      } catch (e) {
        console.error(`Failed to send feedback to ${member.name}:`, e);
        continue;
      }

      // Log to DB (unique constraint prevents duplicates)
      await supabase.from("daily_feedback_log").insert({
        member_name: member.name,
        feedback_message: feedbackMsg,
        feedback_date: todayStr,
      });

      // Also log as coach_message for tracking
      await supabase.from("coach_messages").insert({
        destinatario_nome: member.name,
        mensagem: feedbackMsg,
        tipo: "feedback_diario",
        enviada: true,
        enviada_em: new Date().toISOString(),
      });

      results.push({ member: member.name, sent: true, msgLength: feedbackMsg.length });

      // Delay between sends
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({
      status: "ok",
      date: todayStr,
      results,
      skipped: [...alreadySent],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("daily-feedback error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
