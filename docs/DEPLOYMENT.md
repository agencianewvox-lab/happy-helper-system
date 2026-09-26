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
As funções em `supabase/functions` ainda executam no backend atual até a
conclusão da migração do servidor. Um build verde do site NÃO confirma
a migração das funções nem a recepção de mensagens WhatsApp.

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
