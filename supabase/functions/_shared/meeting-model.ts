export const MEETING_VERSION = "1.0.0";
export const MAX_CHUNKS = 240;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const SESSION_HOURS = 8;
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("invalid_id");
  return value;
}
export function meetCode(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_meet");
  const match = value.match(
    /^(?:https:\/\/meet\.google\.com\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/,
  );
  if (!match) throw new Error("invalid_meet");
  return match[1];
}
export function safeTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160)
    throw new Error("invalid_title");
  return value.trim();
}
export function chunkMeta(value: Record<string, unknown>) {
  if (
    [value.seq, value.durationMs, value.offsetMs].some(
      (v) =>
        v === null || v === undefined || v === "" || typeof v === "boolean",
    )
  )
    throw new Error("invalid_chunk");
  const seq = Number(value.seq),
    duration = Number(value.durationMs),
    offset = Number(value.offsetMs);
  if (
    !Number.isInteger(seq) ||
    seq < 0 ||
    seq >= MAX_CHUNKS ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 75000 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 4 * 3600000
  )
    throw new Error("invalid_chunk");
  return { seq, durationMs: duration, offsetMs: offset };
}
export function isWebm(bytes: Uint8Array) {
  return (
    bytes.length > 32 &&
    bytes.length <= MAX_AUDIO_BYTES &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}
export async function sha256(value: string | Uint8Array) {
  const buffer =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", buffer as BufferSource),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function deviceToken(value: string) {
  const match = value.match(/^nvm\.([0-9a-f-]{36})\.([0-9a-f]{64})$/i);
  if (!match) throw new Error("invalid_device_session");
  return { deviceId: uuid(match[1]), secret: match[2] };
}
export function completeChunks(
  chunks: { seq: number; status: string }[],
  expected: number | null,
): boolean {
  return (
    expected !== null &&
    expected > 0 &&
    expected <= MAX_CHUNKS &&
    chunks.length === expected &&
    [...chunks]
      .sort((a, b) => a.seq - b.seq)
      .every((c, i) => c.seq === i && c.status === "done")
  );
}
export const meetingErrors: Record<string, string> = {
  forbidden: "Acesso permitido somente ao Master e aos gestores autorizados.",
  session_expired:
    "Sessão encerrada. Conecte a extensão novamente pelo painel.",
  device_pending:
    "Este dispositivo aguarda aprovação do Master em Reuniões → Dispositivos.",
  device_revoked:
    "Dispositivo bloqueado pelo Master. Solicite a liberação no painel.",
  wrong_client: "Você não tem acesso a esse cliente ou ele foi arquivado.",
  active_meeting:
    "Já existe um registro ativo nesta sala ou neste dispositivo. Confira Reuniões antes de continuar.",
  version_conflict:
    "O registro mudou. Atualize a tela antes de salvar novamente.",
  incomplete_audio:
    "Há trechos pendentes. Abra a extensão e conclua a sincronização.",
  no_audio:
    "Nenhum trecho de áudio foi recebido. Este registro não pode ser transcrito.",
  quota_exceeded:
    "Limite de segurança atingido: até 4 horas por reunião e 8 horas por usuário/dia.",
};
