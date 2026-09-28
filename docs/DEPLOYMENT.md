# Painel de Controle — arquitetura e implantação

## Destino aprovado

- Código: `agencianewvox-lab/happy-helper-system`, branch `main`.
- Site e processamento: projeto Vercel `painel-de-controle`, equipe `new-vox`.
- ID Vercel: `prj_3nuCjeXwCgNzDXoDIu6X3vNktJnk`.
- Dados, autenticação e Realtime atuais: Supabase gerenciado pelo Lovable,
  projeto `fmipenijdipscnqhtwvy`. Nenhum dado é transferido para o VOXI.
- VOXI é outro projeto/repositório/banco. Não compartilhar seus IDs de deploy,
  variáveis de banco ou domínios com este painel.

## Estado da migração

Esta primeira etapa prepara a hospedagem Vite e as rotas SPA na Vercel.
O domínio de produção é https://paineldecontrole.newvox.site.
O diagnóstico Master e o envio manual de onboarding/NPS usam a função
`/api/whatsapp` na Vercel. A função verifica a sessão com getUser e consulta
o perfil no banco, sem usar service_role. Somente Masters consultam o
diagnóstico; gestores só enviam para seus próprios grupos.

As demais funções em `supabase/functions` ainda executam no backend atual
até a conclusão da migração do servidor. Um build verde NÃO confirma
a migração completa nem a recepção de mensagens WhatsApp.

Em 26/09/2026, após a reconexão informada pelo proprietário, o banco do
painel mostrou 16 mensagens de grupo nas últimas 24 horas, de três grupos,
com última mensagem em 26/09/2026 12:13:32 UTC. Todas as 16 tinham a instância
`voxi_executivo_d13a86fd` no evento recebido. Isso comprova recepção recente,
mas não disponibilidade contínua futura. A captura do Evolution da instância
"financeiro nova voz" mostra webhook ativo para a função do banco do painel;
ela é uma instância diferente, e os eventos selecionados não aparecem na
captura. Nenhum webhook compartilhado foi alterado nesta revisão.
O cartão Master agora compara a URL do webhook da instância monitorada com a
função do banco do painel e verifica se `MESSAGES_UPSERT` está selecionado.
OpenAI e Meta Ads foram adiados explicitamente pelo proprietário.

## Fluxo de código

Alterar o código no GitHub; a integração Git da Vercel compila `main` para
produção e branches para preview. Não depender do editor Lovable para publicar.
Usar `npm ci`, `npm test` e `npm run build`. `vercel.json` define o gerenciador,
o diretório de saída e o fallback das rotas do React Router.
Não enviar alterações de backend ao Lovable como parte deste fluxo.

## Credenciais

O site utiliza `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do
projeto atual. São configurações públicas; a proteção de dados depende de RLS.
Nunca colocar chave administrativa, Evolution, OpenAI ou Meta em variáveis
com prefixo `VITE_`, no GitHub ou no bundle do navegador.

Para migrar as funções, configurar somente no ambiente Production do projeto
Painel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY`,
`OPENAI_API_KEY` e `META_ADS_ACCESS_TOKEN`, além da autenticação do webhook.
As chaves privadas do Lovable não são fornecidas pelo repositório GitHub.
Não copiar variáveis do projeto VOXI. Não habilitar tarefas agendadas em preview.

`server/public-database.json` contém somente URL e chave pública do mesmo
banco já usado no frontend. Nunca incluir chave de serviço nesse arquivo.
`EVOLUTION_API_KEY` é segredo exclusivo de Production, sem prefixo VITE_.
Não há fallback para a função pública antiga quando um envio falha.

## Interface e verificações desta etapa

- Login exclusivo do time; onboarding e NPS continuam públicos por link.
- Manrope e DM Sans locais, temas escuro e claro à escolha do time e
  formulários responsivos. O escuro é o padrão inicial; a preferência fica
  salva neste navegador. Onboarding e NPS públicos permanecem no tema claro.
- Central Master em `/master/whatsapp`, com conexão, último recebimento,
  mensagens em 24h, webhook e envio manual revisável por cliente.
- Testes simulados da API, sem envio real, incluindo destino e evento do webhook.
- Envio aceito pela Evolution não significa entrega ou leitura.
- O usuário optou por fazer o teste de envio real depois.
- Ainda requer validação autenticada com a conta do Master em produção.

## Remoção de equipe em 26/09/2026

Jader: login bloqueado, sessões/refresh tokens revogados e perfil removido.
A conta Auth bloqueada foi retida para preservar referências históricas.
Joel: nenhum perfil/login correspondente encontrado; referências retiradas
das configurações operacionais e do código. Alisson, Priscilla, Netto e
Murillo preservados. T3 LED/T3 Solution ficaram sem gestor; duas tarefas
ficaram A definir. Nenhuma conversa de cliente foi removida nesta etapa.
Remoção de perfil não possui lixeira; uma restauração exige recriação.
Os arquivos históricos de migrations não foram reescritos.

## Validação antes da troca definitiva

1. Conferir o repositório e o ID do projeto antes de cada operação de deploy.
2. Validar `/login`, rotas diretas e sessão com o banco atual.
3. Migrar as funções Deno para o runtime Node da Vercel, incluindo chamadas
   internas, streaming de IA e processamento em segundo plano.
4. Validar autenticação das APIs; não reproduzir endpoints administrativos
   anônimos, criação de usuários com senha fixa ou exposição de tokens Evolution.
5. Inventariar tarefas agendadas no banco antes de criar crons na Vercel para
   impedir execuções e mensagens duplicadas.
6. Receber um evento real de um dos 15 grupos e confirmar sua gravação no banco.
7. Preservar o webhook executivo do VOXI: a instância WhatsApp atual é usada
   por ele. Não substituir sua URL sem uma estratégia de encaminhamento validada.
8. Só desativar o deploy/funções antigos após validar o novo fluxo completo.

## Compartilhamento dos formulários

Os links de onboarding e NPS enviados ou copiados pelo painel usam
https://paineldecontrole.newvox.site. Não muda a seleção clínica/genérico,
as perguntas, o grupo de destino ou o banco que recebe as respostas.

O build gera form-onboarding.html e form-nps.html a partir da entrada compilada
do React. Rewrites específicos entregam esses arquivos no endereço original
do formulário, antes do fallback SPA. Assim as tags Open Graph e as capas JPEG
1200 x 630 ficam no HTML inicial, acessíveis sem JavaScript e sem autenticação.
Não incluir nomes de clientes, identificadores de grupos ou respostas nas capas.

As capas em public/share são capturas da composição HTML/CSS em
design/share-card.html (variante ?type=nps). Ao atualizar a arte, exportar em
1200 x 630, conferir o formato real e versionar o nome para evitar cache antigo.
Não adicionar dependências de geração de imagem ao servidor.

O envio solicita linkPreview: true à Evolution. A aparência no aplicativo,
cache e entrega devem ser conferidos pelo proprietário, sem envio automático
de teste. Referência do provedor sobre limitações da prévia:
https://github.com/evolution-foundation/evolution-api/issues/2262.
Build verifica imagens, tags e regras de rota; teste da API verifica a opção
linkPreview sem fazer uma requisição real.

## Minha conta — alteração de senha

Área pessoal em /configuracoes/minha-conta, disponível no menu Minha conta a
todos os usuários autenticados. Configurações Master continuam restritas;
há um atalho Minha conta e senha nessa página, sem abrir os controles do sistema.

O formulário verifica a sessão com getUser antes de updateUser. O alvo é sempre
a conta autenticada; não aceita um ID/e-mail de terceiro e não usa service_role.
Novas senhas têm confirmação e 12 a 128 caracteres, além das regras do Auth.
Reautenticação por código e senha atual são respeitadas quando exigidas pelo
serviço. Senhas e códigos não são gravados em tabelas, URLs, logs ou storage
pelo formulário e são limpos após sucesso. Nenhuma senha real foi usada em teste.

## Recuperação de senha sem sessão

O login oferece "Esqueceu sua senha?". O Auth envia o link ao e-mail
cadastrado, sem revelar se a conta existe. O retorno solicitado é
https://paineldecontrole.newvox.site/redefinir-senha. Essa rota pública valida
a sessão criada pelo link, mostra o e-mail da conta antes de salvar e exige
confirmação de uma senha de 12 a 128 caracteres. Após a alteração, encerra a
sessão local e devolve o usuário ao login. Se o provedor retornar à raiz
do site, o evento PASSWORD_RECOVERY encaminha à tela de nova senha sem abrir
o dashboard.

No Auth do Supabase gerenciado pelo Lovable, a configuração de URLs deve
permitir exatamente esse endereço de retorno. O template de recuperação deve
manter o link de confirmação do Auth com o redirecionamento solicitado.
Uma resposta HTTP 200 da solicitação não prova o endereço efetivo do e-mail
nem a entrega; confirmar abrindo um link real de recuperação antes de
considerar o fluxo validado de ponta a ponta. Não registrar senhas ou tokens.

## Reversão da publicação

Manter o ambiente antigo durante a validação. Reverter commits pelo GitHub e
usar a implantação anterior do projeto Painel na Vercel. Nunca reverter pelo
projeto VOXI. Alterar o domínio do site não reverte alterações no banco.
