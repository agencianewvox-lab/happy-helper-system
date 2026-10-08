# Social Media — operação do Painel
Atualizado em 08/10/2026. Repositório do Painel, Vercel e Supabase gorqyovidpdvuockzndm.
Nenhuma alteração no Voxi ou em seus callbacks/webhooks.

## Fluxo da equipe
1. Master atribui a carteira em Equipe; habilita aprovação/publicação quando necessário.
2. Instagram: conectar, autorizar e confirmar explicitamente cliente + @perfil.
3. Novo conteúdo: formato, artes/vídeos, briefing, legenda e data de Brasília.
4. Salvar → revisão → aprovar a versão → Publicar agora ou Agendar publicação.
5. Publicações acompanha preparo, envio, confirmação, erro e link. Não confundir aprovação com postagem.
6. Para alterar um conteúdo agendado, cancelar a agenda antes de editar; alterações exigem nova aprovação.
7. Duplicar cria rascunho, sem data, sem publicação automática.

## Capacidades
- Imagem no feed, Reel compartilhado no feed, carrossel de 2–10 arquivos e Story.
- Stories pela API são restritos a contas Empresa. A conta atualmente conectada é MEDIA_CREATOR.
- Prévia de arquivo, vídeo e carrossel; elementos/capas do aplicativo podem variar.
- Não oferece músicas licenciadas, stickers interativos, editor de vídeo nem aprovação externa por link.
- Imagens convertidas em JPEG e redimensionadas; margens preservam a arte.
- Upload TUS em blocos de 6 MB, progresso e tentativas de retomada enquanto a janela permanece aberta.
- Limite do bucket e validação local: até 1 GB; Stories até 100 MB; JPEG até 8 MB.
- Limite global confirmado: 50 MiB, plano gratuito. Tentativa isolada de elevar a 1 GiB retornou HTTP 402 exigindo plano pago; nenhum plano foi alterado. A interface bloqueia vídeos maiores antes do upload. Após upgrade e limite global verificado, definir VITE_SOCIAL_UPLOAD_LIMIT_BYTES=1073741824 na Vercel e reconstruir.
- Não há transcodificação de vídeo: use MP4/MOV compatível (H.264/AAC recomendado); validação local lê dimensões/duração, a Meta valida o codec/processamento.
- Reels: 3–900 segundos, largura até 1920. Stories/carrossel: 3–60 segundos no fluxo atual.

## Relatórios
Período de até 90 dias, atalhos 7/30/90, seleção de métricas, análise livre e exportação PDF Newvox/CSV.
Visualizações, alcance, contas engajadas e interações vêm da Meta. Seguidores são atuais.
Curtidas/comentários dos conteúdos publicados no período são acumulados até a consulta, não a variação do período.
Métricas indisponíveis = N/D. Consulta de até 300 conteúdos; aviso se houver truncamento.
A conta real respondeu ao diagnóstico, mas o acesso a insights foi negado pela Meta.
Botão Autorizar relatórios solicita instagram_business_manage_insights, além de basic/content_publish.
A aprovação do app/acesso avançado e a concessão pelo titular são pré-requisitos externos.
O relatório não contém conversas, dados de CRM ou de outros clientes.

## Segurança e resiliência
Após uma hora da publicação confirmada, vídeos são removidos do Storage somente se a Meta disponibilizar a mídia e nenhum outro conteúdo referenciar o arquivo. Reserva transacional impede novas referências durante a limpeza. Falhas preservam a cópia para nova tentativa. Imagens e metadados/histórico permanecem.
A prévia do histórico passa a consultar a mídia do Instagram, sem persistir URLs temporárias. Remoção/expiração da publicação (especialmente Stories) ou revogação da conta podem impedir a reprodução; isso não constitui backup. Duplicar uma publicação limpa exige reenviar os vídeos.
RLS por carteira, tokens somente no Vault/servidor, função de credencial negada a anon/authenticated.
OAuth com estado aleatório de uso único; confirmação explícita do vínculo.
Desconectar remove apenas a credencial local do Painel e cancela filas pendentes, sem revogar o app no Voxi.
Agendamento captura cliente, perfil, conexão, versão aprovada e responsável.
Checagem atual de vínculo/usuário/versão antes do envio; arquivos privados, imutáveis, validados no Storage.
Fila por post único; lease, SKIP LOCKED, fencing e confirmação atômica no banco.
Resposta ambígua vira uncertain; consulta status sem repetir media_publish. Não marcar sucesso sem confirmação.
Reconectar/desconectar bloqueados durante confirmação incerta. Requer análise manual se a Meta nunca confirmar.
Cron panel-social-publisher a cada minuto; sem agendamento automático de rascunhos antigos.
Token é renovado oportunisticamente quando utilizado e faltam menos de sete dias. Conta ociosa pode exigir reconexão.

## Validação
Testes unitários/RTL, TypeScript, Deno e build. Diagnóstico real de identidade sem publicar.
RLS e grants verificados no banco; cron ativo. Publicação real exige conteúdo e perfil autorizados pelo usuário.
Ferramenta de navegador indisponível; não houve revisão visual automatizada.
Aviso preexistente: proteção contra senhas vazadas do Supabase Auth desativada.
