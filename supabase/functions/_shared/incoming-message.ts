import { retainedWhatsAppEvent, retainedMessageText } from "./message-retention.ts";

export function incomingMessage(body: any) {
  if (body?.event !== "messages.upsert" || !body.data || Array.isArray(body.data)) return null;
  const data = body.data, key = data.key || {}, groupId = key.remoteJid;
  if (typeof groupId !== "string" || !/^\d+(?:-\d+)?@g\.us$/.test(groupId) || typeof key.id !== "string" || !key.id || key.id.length > 256) return null;
  const msg = data.message || {};
  if (msg.reactionMessage || msg.protocolMessage) return null;
  let text: string | null = typeof msg.conversation === "string" ? msg.conversation
    : typeof msg.extendedTextMessage?.text === "string" ? msg.extendedTextMessage.text
    : typeof data.messageBody === "string" ? data.messageBody : null;
  if (msg.audioMessage || data.messageType === "audioMessage") text = "[Áudio]";
  else if (msg.imageMessage || data.messageType === "imageMessage") text = "[Imagem]";
  else if (msg.videoMessage || data.messageType === "videoMessage") text = "[Vídeo]";
  else if (msg.documentMessage) text = "[Documento]";
  else if (msg.stickerMessage) text = "[Figurinha]";
  else if (msg.contactMessage || msg.contactsArrayMessage) text = "[Contato]";
  else if (msg.locationMessage || msg.liveLocationMessage) text = "[Localização]";
  if (!text) return null;
  const name = typeof data.pushName === "string" ? data.pushName : "";
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const team = ["alisson", "murilo", "murillo", "priscila", "priscilla", "thais", "netto", "jiza", "victor"];
  const stamp = Number(data.messageTimestamp);
  const time = Number.isFinite(stamp) && stamp > 0 ? new Date(stamp < 1e12 ? stamp * 1000 : stamp) : new Date();
  const metadata: any = retainedWhatsAppEvent(body);
  metadata._retention = { ...metadata._retention, received_by: "independent_panel",
    transcription_pending: Boolean(msg.audioMessage || data.messageType === "audioMessage") };
  return { providerId: key.id, row: {
    group_id: groupId, telefone: typeof key.participant === "string" ? key.participant.split("@")[0] : null,
    nome_contato: name || "Desconhecido", mensagem: retainedMessageText(text, body),
    direcao: key.fromMe || team.some(member => normalized.includes(member)) ? "saida" : "entrada",
    status: "recebida", recebido_em: Number.isFinite(time.getTime()) ? time.toISOString() : new Date().toISOString(),
    dados_extras: metadata,
  }};
}
export async function eventRowId(instance: string, group: string, message: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([instance, group, message]))));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes.slice(0, 16), v => v.toString(16).padStart(2, "0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
