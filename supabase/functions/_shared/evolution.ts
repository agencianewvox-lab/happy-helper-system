// Central helper for sending WhatsApp messages via Evolution API.
// Replaces all previous n8n webhook plumbing.

const EVOLUTION_BASE_URL = "https://bot-evolution-api.1lxz8u.easypanel.host";
const EVOLUTION_INSTANCE = "financeiro new vox"; // encoded on-the-fly

export interface SendResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Send a WhatsApp text message via Evolution API.
 * @param number Destination — can be a group_id (ends in @g.us), a raw phone (55DDD9XXXXYYYY) or a JID.
 * @param text Message body.
 */
export async function sendWhatsApp(number: string, text: string): Promise<SendResult> {
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!apiKey) {
    console.error("[evolution] EVOLUTION_API_KEY not configured");
    return { ok: false, status: 500, body: "EVOLUTION_API_KEY not configured" };
  }
  if (!number || !text) {
    return { ok: false, status: 400, body: "number and text are required" };
  }

  const url = `${EVOLUTION_BASE_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number,
        text,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[evolution] Send failed ${res.status} to ${number}:`, body);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[evolution] Fetch threw for ${number}:`, msg);
    return { ok: false, status: 0, body: msg };
  }
}

/**
 * Look up a team member's phone from the profiles table by first-name variants.
 * Returns null if not found or missing telefone.
 */
export async function lookupTeamPhone(
  supabase: any,
  nameVariants: string[],
): Promise<string | null> {
  for (const variant of nameVariants) {
    const { data } = await supabase
      .from("profiles")
      .select("telefone")
      .eq("full_name", variant)
      .maybeSingle();
    if (data?.telefone) return String(data.telefone);
  }
  return null;
}
