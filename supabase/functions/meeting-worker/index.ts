import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  requireMasterOrService,
  authCors,
  authFailure,
} from "../_shared/staff-auth.ts";
import { processMeetings } from "../_shared/meeting-worker.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: authCors });
  if (req.method !== "POST")
    return new Response(null, { status: 405, headers: authCors });
  try {
    await requireMasterOrService(req);
    const key = Deno.env.get("openai") || Deno.env.get("OPENAI_API_KEY");
    if (!key)
      return Response.json(
        { error: "transcription_not_configured" },
        { status: 503, headers: authCors },
      );
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    return Response.json(await processMeetings(db, key), { headers: authCors });
  } catch (e) {
    return authFailure(e);
  }
});
