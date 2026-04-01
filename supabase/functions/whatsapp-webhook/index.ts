import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Nomes do time New Vox — mensagens desses contatos são "saida"
const TEAM_MEMBERS = [
  "jader",
  "alisson", "alisson lima",
  "murilo", "murillo", "murilo araújo",
  "priscila", "priscilla", "priscila borges", "priscilla borges",
  "joel", "joel reis",
  "thais", "thaís", "~thais",
  "daniella",
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

function extractMessageText(message: any): string | null {
  if (!message) return null;
  // Text messages
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  // Media with caption
  if (message.imageMessage?.caption) return `[Imagem] ${message.imageMessage.caption}`;
  if (message.imageMessage) return "[Imagem]";
  if (message.videoMessage?.caption) return `[Vídeo] ${message.videoMessage.caption}`;
  if (message.videoMessage) return "[Vídeo]";
  if (message.audioMessage) return "[Áudio]";
  if (message.documentMessage?.fileName) return `[Documento] ${message.documentMessage.fileName}`;
  if (message.documentMessage) return "[Documento]";
  if (message.stickerMessage) return "[Figurinha]";
  if (message.contactMessage) return "[Contato]";
  if (message.locationMessage) return "[Localização]";
  if (message.reactionMessage) return null; // Ignore reactions
  if (message.protocolMessage) return null; // Ignore protocol messages
  // Fallback: try messageBody if present at data level
  return null;
}

function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  // Format: 5511999999999@s.whatsapp.net or 120363xxx@g.us
  const match = jid.match(/^(\d+)@/);
  return match ? match[1] : null;
}

function isGroupJid(jid: string): boolean {
  return jid?.endsWith("@g.us") || false;
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
    console.log("Webhook received, event:", body.event);

    // ===== EVOLUTION API FORMAT =====
    // Payload: { event: "messages.upsert", data: { key: {...}, message: {...}, pushName: "..." }, ... }
    if (body.event === "messages.upsert" && body.data) {
      const data = body.data;
      const key = data.key || {};
      const remoteJid = key.remoteJid || "";
      const fromMe = key.fromMe || false;
      const pushName = data.pushName || "";
      const messageTimestamp = data.messageTimestamp;

      // Extract message text
      let messageText = extractMessageText(data.message);
      // Fallback to messageBody if available (some Evolution API versions)
      if (!messageText && data.messageBody) {
        messageText = data.messageBody;
      }

      // Skip if no meaningful content (reactions, protocol messages, etc.)
      if (messageText === null) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isGroup = isGroupJid(remoteJid);
      const groupId = isGroup ? remoteJid : null;
      const phone = isGroup
        ? (key.participant ? extractPhoneFromJid(key.participant) : null)
        : extractPhoneFromJid(remoteJid);

      const contactName = pushName || phone || "Desconhecido";
      const direction = detectDirection(fromMe, contactName);

      // Build timestamp from messageTimestamp (unix epoch)
      let receivedAt: string;
      if (messageTimestamp) {
        const ts = typeof messageTimestamp === "number"
          ? messageTimestamp
          : parseInt(messageTimestamp, 10);
        receivedAt = new Date(ts * 1000).toISOString();
      } else {
        receivedAt = new Date().toISOString();
      }

      // Auto-create group if it's a group message
      if (isGroup && groupId) {
        // Extract group name from data if available, otherwise use groupId
        const groupName = data.groupName || data.instanceData?.groupName || remoteJid;

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

      return new Response(
        JSON.stringify({ success: true, count: insertedData?.length || 1, source: "evolution_api" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LEGACY N8N FORMAT (backward compatible) =====
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
