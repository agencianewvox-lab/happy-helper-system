/** Decode FunctionsHttpError without exposing provider payloads, tokens or URLs. */
export async function metaAdsErrorMessage(error: unknown): Promise<string> {
  let message = error instanceof Error ? error.message : "";
  let code: number | undefined;
  if (error && typeof error === "object" && "context" in error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        message = typeof body.error === "string" ? body.error : body.error?.message || message;
        code = body.meta_error?.code ?? body.error?.code;
      } catch { /* Preserve the safe generic fallback. */ }
    }
  }
  if (code === 190 || /access token.*(invalid|expir)|session.*invalid|validating access token/i.test(message)) {
    return "A Meta recusou o token usado por este painel. Ter acesso às contas não significa que o token continua válido. O Master deve conferir META_ADS_ACCESS_TOKEN no projeto conectado ao painel.";
  }
  if (/META_ADS_ACCESS_TOKEN|not configured/i.test(message)) return "A integração Meta Ads ainda não está configurada no servidor que atende este painel. Solicite a configuração ao Master.";
  if (/permission|permissions|ads_read|not authorized|access denied/i.test(message)) return "A Meta não autorizou a leitura desta conta. Confira as permissões do token e o acesso à conta de anúncios.";
  if (/jwt|unauthorized|not authenticated/i.test(message)) return "Sua sessão não foi autorizada. Entre novamente no painel e tente outra vez.";
  if (/fetch|network|timeout/i.test(message)) return "Não foi possível alcançar a integração Meta Ads. Verifique a conexão e tente novamente.";
  return "Não foi possível consultar o Meta Ads. Os dados não foram atualizados. Tente novamente ou peça ao Master para verificar a integração.";
}
