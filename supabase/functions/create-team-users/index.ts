import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.97.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (profile && profile.role !== "admin") {
        return new Response(JSON.stringify({ error: "Not admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  const users = [
    { email: "mads.gestao@gmail.com", password: "14253117nv", full_name: "Murillo", role: "gestor" },
    { email: "adolfo_cassitas@hotmail.com", password: "14253117nv", full_name: "Netto", role: "gestor" },
    { email: "jadercostaads@gmail.com", password: "14253117nv", full_name: "Jader", role: "gestor" },
  ];

  // Also ensure existing admin user has a profile
  const results = [];

  for (const u of users) {
    // Create user with auto-confirm
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });

    if (createError) {
      // User might already exist
      if (createError.message.includes("already been registered")) {
        // Get user by email
        const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = existingUsers?.find((eu: any) => eu.email === u.email);
        if (existing) {
          // Ensure profile exists
          await supabaseAdmin.from("profiles").upsert({
            user_id: existing.id,
            full_name: u.full_name,
            role: u.role,
          }, { onConflict: "user_id" });
          results.push({ email: u.email, status: "already_exists", profile: "ensured" });
        }
        continue;
      }
      results.push({ email: u.email, error: createError.message });
      continue;
    }

    if (created.user) {
      await supabaseAdmin.from("profiles").upsert({
        user_id: created.user.id,
        full_name: u.full_name,
        role: u.role,
      }, { onConflict: "user_id" });
      results.push({ email: u.email, status: "created" });
    }
  }

  // Also ensure the main admin has a profile
  const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers();
  const adminEmail = "agenciavox.comunicacao@outlook.com";
  const adminUser = allUsers?.find((u: any) => u.email === adminEmail);
  if (adminUser) {
    await supabaseAdmin.from("profiles").upsert({
      user_id: adminUser.id,
      full_name: "Alisson",
      role: "admin",
    }, { onConflict: "user_id" });
    results.push({ email: adminEmail, status: "admin_profile_ensured" });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
