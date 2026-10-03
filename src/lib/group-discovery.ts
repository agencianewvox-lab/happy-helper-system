export interface DiscoveredGroup {
  group_id: string;
  nome: string;
  createdAt: string | null;
  lastMessageAt: string | null;
  participants: number | null;
}

export interface GroupDiscovery {
  groups: DiscoveredGroup[];
  checkedAt: string;
  activityAvailable: boolean;
  registeredCount: number;
}

export function isWhatsappGroupId(value: string) {
  return /^\d+(?:-\d+)?@g\.us$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function timestamp(value: unknown, now: number): string | null {
  let time: number;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const number = Number(value);
    time = number < 1e12 ? number * 1000 : number;
  } else if (typeof value === "string") {
    time = Date.parse(value);
  } else {
    return null;
  }
  return Number.isFinite(time) && time > 0 && time <= now + 300_000 ? new Date(time).toISOString() : null;
}

// Return only group metadata, never participants' numbers, message text or API credentials.
export function discoverGroups(rawGroups: unknown, rawChats: unknown, registeredIds: string[], now = Date.now()) {
  if (!Array.isArray(rawGroups)) throw new Error("INVALID_GROUP_LIST");
  const registered = new Set(registeredIds);
  const activity = new Map<string, string>();
  if (Array.isArray(rawChats)) {
    for (const rawChat of rawChats) {
      const chat = asRecord(rawChat);
      if (typeof chat.remoteJid !== "string" || !isWhatsappGroupId(chat.remoteJid)) continue;
      const latest = timestamp(asRecord(chat.lastMessage).messageTimestamp, now);
      if (latest && (!activity.has(chat.remoteJid) || latest > activity.get(chat.remoteJid)!)) {
        activity.set(chat.remoteJid, latest);
      }
    }
  }
  const groups = new Map<string, DiscoveredGroup>();
  let registeredCount = 0;
  const seen = new Set<string>();
  for (const rawGroup of rawGroups) {
    const group = asRecord(rawGroup);
    if (typeof group.id !== "string" || !isWhatsappGroupId(group.id) || seen.has(group.id)) continue;
    seen.add(group.id);
    if (registered.has(group.id)) {
      registeredCount++;
      continue;
    }
    groups.set(group.id, {
      group_id: group.id,
      nome: typeof group.subject === "string" && group.subject.trim() ? group.subject.trim() : "Grupo sem nome",
      createdAt: timestamp(group.creation, now),
      lastMessageAt: activity.get(group.id) ?? null,
      participants: typeof group.size === "number" && Number.isInteger(group.size) && group.size >= 0 ? group.size : null,
    });
  }
  const recency = (group: DiscoveredGroup) => Math.max(Date.parse(group.createdAt ?? "") || 0, Date.parse(group.lastMessageAt ?? "") || 0);
  return {
    groups: [...groups.values()].sort((a, b) => recency(b) - recency(a) || a.nome.localeCompare(b.nome, "pt-BR")),
    registeredCount,
  };
}

export function isRecentGroup(group: DiscoveredGroup, now = Date.now()) {
  const cutoff = now - 30 * 86400000;
  return [group.createdAt, group.lastMessageAt].some((value) => value !== null && Date.parse(value) >= cutoff);
}

export function normalizeGroupSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
