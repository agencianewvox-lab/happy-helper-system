import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors, authFailure } from "../_shared/staff-auth.ts";
import { validTeamInput, canManageTeam } from "../_shared/team-input.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: authCors });
  try {
    const ctx = await requireStaff(req);
    if (!canManageTeam(ctx.profile))
      return Response.json(
        { error: "Somente o Master pode criar acessos ou alterar perfis." },
        { status: 403, headers: authCors },
      );
    if (req.method !== "POST")
      return Response.json(
        { error: "Método inválido." },
        { status: 405, headers: authCors },
      );
    const body = await req.json();
    if (body.action === "update_role") {
      if (
        !/^[0-9a-f-]{36}$/i.test(String(body.profileId || "")) ||
        !["admin", "gestor", "social_media"].includes(body.role) ||
        !["admin", "gestor", "social_media"].includes(body.expectedRole)
      )
        return Response.json(
          { error: "Selecione uma pessoa e um perfil válido." },
          { status: 400, headers: authCors },
        );
      const { error } = await ctx.db.rpc("set_team_role", {
        p_profile_id: body.profileId,
        p_role: body.role,
        p_expected_role: body.expectedRole,
      });
      if (error)
        return Response.json(
          {
            error:
              "Não foi possível alterar. Atualize a lista; perfis Master são protegidos e outra pessoa pode ter alterado este acesso.",
          },
          { status: 409, headers: authCors },
        );
      return Response.json({ ok: true }, { headers: authCors });
    }
    const name = String(body.name || "").trim(),
      email = String(body.email || "")
        .trim()
        .toLowerCase();
    const password = String(body.password || ""),
      role = body.role;
    if (!validTeamInput(body))
      return Response.json(
        {
          error:
            "Informe nome, e-mail válido, perfil e senha entre 12 e 128 caracteres.",
        },
        { status: 400, headers: authCors },
      );
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: existing, error: lookupError } = await db
      .from("profiles")
      .select("full_name");
    if (lookupError) throw lookupError;
    if (
      existing?.some(
        (p) => p.full_name.trim().toLowerCase() === name.toLowerCase(),
      )
    )
      return Response.json(
        {
          error:
            "Já existe uma pessoa com esse nome. Utilize um nome completo distinto.",
        },
        { status: 409, headers: authCors },
      );
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error || !data.user)
      return Response.json(
        {
          error:
            "Não foi possível cadastrar. Verifique se o e-mail já possui acesso e a força da senha.",
        },
        { status: 400, headers: authCors },
      );
    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        { user_id: data.user.id, full_name: name, role, is_master: false },
        { onConflict: "user_id" },
      );
    if (profileError) {
      await db.auth.admin.updateUserById(data.user.id, {
        ban_duration: "876000h",
      });
      return Response.json(
        {
          error:
            "Cadastro não concluído. O acesso foi bloqueado por segurança; contate o administrador.",
        },
        { status: 503, headers: authCors },
      );
    }
    return Response.json({ ok: true }, { headers: authCors });
  } catch (e) {
    return authFailure(e);
  }
});
