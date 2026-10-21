export const PANEL = "https://paineldecontrole.newvox.site";
export const API =
  "https://gorqyovidpdvuockzndm.supabase.co/functions/v1/meetings-api";
export const VERSION = "1.1.0";
// Offscreen documents only expose chrome.runtime. Delegate storage to the trusted worker.
export const tokenStorage = () =>
  chrome.storage?.session || {
    get: () =>
      chrome.runtime.sendMessage({
        target: "offscreen-bridge",
        action: "credentials",
      }),
  };
export async function api(action, payload = {}, form) {
  const { credentials } = await tokenStorage().get("credentials");
  if (!credentials) throw new Error("Conecte a extensão pelo painel.");
  const response = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer nvm.${credentials.deviceId}.${credentials.secret}`,
      ...(form ? {} : { "Content-Type": "application/json" }),
    },
    body: form || JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(value.error || "Não foi possível sincronizar.");
    error.status = response.status;
    throw error;
  }
  return value;
}
export async function digest(text) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function parseMeetUrl(value) {
  try {
    const u = new URL(value);
    return u.origin === "https://meet.google.com" &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(u.pathname)
      ? u.pathname.slice(1).replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}
export function microphoneState(labels) {
  const states = labels
    .map((label) => {
      if (
        /^(desativar|desligar|turn off|mute) (o |your )?(microfone|microphone)/i.test(
          label,
        )
      )
        return false;
      if (
        /^(ativar|ligar|turn on|unmute) (o |your )?(microfone|microphone)/i.test(
          label,
        )
      )
        return true;
      return null;
    })
    .filter((value) => value !== null);
  return states.length === 1 ? states[0] : null;
}
