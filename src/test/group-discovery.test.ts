import { describe, expect, it } from "vitest";
import { discoverGroups, isRecentGroup, isWhatsappGroupId, normalizeGroupSearch } from "@/lib/group-discovery";

const now = Date.parse("2026-10-03T12:00:00Z");
const day = 86400000;
describe("WhatsApp group discovery", () => {
  it("excludes registered groups and direct contacts, deduplicates IDs and strips private data", () => {
    const result = discoverGroups([
      { id: "123@g.us", subject: "Já cadastrado" },
      { id: "456@g.us", subject: " Clínica Ágil ", size: 5, creation: (now - day) / 1000, participants: [{ id: "private-phone" }], desc: "private-description" },
      { id: "456@g.us", subject: "Duplicado" },
      { id: "551234@s.whatsapp.net", subject: "Contato" },
    ], [{ remoteJid: "456@g.us", lastMessage: { messageTimestamp: now / 1000, message: { conversation: "private-message" } } }], ["123@g.us"], now);
    expect(result.registeredCount).toBe(1);
    expect(result.groups).toEqual([{ group_id: "456@g.us", nome: "Clínica Ágil", participants: 5, createdAt: new Date(now - day).toISOString(), lastMessageAt: new Date(now).toISOString() }]);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("keeps older groups and sorts using real creation or message dates", () => {
    const result = discoverGroups([
      { id: "1@g.us", subject: "Antigo", creation: (now - 90 * day) / 1000 },
      { id: "2@g.us", subject: "Novo", creation: (now - day) / 1000 },
      { id: "3@g.us", subject: "Antigo com mensagem", creation: (now - 100 * day) / 1000 },
    ], [{ remoteJid: "3@g.us", lastMessage: { messageTimestamp: now / 1000 } }], [], now);
    expect(result.groups.map(group => group.group_id)).toEqual(["3@g.us", "2@g.us", "1@g.us"]);
    expect(isRecentGroup(result.groups[0], now)).toBe(true);
    expect(isRecentGroup(result.groups[2], now)).toBe(false);
  });
  it("does not treat a contact update or group subject change as a message", () => {
    const result = discoverGroups([{ id: "1@g.us", subjectTime: now / 1000, creation: 0 }], [{ remoteJid: "1@g.us", updatedAt: new Date(now).toISOString() }], [], now);
    expect(result.groups[0].lastMessageAt).toBeNull();
    expect(result.groups[0].createdAt).toBeNull();
    expect(isRecentGroup(result.groups[0], now)).toBe(false);
  });
  it("handles malformed fields and unavailable activity without dropping valid groups", () => {
    const result = discoverGroups([null, { id: "1-2@g.us", subject: null, creation: Infinity, size: -3 }], null, [], now);
    expect(result.groups).toEqual([{ group_id: "1-2@g.us", nome: "Grupo sem nome", participants: null, createdAt: null, lastMessageAt: null }]);
    expect(() => discoverGroups({ error: "provider failed" }, [], [])).toThrow();
  });
  it("supports accent-insensitive search and only WhatsApp group destinations", () => {
    expect(normalizeGroupSearch("  ODONTOLOGÍA Ágil ")).toBe("odontologia agil");
    expect(isWhatsappGroupId("123@g.us")).toBe(true);
    expect(isWhatsappGroupId("123-456@g.us")).toBe(true);
    expect(isWhatsappGroupId("123@s.whatsapp.net")).toBe(false);
  });
});
