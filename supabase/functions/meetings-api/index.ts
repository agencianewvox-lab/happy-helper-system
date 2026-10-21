import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors } from "../_shared/staff-auth.ts";
import {
  chunkMeta,
  deviceToken,
  isWebm,
  MAX_AUDIO_BYTES,
  meetCode,
  meetingErrors,
  safeTitle,
  sha256,
  uuid,
} from "../_shared/meeting-model.ts";
import { extensionArchive } from "../_shared/meeting-extension-archive.ts";

const headers = {
  ...authCors,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};
const webActions = new Set([
  "bootstrap",
  "pair",
  "device_update",
  "detail",
  "review",
  "create_task",
  "retry",
  "finalize_partial",
  "download",
]);
const extensionActions = new Set([
  "bootstrap",
  "start",
  "heartbeat",
  "stop",
  "logout",
  "upload_chunk",
]);
function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
async function limitedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit)
    throw new Error("request_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    parts.push(value);
  }
  return new Blob(parts as BlobPart[]);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST")
    return Response.json(
      { error: "Método inválido." },
      { status: 405, headers },
    );
  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const bearer =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    if (!bearer) throw new Error("session_expired");
    let identity: {
        p_user?: string;
        p_session?: string;
        p_token_hash?: string;
      },
      deviceId: string | undefined;
    if (bearer.startsWith("nvm.")) {
      const token = deviceToken(bearer);
      deviceId = token.deviceId;
      identity = { p_token_hash: await sha256(token.secret) };
    } else {
      const { user } = await requireStaff(req);
      const claims = JSON.parse(
        atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      identity = { p_user: user.id, p_session: uuid(claims.session_id) };
    }
    const actor = check(await service.rpc("meeting_actor", identity));
    if (deviceId && actor.deviceId !== deviceId)
      throw new Error("session_expired");
    const command = async (
      action: string,
      payload: Record<string, unknown> = {},
    ) =>
      check(
        await service.rpc("meeting_command", {
          p_action: action,
          p_payload: payload,
          ...identity,
        }),
      );
    const multipart = req.headers
      .get("content-type")
      ?.startsWith("multipart/form-data");
    if (multipart) {
      if (!deviceId) throw new Error("forbidden");
      const raw = await limitedBody(req, MAX_AUDIO_BYTES + 32768);
      const form = await new Response(raw, {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      if (form.get("action") !== "upload_chunk")
        throw new Error("invalid_action");
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("invalid_chunk");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isWebm(bytes)) throw new Error("invalid_audio");
      const meta = chunkMeta(Object.fromEntries(form)),
        meetingId = uuid(form.get("meetingId")),
        contentHash = await sha256(bytes);
      const reservation = await command("reserve_chunk", {
        meetingId,
        ...meta,
        contentHash,
        sizeBytes: bytes.length,
      });
      if (!reservation.uploaded) {
        const upload = await service.storage
          .from("meeting-audio")
          .upload(reservation.path, bytes, {
            contentType: "audio/webm",
            upsert: false,
          });
        if (
          upload.error &&
          !["409", "Duplicate"].includes(
            String(
              (upload.error as { statusCode?: string; error?: string })
                .statusCode || (upload.error as { error?: string }).error,
            ),
          )
        )
          throw new Error("audio_storage_failed");
        await command("commit_chunk", {
          meetingId,
          seq: meta.seq,
          contentHash,
        });
      }
      return Response.json({ ok: true }, { headers });
    }
    const body = JSON.parse(await (await limitedBody(req, 32768)).text());
    const action = body.action,
      payload = body.payload || {};
    if (typeof payload !== "object" || Array.isArray(payload))
      throw new Error("invalid_body");
    if (!(deviceId ? extensionActions : webActions).has(action))
      throw new Error("forbidden");
    if (action === "start") {
      payload.clientId = uuid(payload.clientId);
      payload.requestId = uuid(payload.requestId);
      payload.title = safeTitle(payload.title);
      payload.meetCode = meetCode(payload.meetCode);
      if (payload.consent !== true) throw new Error("consent_required");
    }
    if (action === "pair") {
      uuid(payload.deviceId);
      if (
        !/^[0-9a-f]{64}$/.test(payload.challenge || "") ||
        !payload.label ||
        payload.label.length > 100
      )
        throw new Error("invalid_pair");
    }
    const result = await command(action, payload);
    if (action === "download")
      return new Response(
        Uint8Array.from(atob(extensionArchive), (c) => c.charCodeAt(0)),
        {
          headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
            "Content-Disposition":
              'attachment; filename="newvox-reunioes-1.0.0.zip"',
          },
        },
      );
    return Response.json(
      deviceId && action === "bootstrap"
        ? { actor: result.actor, clients: result.clients }
        : result,
      { headers },
    );
  } catch (error) {
    if (error instanceof Response)
      return new Response(error.body, { status: error.status, headers });
    const code = String(
      (error as { message?: string })?.message || "unexpected_error",
    );
    const status =
      code === "session_expired" || code === "invalid_device_session"
        ? 401
        : [
              "forbidden",
              "device_pending",
              "device_revoked",
              "wrong_client",
            ].includes(code)
          ? 403
          : ["active_meeting", "version_conflict", "recording_closed"].includes(
                code,
              )
            ? 409
            : 400;
    const message =
      meetingErrors[code] ||
      (code.startsWith("invalid_")
        ? "Solicitação inválida. Confira os campos."
        : code === "review_required"
          ? "Revise os alinhamentos antes de criar tarefas."
          : code === "audio_expired"
            ? "O áudio temporário expirou. Não é possível transcrevê-lo novamente."
            : code === "recording_closed"
              ? "O registro já foi encerrado. Confira o histórico no painel."
              : "Não foi possível concluir a operação. Tente novamente; se persistir, avise o Master.");
    return Response.json(
      {
        error: message,
        code: Object.hasOwn(meetingErrors, code) ? code : undefined,
      },
      { status, headers },
    );
  }
});
