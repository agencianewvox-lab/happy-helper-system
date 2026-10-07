const base = "https://bot-evolution-api.1lxz8u.easypanel.host";
export function reportInstance(userId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error("Usuário inválido.");
  return "painel_relatorios_" + userId.replaceAll("-", "");
}
export async function evolutionReport(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) throw new Error("Evolution não configurada.");
  const r = await fetch(base + path, {
    method,
    headers: { apikey: key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw new Error("Resposta inválida da Evolution.");
  }
  if (!r.ok) throw new Error("Evolution indisponível (" + r.status + ").");
  return data;
}
export async function connectionState(userId: string) {
  const instance = reportInstance(userId),
    data = await evolutionReport("/instance/connectionState/" + instance);
  return { status: data.instance?.state === "open" ? "open" : "disconnected" };
}
export async function verifyReportGroup(userId: string, groupId: string) {
  if (!/^\d+(?:-\d+)?@g\.us$/.test(groupId))
    throw new Error("Grupo WhatsApp não vinculado.");
  const state = await connectionState(userId);
  if (state.status !== "open")
    throw new Error("WhatsApp do remetente desconectado.");
  const groups = await evolutionReport(
    "/group/fetchAllGroups/" +
      reportInstance(userId) +
      "?getParticipants=false",
  );
  if (!Array.isArray(groups) || !groups.some((g) => g.id === groupId))
    throw new Error("O WhatsApp do remetente não participa deste grupo.");
}
export async function dispatchReport(
  userId: string,
  groupId: string,
  text: string,
) {
  await verifyReportGroup(userId, groupId);
  // No automatic retry after starting the provider request: timeouts may hide a successful send.
  try {
    const data = await evolutionReport(
      "/message/sendText/" + reportInstance(userId),
      "POST",
      { number: groupId, text },
    );
    const id = data.key?.id;
    return id
      ? { status: "accepted", id }
      : {
          status: "uncertain",
          error:
            "Evolution respondeu sem identificador da mensagem. Confira o grupo antes de reenviar.",
        };
  } catch {
    return {
      status: "uncertain",
      error:
        "Não foi possível confirmar o envio. Confira o grupo antes de reenviar.",
    };
  }
}
