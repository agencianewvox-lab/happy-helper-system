// Compatibility for older tabs. All business logic and secrets live in Supabase.
const TARGET = "https://gorqyovidpdvuockzndm.supabase.co/functions/v1/whatsapp";
const PUBLIC_KEY = "sb_publishable_O5FtBQw9ktXC8F46UOueqg_EDKlgp4j";
export default { async fetch(req: Request) {
  if (!["GET","POST","OPTIONS"].includes(req.method)) return new Response(null,{status:405});
  const url = new URL(TARGET);
  const action = new URL(req.url).searchParams.get("action");
  if(action === "discover-groups") url.searchParams.set("action",action);
  try {
    const response = await fetch(url,{
      method:req.method,
      headers:{"Content-Type":"application/json",apikey:PUBLIC_KEY,Authorization:req.headers.get("authorization") || ""},
      body:req.method==="POST" ? await req.text() : undefined,
      signal:AbortSignal.timeout(45000),
    });
    return new Response(response.body,{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"A integração está temporariamente indisponível."},{status:503}); }
}};
