import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

/**
 * Transcribe audio using OpenAI Whisper API.
 * Accepts base64-encoded audio data.
 */
async function transcribeAudio(base64Audio: string, mimetype?: string): Promise<string | null> {
  const openaiKey = Deno.env.get("openai");
  if (!openaiKey) {
    console.error("OpenAI API key not configured (secret name: 'openai')");
    return null;
  }

  try {
    // Decode base64 to binary
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Determine file extension from mimetype
    const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mp4") ? "m4a" : "ogg";
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });

    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Whisper API error:", response.status, errText);
      return null;
    }

    const result = await response.json();
    return result.text || null;
  } catch (err) {
    console.error("Audio transcription error:", err);
    return null;
  }
}

/**
 * Extract message text from Evolution API message object.
 * For audio messages with base64 data, attempts transcription.
 */
async function extractMessageText(message: any, data: any): Promise<string | null> {
  if (!message) return null;

  // Text messages
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;

  // Image with caption
  if (message.imageMessage?.caption) return `[Imagem] ${message.imageMessage.caption}`;
  if (message.imageMessage) return "[Imagem]";

  // Video
  if (message.videoMessage?.caption) return `[Vídeo] ${message.videoMessage.caption}`;
  if (message.videoMessage) return "[Vídeo]";

  // Audio — attempt transcription if base64 is available
  if (message.audioMessage) {
    const base64 = message.base64 || data?.message?.base64 || message.audioMessage?.base64;
    if (base64) {
      const mimetype = message.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      console.log("Attempting audio transcription...");
      const transcription = await transcribeAudio(base64, mimetype);
      if (transcription) {
        console.log("Transcription successful:", transcription.substring(0, 50) + "...");
        return `[Áudio Transcrito] ${transcription}`;
      }
      console.log("Transcription failed, falling back to [Áudio]");
    } else {
      console.log("No base64 data for audio message, storing as [Áudio]");
    }
    return "[Áudio]";
  }

  // Other media types
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
    console.log("Webhook received, event:", body.event);

    // ===== EVOLUTION API FORMAT =====
    if (body.event === "messages.upsert" && body.data) {
      const data = body.data;
      const key = data.key || {};
      const remoteJid = key.remoteJid || "";

      // Ignorar mensagens que NÃO são de grupos permitidos
      const isGroup = isGroupJid(remoteJid);
      if (!isGroup || !isAllowedGroup(remoteJid)) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "group_not_allowed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fromMe = key.fromMe || false;
      const pushName = data.pushName || "";
      const messageTimestamp = data.messageTimestamp;

      // Extract message text (now async for audio transcription)
      let messageText = await extractMessageText(data.message, data);
      if (!messageText && data.messageBody) {
        messageText = data.messageBody;
      }

      // Skip if no meaningful content
      if (messageText === null) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groupId = remoteJid;
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
