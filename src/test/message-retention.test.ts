import { describe, expect, it } from "vitest";
import { retainedMessageText, retainedWhatsAppEvent } from "../../supabase/functions/_shared/message-retention";

describe("WhatsApp retention: audio, text and metadata only", () => {
  it.each(["imageMessage", "videoMessage"])("drops %s binary and credentials, keeping its event identity", (type) => {
    const event = { event: "messages.upsert", instance: "test", apikey: "PRIVATE_API_KEY", data: { key: { id: "event-1", remoteJid: "fixture@g.us", fromMe: false }, pushName: "Pessoa", messageType: type, messageTimestamp: 123, message: { [type]: { caption: "Legenda", jpegThumbnail: "PRIVATE_THUMBNAIL" }, base64: "PRIVATE_IMAGE" } } };
    const kept = retainedWhatsAppEvent(event);
    expect(JSON.stringify(kept)).not.toContain("PRIVATE_");
    expect(kept.data).toMatchObject({ key: { id: "event-1", remoteJid: "fixture@g.us", fromMe: false }, pushName: "Pessoa", messageType: type });
    expect(retainedMessageText("Legenda", event)).toBe(type === "imageMessage" ? "[Imagem]" : "[Vídeo]");
  });
  it("keeps audio bytes and transcription but not a quoted image or webhook key", () => {
    const event = { apikey: "PRIVATE_KEY", data: { key: { id: "audio-1" }, messageType: "audioMessage", message: { base64: "AUDIO_BYTES", audioMessage: { mimetype: "audio/ogg", seconds: 12, ptt: true, contextInfo: { quotedMessage: { imageMessage: { jpegThumbnail: "PRIVATE_IMAGE" } } } } } } };
    const kept = retainedWhatsAppEvent(event);
    expect(kept.data).toMatchObject({ message: { base64: "AUDIO_BYTES", audioMessage: { mimetype: "audio/ogg", seconds: 12, ptt: true } } });
    expect(JSON.stringify(kept)).not.toContain("PRIVATE_");
    expect(retainedMessageText("[Áudio Transcrito] Precisamos conversar", event)).toBe("[Áudio Transcrito] Precisamos conversar");
  });
  it("does not pretend an audio file exists when only its metadata was received", () => {
    const kept = retainedWhatsAppEvent({ data: { message: { audioMessage: { mimetype: "audio/ogg" } } } });
    expect(kept._retention).toMatchObject({ binary_audio_present: false });
    expect(retainedMessageText("[Áudio]", {})).toBe("[Áudio]");
  });
  it("supports audio bytes nested in the audio object and sanitizes legacy image captions", () => {
    const kept = retainedWhatsAppEvent({ key: { id: "legacy" }, message: { audioMessage: { base64: "AUDIO_BYTES" } } });
    expect(kept.data).toMatchObject({ key: { id: "legacy" }, message: { base64: "AUDIO_BYTES" } });
    expect(retainedMessageText("[Imagem] legenda antiga", {})).toBe("[Imagem]");
    expect(retainedMessageText("Mensagem normal", {})).toBe("Mensagem normal");
  });
  it.each(["root", "data"])("preserves audio bytes from the %s envelope", (location) => {
    const event = { data: { messageType: "audioMessage", message: { audioMessage: { seconds: 5 } }, ...(location === "data" ? { base64: "AUDIO_BYTES" } : {}) }, ...(location === "root" ? { base64: "AUDIO_BYTES" } : {}) };
    expect(retainedWhatsAppEvent(event).data).toMatchObject({ message: { base64: "AUDIO_BYTES" } });
  });
  it("drops documents and other non-audio attachments while preserving their text label", () => {
    const event = { data: { messageType: "documentMessage", message: { documentMessage: { fileName: "Arquivo.pdf", url: "PRIVATE_URL" }, base64: "PRIVATE_DOCUMENT" } } };
    expect(JSON.stringify(retainedWhatsAppEvent(event))).not.toContain("PRIVATE_");
    expect(retainedMessageText("[Documento] Arquivo.pdf", event)).toBe("[Documento] Arquivo.pdf");
  });
  it("does not change the input event used by the message processor", () => {
    const event = { data: { messageType: "imageMessage", message: { imageMessage: { caption: "Legenda" }, base64: "PRIVATE_IMAGE" } } };
    const original = JSON.stringify(event);
    retainedWhatsAppEvent(event);
    retainedMessageText("[Imagem] Legenda", event);
    expect(JSON.stringify(event)).toBe(original);
  });
});
