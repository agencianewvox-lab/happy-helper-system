type ObjectData = Record<string, unknown>;
const object = (value: unknown): ObjectData => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectData : {};
function pick(value: ObjectData, keys: string[]): ObjectData {
  return Object.fromEntries(keys.filter(key => value[key] != null).map(key => [key, value[key]]));
}

/** Persistence boundary: keep operational metadata and audio, never full webhook secrets/media. */
export function retainedWhatsAppEvent(payload: unknown): ObjectData {
  const root = object(payload);
  const data = Object.keys(object(root.data)).length ? object(root.data) : root;
  const message = object(data.message);
  const audio = object(message.audioMessage);
  const isAudio = Object.keys(audio).length > 0 || data.messageType === "audioMessage";
  const safe = pick(root, ["event", "instance", "sender", "date_time"]);
  const safeData = pick(data, ["messageTimestamp", "messageType", "pushName", "source", "status", "instanceId"]);
  safeData.key = pick(object(data.key), ["id", "remoteJid", "remoteJidAlt", "fromMe", "participant", "participantAlt", "addressingMode"]);
  if (isAudio) {
    const audioMetadata = pick(audio, ["mimetype", "seconds", "ptt", "fileLength", "url", "directPath", "fileSha256", "fileEncSha256", "mediaKey", "mediaKeyTimestamp"]);
    const base64 = [message.base64, data.base64, root.base64, audio.base64].find(value => typeof value === "string" && value.length > 0);
    safeData.message = { audioMessage: audioMetadata, ...(base64 ? { base64 } : {}) };
  }
  safe.data = safeData;
  safe._retention = { policy: "audio_text_metadata_v2", binary_audio_present: Boolean(object(safeData.message).base64), non_audio_media_stored: false };
  return safe;
}

/** Preserve audio transcription; images/videos become labels, without media captions. */
export function retainedMessageText(text: string | null, payload: unknown): string | null {
  const root = object(payload);
  const data = Object.keys(object(root.data)).length ? object(root.data) : root;
  const message = object(data.message);
  if (message.imageMessage || data.messageType === "imageMessage" || /^\[Imagem\](\s|$)/i.test(text || "")) return "[Imagem]";
  if (message.videoMessage || data.messageType === "videoMessage" || /^\[Vídeo\](\s|$)/i.test(text || "")) return "[Vídeo]";
  return text;
}
