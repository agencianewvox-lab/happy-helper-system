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

Em 26/09/2026, a Evolution respondeu estado open, com webhook habilitado
no projeto do VOXI. O banco do painel tinha última mensagem de grupo em
06/08/2026 e nenhum registro nas últimas 24 horas. Não foi alterado o
webhook compartilhado. Sem a configuração administrativa do banco e a
transição do encaminhamento, a recepção contínua permanece pendente.
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
- Manrope e DM Sans locais, tema claro e formulários responsivos.
- Central Master em `/master/whatsapp`, com conexão, último recebimento,
  mensagens em 24h, webhook e envio manual revisável por cliente.
- 11 testes simulados da API, sem envio real, além do teste existente.
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

## Reversão

Manter o ambiente antigo durante a validação. Reverter commits pelo GitHub e
usar a implantação anterior do projeto Painel na Vercel. Nunca reverter pelo
projeto VOXI. Alterar o domínio do site não reverte alterações no banco.
