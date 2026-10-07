import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { incomingMessage, eventRowId } from "../../supabase/functions/_shared/incoming-message";
const event = (message: object, extra: object = {}) => ({
 event: "messages.upsert", instance: "voxi_executivo_d13a86fd", apikey: "must-not-persist",
 data: { key: { id: "provider-1", remoteJid: "120363000000@g.us", participant: "551100000000@s.whatsapp.net" },
 pushName: "Cliente", messageTimestamp: 1791399000, message, ...extra },
});
describe("independent WhatsApp receiver", () => {
 it("keeps normal group text and provider metadata, excluding credentials", () => {
  const result = incomingMessage(event({ conversation: "Mensagem de validação" }))!;
  expect(result.row.mensagem).toBe("Mensagem de validação");
  expect(result.row.direcao).toBe("entrada");
  expect(JSON.stringify(result.row)).not.toContain("must-not-persist");
  expect(result.row.dados_extras.data.key.id).toBe("provider-1");
 });
 it("does not ingest private chats", () => {
  const value=event({conversation:"privado"}); value.data.key.remoteJid="551100000000@s.whatsapp.net";
  expect(incomingMessage(value)).toBeNull();
 });
 it.each(["reactionMessage","protocolMessage"])("ignores %s", kind => {
  expect(incomingMessage(event({[kind]:{}}))).toBeNull();
 });
 it.each([["imageMessage","[Imagem]"],["videoMessage","[Vídeo]"]])("never stores %s bytes or captions", (kind,label) => {
  const result=incomingMessage(event({[kind]:{caption:"caption",base64:"private-media"},base64:"private-media"},{messageType:kind}))!;
  expect(result.row.mensagem).toBe(label);
  expect(JSON.stringify(result.row)).not.toContain("private-media");
  expect(JSON.stringify(result.row)).not.toContain("caption");
 });
 it("retains audio while recording that transcription is pending", () => {
  const result=incomingMessage(event({audioMessage:{mimetype:"audio/ogg",seconds:3},base64:"YXVkaW8="},{messageType:"audioMessage"}))!;
  expect(result.row.dados_extras.data.message.base64).toBe("YXVkaW8=");
  expect(result.row.dados_extras._retention.transcription_pending).toBe(true);
 });
 it("handles both timestamp precisions", () => {
  const seconds=incomingMessage(event({conversation:"a"}))!;
  const millis=incomingMessage(event({conversation:"a"},{messageTimestamp:1791399000000}))!;
  expect(seconds.row.recebido_em).toBe(millis.row.recebido_em);
 });
 it("rejects events without a stable provider ID", () => {
  const value=event({conversation:"a"}); value.data.key.id="";
  expect(incomingMessage(value)).toBeNull();
 });
 it("produces stable UUIDs for retries and different IDs for different groups", async () => {
  Object.defineProperty(globalThis.crypto,"subtle",{value:webcrypto.subtle,configurable:true});
  const id=await eventRowId("instance","group-a","provider");
  expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(await eventRowId("instance","group-a","provider")).toBe(id);
  expect(await eventRowId("instance","group-b","provider")).not.toBe(id);
 });
});
