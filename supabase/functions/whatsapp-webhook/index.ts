import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Alisson's phone for AI auto-reply (with country-code and 9th-digit variations)
const ALISSON_PHONES = ["64992565779", "5564992565779"];
const ALISSON_WEBHOOK_URL = "https://bot-n8n.1lxz8u.easypanel.host/webhook/b833f73e-af8f-4231-85de-1ec473e52dcd";

function digitsOnly(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function getBrazilPhoneVariants(phone: string | null | undefined): string[] {
  const digits = digitsOnly(phone);
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;

  if (local) {
    variants.add(local);

    if (local.length === 11 && local[2] === "9") {
      variants.add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    if (local.length === 10) {
      variants.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
  }

  for (const variant of [...variants]) {
    if (!variant.startsWith("55")) {
      variants.add(`55${variant}`);
    }
  }

  return [...variants];
}

function isKnownPhone(candidate: string | null | undefined, knownPhones: string[]): boolean {
  const candidateVariants = new Set(getBrazilPhoneVariants(candidate));
  return knownPhones.some((phone) =>
    getBrazilPhoneVariants(phone).some((variant) => candidateVariants.has(variant))
  );
}

const ALISSON_PHONE_FILTERS = [...new Set(ALISSON_PHONES.flatMap((phone) => getBrazilPhoneVariants(phone)))]
  .map((phone) => `telefone.eq.${phone}`);

// Messages that should NOT trigger AI response
const IGNORE_PATTERNS = [
  /^(ok|sim|não|nao|certo|beleza|combinado|pode ser|tá bom|ta bom|tá|ta|blz|vlw|valeu|top|show|perfeito|obrigado|obrigada|bom dia|boa tarde|boa noite|oi|olá|ola)$/i,
  /^[\p{Emoji}\s]+$/u,
  /^\[Figurinha\]$/,
  /^\[Imagem\]$/,
  /^\[Vídeo\]$/,
  /^\[Áudio\]$/,
  /^\[Documento\]/,
  /^\[Contato\]$/,
  /^\[Localização\]$/,
];

function shouldRespondToMessage(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  const trimmed = text.trim();
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function fetchMetaAdsForAccount(accountId: string, token: string): Promise<any | null> {
  try {
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,reach,frequency";
    const url = `${META_BASE}/${actId}/insights?fields=${fields}&date_preset=last_30d&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.data?.length) return null;
    const row = data.data[0];
    const actions = row.actions || [];
    const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;
    const cpaArr = row.cost_per_action_type || [];
    const cpa = cpaArr.find((a: any) => a.action_type === "lead")?.value || null;
    return {
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      ctr: parseFloat(row.ctr || "0"),
      cpc: parseFloat(row.cpc || "0"),
      leads: parseInt(leads),
      cpa: cpa ? parseFloat(cpa) : null,
      reach: parseInt(row.reach || "0"),
    };
  } catch {
    return null;
  }
}

/**
 * Handle Alisson's AI auto-reply: analyze message, build context, call OpenAI, send response via webhook
 */
async function handleAlissonAIReply(
  messageText: string,
  groupId: string,
  supabase: any
) {
  try {
    const OPENAI_API_KEY = Deno.env.get("openai");
    if (!OPENAI_API_KEY) {
      console.error("OpenAI key not configured for Alisson AI reply");
      return;
    }
    const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");

    // Fetch all groups
    const { data: grupos } = await supabase.from("whatsapp_grupos").select("*").order("nome");
    if (!grupos?.length) return;

    // Fetch last 30 messages per group (lighter for webhook speed)
    const groupIds = grupos.map((g: any) => g.group_id);
    const conversasPromises = groupIds.map((gid: string) =>
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, recebido_em, direcao")
        .eq("group_id", gid)
        .order("recebido_em", { ascending: false })
        .limit(30)
    );

    const pendingResPromise = supabase
      .from("pending_demand_resolutions")
      .select("*")
      .eq("resolved", false);

    const [pendingResResult, ...conversasResults] = await Promise.all([
      pendingResPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResResult.data || [];
    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      groupMsgsMap.set(groupIds[i], conversasResults[i].data || []);
    }

    // Fetch ads data
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();
    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const adsData = await fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN);
        if (adsData) adsDataMap.set(g.group_id, adsData);
      });
      await Promise.all(adsPromises);
    }

    // Pending by group
    const pendingByGroup = new Map<string, any[]>();
    for (const p of pendingResolutions) {
      if (!pendingByGroup.has(p.group_id)) pendingByGroup.set(p.group_id, []);
      pendingByGroup.get(p.group_id)!.push(p);
    }

    // Build context
    const contextLines: string[] = [];
    for (const g of grupos) {
      const gid = g.group_id;
      const msgs = groupMsgsMap.get(gid) || [];
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      let mesesCliente = "";
      if (g.data_entrada) {
        const months = Math.floor((Date.now() - new Date(g.data_entrada).getTime()) / (1000 * 60 * 60 * 24 * 30));
        mesesCliente = `${months}m`;
      }

      const groupPending = pendingByGroup.get(gid) || [];
      const ads = adsDataMap.get(gid);

      let line = `### ${g.nome}`;
      line += `\n  Responsável: ${g.gestor_responsavel || "N/D"} | Plano: ${g.plano || "N/A"} | Investimento: ${g.investimento_ads ? `R$${g.investimento_ads}` : "N/A"}${mesesCliente ? ` | Cliente há ${mesesCliente}` : ""}`;
      line += `\n  Msgs: ${clientMsgs.length} cliente, ${teamMsgs.length} equipe`;

      if (groupPending.length > 0) {
        line += `\n  ⚠️ ${groupPending.length} pendência(s): ${groupPending.slice(0, 3).map((p: any) => `"${p.term}"`).join(", ")}`;
      }

      if (ads) {
        line += `\n  📊 Ads 30d: R$${ads.spend.toFixed(0)} gasto, ${ads.leads} leads${ads.cpa ? `, CPA R$${ads.cpa.toFixed(2)}` : ""}, CTR ${ads.ctr.toFixed(2)}%`;
      }

      // Last 5 messages for context
      const last5 = msgs.slice(0, 5).reverse();
      if (last5.length > 0) {
        line += `\n  Últimas msgs:`;
        for (const m of last5) {
          const dir = m.direcao === "entrada" ? "👤" : "👨‍💼";
          line += `\n    ${dir} ${m.nome_contato || "?"}: ${(m.mensagem || "").slice(0, 80)}`;
        }
      }
      contextLines.push(line);
    }

    // Load Alisson's recent chat history for context continuity
    const { data: recentAlissonMsgs } = await supabase
      .from("whatsapp_conversas")
      .select("mensagem, direcao, recebido_em, nome_contato")
      .or(`${ALISSON_PHONE_FILTERS.join(",")},nome_contato.ilike.%alisson%`)
      .order("recebido_em", { ascending: false })
      .limit(10);

    let conversationHistory = "";
    if (recentAlissonMsgs?.length) {
      const reversed = [...recentAlissonMsgs].reverse();
      conversationHistory = "\n\nHISTÓRICO RECENTE DA CONVERSA COM ALISSON:\n" +
        reversed.map((m: any) => {
          const dir = m.direcao === "entrada" ? "Alisson" : "Vox (IA)";
          return `${dir}: ${m.mensagem}`;
        }).join("\n");
    }

    const systemPrompt = `Você é a Vox, analista sênior de Customer Success da agência New Vox. Está respondendo diretamente ao Alisson (sócio da empresa) via WhatsApp.

EQUIPE: Jader Costa e Murilo Araújo e Netto Monge (gestores de tráfego), Priscilla (social media/sócia), Joel (gerente geral), Thais (auxiliar social media), Daniella, Victor Botto, Jiza (equipe operacional).

REGRAS:
- Responda de forma DIRETA e CONCISA (máximo 300 palavras) — é WhatsApp, não email
- Use emojis com moderação para facilitar leitura
- Nunca invente dados. Se não tem, diga
- Quando sugerir ações, diga QUEM da equipe deve fazer
- Se Alisson pedir para criar/designar pendência, confirme com os detalhes
- Contextualize métricas: FRT ideal <30min, bom até 60, ruim >120
- Benchmarks: churn <30 tranquilo, >60 precisa ação
- Formate com 🔴 crítico, 🟡 atenção, 🟢 ok, ⚡ urgente

CAPACIDADES: resumo de grupo, comparação, análise geral, diagnóstico, recomendações, alertas, análise de equipe, dados de ads, criação de pendências.

Se Alisson pedir para adicionar pendência a um responsável, responda confirmando: qual cliente, qual pendência, para quem, e prazo se mencionado.

DADOS DA OPERAÇÃO (${grupos.length} grupos):

${contextLines.join("\n\n")}
${conversationHistory}`;

    // Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: messageText },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error for Alisson reply:", response.status, await response.text());
      return;
    }

    const aiData = await response.json();
    const aiReply = aiData.choices?.[0]?.message?.content;
    if (!aiReply) {
      console.log("No AI reply generated");
      return;
    }

    console.log("AI reply for Alisson:", aiReply.substring(0, 100) + "...");

    // Send response via n8n webhook
    const webhookResponse = await fetch(ALISSON_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "5564992565779",
        message: aiReply,
        groupId: groupId,
        type: "ai_response",
      }),
    });

    console.log("Webhook response status:", webhookResponse.status);
  } catch (err) {
    console.error("Error in Alisson AI reply:", err);
  }
}

// Nomes do time New Vox — mensagens desses contatos são "saida"
const TEAM_MEMBERS = [
  "jader", "jader costa",
  "alisson", "alisson lima",
  "murilo", "murillo", "murilo araújo", "murilo araujo",
  "priscila", "priscilla", "priscila borges", "priscilla borges",
  "thais", "thaís", "~thais",
  "netto", "netto monge",
  "jiza", "jiza reis",
  "victor", "victor botto",
];

function normalizeName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function detectDirection(fromMe: boolean, contactName: string): string {
  if (fromMe) return "saida";
  const normalized = normalizeName(contactName);
  if (normalized && TEAM_MEMBERS.some((tm) => {
    const normalizedTm = tm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized.includes(normalizedTm);
  })) {
    return "saida";
  }
  return "entrada";
}

function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  const match = jid.match(/^(\d+)@/);
  return match ? match[1] : null;
}

// Grupos permitidos
const ALLOWED_GROUPS: Record<string, string> = {
  "120363406574401569@g.us": "NV-MKT IMPLANTAR JATAÍ",
  "120363427941134678@g.us": "NV - MICROLINS",
  "120363406346934597@g.us": "NV MKT - EXCLUSIVE",
  "120363387212424738@g.us": "MK-NV Itulub Lançamentos",
  "120363425401904195@g.us": "NV-MKT Instituto Reabilis",
  "120363145568211726@g.us": "MKT NV - ORAL CENTER ARAGUARI",
  "120363419961757740@g.us": "NV - SORRIA BEM",
  "120363422452848401@g.us": "NV-MKT Patos Eixos",
  "120363400497423496@g.us": "MKT-NV Luiz Curti",
  "120363423267143034@g.us": "NV-MKT Beatriz Chaves Confeitaria",
  "120363422455970759@g.us": "NV - SOLUÇÃO T3LED",
  "120363316048469386@g.us": "MKT NV - ORAL CENTER CATALAO",
  "120363419351414313@g.us": "NV-MKT Guardião Proteção",
  "120363405241521628@g.us": "NV - DRA. TACIANE",
  "120363301303362582@g.us": "NV-MKT CIRO AUTO PEÇAS",
  "120363406937225964@g.us": "NV-MKT ORALMED",
  "120363418339795433@g.us": "NV - VEMSER",
  "120363422282387892@g.us": "NV-MKT Trevo Legaliza",
  "120363420218079110@g.us": "NV-MKT MIX IMPORTS",
  "120363404775153601@g.us": "NV - REDEPOP",
  "120363422095140523@g.us": "NV-MKT Chevromix",
  "12036311637739178@g.us": "NV-MKT Veneza",
  "120363164575490995@g.us": "NV-MKT VENEZA SEMI NOVOS",
  "12036342134908487@g.us": "NV - MKT PRIMAVERA M. CONSTRUÇÃO",
  "120363423095337077@g.us": "NV - T3 LED",
  "120363426488293045@g.us": "NV - MKT IMPLANTAR RIO VERDE",
  "120363404804672868@g.us": "NV - MKT ODONTONEO",
  "120363405316956579@g.us": "NV - Guardião e agilidade de tráfego",
  "120363406017903305@g.us": "NV - Bass Importados",
};

function isGroupJid(jid: string): boolean {
  return jid?.endsWith("@g.us") || false;
}

function isAllowedGroup(jid: string): boolean {
  return jid in ALLOWED_GROUPS;
}

async function transcribeAudio(base64Audio: string, mimetype?: string): Promise<string | null> {
  const openaiKey = Deno.env.get("openai");
  if (!openaiKey) return null;

  try {
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mp4") ? "m4a" : "ogg";
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });
    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.text || null;
  } catch {
    return null;
  }
}

async function extractMessageText(message: any, data: any): Promise<string | null> {
  if (!message) return null;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return `[Imagem] ${message.imageMessage.caption}`;
  if (message.imageMessage) return "[Imagem]";
  if (message.videoMessage?.caption) return `[Vídeo] ${message.videoMessage.caption}`;
  if (message.videoMessage) return "[Vídeo]";
  if (message.audioMessage) {
    const base64 = message.base64 || data?.message?.base64 || message.audioMessage?.base64;
    if (base64) {
      const mimetype = message.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      const transcription = await transcribeAudio(base64, mimetype);
      if (transcription) return `[Áudio Transcrito] ${transcription}`;
    }
    return "[Áudio]";
  }
  if (message.documentMessage?.fileName) return `[Documento] ${message.documentMessage.fileName}`;
  if (message.documentMessage) return "[Documento]";
  if (message.stickerMessage) return "[Figurinha]";
  if (message.contactMessage) return "[Contato]";
  if (message.locationMessage) return "[Localização]";
  if (message.reactionMessage) return null;
  if (message.protocolMessage) return null;
  return null;
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

    const body = await req.json();
    console.log("Webhook received, event:", body.event, "| has data:", !!body.data);

    // ===== EVOLUTION API FORMAT =====
    if (body.event === "messages.upsert" && body.data) {
      const data = body.data;
      const key = data.key || {};
      const remoteJid = key.remoteJid || "";
      console.log("Processing message, remoteJid:", remoteJid, "| fromMe:", key.fromMe, "| pushName:", data.pushName);

      // Extract phone early to check if it's Alisson
      const isGroup = isGroupJid(remoteJid);
      const earlyPhone = isGroup
        ? (key.participant ? extractPhoneFromJid(key.participant) : null)
        : extractPhoneFromJid(remoteJid);
      const isAlisson = isKnownPhone(earlyPhone, ALISSON_PHONES);
      console.log("isGroup:", isGroup, "| earlyPhone:", earlyPhone, "| isAlisson:", isAlisson, "| isAllowedGroup:", isGroup && isAllowedGroup(remoteJid));

      // Allow Alisson's messages through even from non-whitelisted groups/DMs
      if (!isAlisson && (!isGroup || !isAllowedGroup(remoteJid))) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "group_not_allowed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fromMe = key.fromMe || false;
      const pushName = data.pushName || "";
      const messageTimestamp = data.messageTimestamp;

      let messageText = await extractMessageText(data.message, data);
      if (!messageText && data.messageBody) {
        messageText = data.messageBody;
      }

      if (messageText === null) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groupId = remoteJid;
      const phone = earlyPhone;

      const contactName = pushName || phone || "Desconhecido";
      const direction = detectDirection(fromMe, contactName);

      let receivedAt: string;
      if (messageTimestamp) {
        const ts = typeof messageTimestamp === "number"
          ? messageTimestamp
          : parseInt(messageTimestamp, 10);
        receivedAt = new Date(ts * 1000).toISOString();
      } else {
        receivedAt = new Date().toISOString();
      }

      const isAllowedSource = isGroup && isAllowedGroup(remoteJid);

      // Only insert into DB for whitelisted groups
      if (isAllowedSource) {
        // Auto-create group if not yet registered
        if (groupId) {
          const groupName = ALLOWED_GROUPS[groupId] || data.groupName || remoteJid;
          const { data: existingGroup } = await supabase
            .from("whatsapp_grupos")
            .select("id")
            .eq("group_id", groupId)
            .maybeSingle();

          if (!existingGroup) {
            await supabase.from("whatsapp_grupos").insert({
              group_id: groupId,
              nome: groupName,
            });
            console.log("Auto-created group:", groupId, groupName);
          }
        }

        // Insert conversation record
        const { data: insertedData, error: insertError } = await supabase
          .from("whatsapp_conversas")
          .insert({
            telefone: phone,
            nome_contato: contactName,
            mensagem: messageText,
            group_id: groupId,
            direcao: direction,
            status: "recebida",
            recebido_em: receivedAt,
            dados_extras: body,
          })
          .select();

        if (insertError) {
          console.error("Erro ao inserir:", insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // ===== ALISSON AI AUTO-REPLY =====
      console.log("Phone:", phone, "| isAlisson:", isAlisson, "| Message:", messageText?.substring(0, 50));
      if (isAlisson && messageText && shouldRespondToMessage(messageText)) {
        console.log("Alisson message detected, triggering AI reply...");
        handleAlissonAIReply(messageText, groupId, supabase).catch((err) =>
          console.error("Alisson AI reply error:", err)
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: 1, source: "evolution_api" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LEGACY N8N FORMAT =====
    const mensagens = Array.isArray(body) ? body : [body];
    const clean = (val: any) =>
      typeof val === "string" && val.startsWith("=") ? val.slice(1) : val;

    function detectDirectionLegacy(msg: any): string {
      const explicit = clean(msg.direcao || msg.direction);
      if (explicit && explicit !== "entrada" && explicit !== "") return explicit;
      const rawName = clean(msg.nome_contato || msg.name || msg.pushName) || "";
      const name = normalizeName(rawName);
      if (name && TEAM_MEMBERS.some((tm) => {
        const normalizedTm = tm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes(normalizedTm);
      })) {
        return "saida";
      }
      return "entrada";
    }

    const registros = mensagens.map((msg: any) => ({
      telefone: clean(msg.telefone || msg.phone || msg.from) || null,
      nome_contato: clean(msg.nome_contato || msg.name || msg.pushName) || null,
      mensagem: clean(msg.mensagem || msg.message || msg.text || msg.body) || null,
      group_id: clean(msg.group_id) || null,
      direcao: detectDirectionLegacy(msg),
      status: clean(msg.status) || "recebida",
      dados_extras: msg,
    }));

    const { data: legacyData, error: legacyError } = await supabase
      .from("whatsapp_conversas")
      .insert(registros)
      .select();

    if (legacyError) {
      console.error("Erro ao inserir (legacy):", legacyError);
      return new Response(JSON.stringify({ error: legacyError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: legacyData?.length || 0, source: "legacy" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
