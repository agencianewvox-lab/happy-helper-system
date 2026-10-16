import { authCors, authFailure, requireStaff } from "../_shared/staff-auth.ts";
import { getEffectiveMessageTime, requiresResponse } from "../../../src/lib/clientMonitoring.ts";

const headers = { ...authCors, "Cache-Control": "private, no-store", "Pragma": "no-cache" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return Response.json({ error: "Método inválido." }, { status: 405, headers });
  try {
    const { db } = await requireStaff(req);
    const body = await req.json();
    if (body.action === "stats") {
      // Aggregate behind the authenticated server boundary; never download the history into cards.
      const all: { group_id: string; mensagem: string | null; created_at: string; recebido_em: string; direcao: string | null; id: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await db.from("whatsapp_conversas").select("id,group_id,mensagem,created_at,recebido_em,direcao").order("id").range(offset, offset + 999);
        if (page.error) throw new Error("Não foi possível atualizar os indicadores.");
        all.push(...(page.data || []));
        if ((page.data?.length ?? 0) < 1000) break;
        if (all.length >= 100000) throw new Error("Volume de histórico excedido. Os indicadores precisam de consolidação.");
      }
      all.sort((a,b) => getEffectiveMessageTime(a.created_at,a.recebido_em).localeCompare(getEffectiveMessageTime(b.created_at,b.recebido_em)) || a.id.localeCompare(b.id));
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const start = new Date(today + "T00:00:00-03:00").toISOString();
      const stats: Record<string, { count: number; todayCount: number; last_msg: string | null; last_time: string | null; last_direcao: string | null; last_client_time: string | null; actionable_waiting_since: string | null }> = {};
      for (const row of all) {
        if (!row.group_id) continue;
        const s = stats[row.group_id] ||= { count: 0, todayCount: 0, last_msg: null, last_time: null, last_direcao: null, last_client_time: null, actionable_waiting_since: null };
        const time = getEffectiveMessageTime(row.created_at,row.recebido_em);
        s.count++; if (time >= start) s.todayCount++;
        s.last_msg = row.mensagem; s.last_time = time; s.last_direcao = row.direcao;
        if (row.direcao === "entrada") { s.last_client_time = time; if (requiresResponse(row.mensagem)) s.actionable_waiting_since = time; }
        if (row.direcao === "saida") s.actionable_waiting_since = null;
      }
      return Response.json(stats, { headers });
    }
    const { data, error } = await db.rpc("client_workspace_api", { action: body.action, client: body.clientId || null, payload: body.payload || {} });
    if (error) {
      // Only controlled database errors may be displayed; never serialize request bodies or SQL details.
      const safe = ["P0001", "40001", "42501"].includes(error.code) ? error.message : "Não foi possível salvar. Confira os campos e tente novamente.";
      return Response.json({ error: safe }, { status: error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400, headers });
    }
    return Response.json(data, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SyntaxError) return Response.json({ error: "Solicitação inválida." }, { status: 400, headers });
    return authFailure(error);
  }
});
