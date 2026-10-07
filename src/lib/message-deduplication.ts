interface MessageIdentity { id: string; provider_id?: string | null; provider_fallback_id?: string | null; direcao?: string | null }
/** Never collapse messages just because their text is identical. Preserve independent sends. */
export function deduplicateMessages<T extends MessageIdentity>(messages: T[]): T[] {
  const ids = new Set<string>();
  return messages.filter(message => {
    const provider = message.provider_id || message.provider_fallback_id;
    const key = provider ? `provider:${provider}:${message.direcao || ""}` : `row:${message.id}`;
    if (ids.has(key)) return false;
    ids.add(key); return true;
  });
}
