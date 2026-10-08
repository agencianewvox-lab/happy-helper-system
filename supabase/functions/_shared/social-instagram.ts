export const INSTAGRAM_REDIRECT =
  "https://paineldecontrole.newvox.site/social/instagram/retorno";
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];
export async function stateHash(state: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state))
    throw new Error("Autorização inválida. Inicie novamente pelo Painel.");
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function newState() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
export function loginUrl(appId: string, state: string, reports = false) {
  if (!/^\d{1,64}$/.test(appId))
    throw new Error("Aplicativo Instagram não configurado.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: INSTAGRAM_REDIRECT,
    response_type: "code",
    scope: [
      ...INSTAGRAM_SCOPES,
      ...(reports ? ["instagram_business_manage_insights"] : []),
    ].join(","),
    state,
    enable_fb_login: "0",
    force_authentication: "1",
  }).toString();
  return url.href;
}
export async function exchangeInstagram(
  code: string,
  appId: string,
  secret: string,
  request: typeof fetch = fetch,
) {
  async function json(url: string, init: RequestInit, stage: string) {
    let response: Response;
    let data;
    try {
      response = await request(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      data = await response.json();
    } catch {
      throw new Error("A Meta não concluiu a autorização: indisponibilidade de comunicação (" + stage + "). Inicie uma nova conexão.");
    }
    if (!response.ok || data.error || data.error_type) {
      const provider = typeof data.error === "object" && data.error ? data.error : data;
      const code = Number.isInteger(provider.code) ? provider.code : 0;
      const message = String(provider.message || provider.error_message || "").toLowerCase();
      // Never log URLs, bodies, provider messages, tokens, authorization codes or app secrets.
      console.warn("instagram_oauth_failure", JSON.stringify({ stage, status: response.status, code }));
      let reason = "Verifique as credenciais e permissões do aplicativo Instagram.";
      if (/redirect|redirect_uri/.test(message)) reason = "O endereço de retorno precisa ser autorizado exatamente como https://paineldecontrole.newvox.site/social/instagram/retorno nas configurações do aplicativo Instagram.";
      else if (/secret|client_id|client id|invalid app|application id/.test(message)) reason = "O ID e o segredo precisam pertencer ao mesmo aplicativo Instagram (não ao aplicativo Facebook). Revise INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET.";
      else if (/code.*(used|expired|invalid)|authorization code|matching code|verification code/.test(message)) reason = "O código de autorização foi recusado ou já utilizado. Volte à Social Media e inicie uma nova conexão, sem atualizar esta página.";
      else if (/professional|business account|creator/.test(message)) reason = "Esta integração exige um Instagram profissional (Empresa ou Criador).";
      else if (/permission|scope|access denied/.test(message)) reason = "A Meta não concedeu as permissões necessárias. Confira o acesso avançado e a autorização deste perfil no aplicativo.";
      throw new Error("A Meta não concluiu a autorização (" + stage + "; HTTP " + response.status + (code ? "; código " + code : "") + "). " + reason);
    }
    return data;
  }
  const short = await json("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: INSTAGRAM_REDIRECT,
      code,
    }),
  }, "código de acesso");
  if (typeof short.access_token !== "string")
    throw new Error("A Meta não retornou uma autorização válida.");
  const query = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: secret,
    access_token: short.access_token,
  });
  const long = await json("https://graph.instagram.com/access_token?" + query, {
    method: "GET",
  }, "autorização duradoura");
  if (
    typeof long.access_token !== "string" ||
    !Number.isFinite(long.expires_in) ||
    long.expires_in <= 0
  )
    throw new Error("A Meta não retornou uma autorização válida.");
  const profile = await json(
    "https://graph.instagram.com/v26.0/me?fields=user_id,username,account_type",
    {
      headers: { Authorization: "Bearer " + long.access_token },
    }, "identificação do perfil",
  );
  // Fail closed on unsafe numeric IDs: never round an Instagram identifier.
  const idValue = profile.user_id ?? profile.id;
  if (typeof idValue === "number" && !Number.isSafeInteger(idValue))
    throw new Error("Identificador Instagram inválido.");
  const id = String(idValue ?? "");
  if (
    !/^\d+$/.test(id) ||
    typeof profile.username !== "string" ||
    !profile.username
  )
    throw new Error("Não foi possível identificar o perfil autorizado.");
  const permissions = Array.isArray(short.permissions) ? short.permissions : [];
  return {
    token: long.access_token as string,
    id,
    username: profile.username as string,
    accountType: String(profile.account_type || "PROFESSIONAL"),
    canPublish: permissions.includes("instagram_business_content_publish"),
    expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
  };
}
