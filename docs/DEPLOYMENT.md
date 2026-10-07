# Painel de Controle — arquitetura e implantação

## Destino aprovado

- Código: `agencianewvox-lab/happy-helper-system`, branch `main`.
- Site e processamento: projeto Vercel `painel-de-controle`, equipe `new-vox`.
- ID Vercel: `prj_3nuCjeXwCgNzDXoDIu6X3vNktJnk`.
- Destino aprovado dos dados: Supabase independente `gorqyovidpdvuockzndm`.
- Dados, autenticação e Realtime ainda em produção: projeto antigo
  `fmipenijdipscnqhtwvy`, gerenciado pelo Lovable. A migração não foi concluída.
  Nenhum dado é transferido para o VOXI.
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
Em 06/10/2026, o proprietário confirmou por captura os segredos `openai`
e `META_ADS_ACCESS_TOKEN` no Supabase. Os arquivos atuais de Edge Functions
leem exatamente esses nomes. Isso não valida saldo, expiração ou permissões
das chaves. A lista de variáveis Production da Vercel ainda contém apenas
`EVOLUTION_API_KEY`; segredos do Supabase não são transferidos automaticamente.

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

## Central de governança — processo aprovado em 06/10/2026

Objetivo: manter o contexto de cada cliente acessível ao Master e aos gestores
responsáveis, com fonte, data e responsável para cada informação. A arquitetura
de destino continua GitHub + Vercel + banco atual; não criar dependência de um
editor de sites, outro banco ou do projeto VOXI.

Fluxo previsto:

1. Cadastrar/vincular o grupo WhatsApp ao cliente e definir seu gestor.
2. Enviar o onboarding escolhido (clínica ou genérico), mantendo revisão humana
   antes de qualquer mensagem. Guardar a resposta original.
3. Abrir a apresentação HTML derivada dessa resposta para a reunião inicial.
4. Criar a reunião no Google do organizador e registrar seu identificador no
   cliente ANTES de oferecer o envio do convite. Compartilhar apenas por ação
   explícita; não convidar todos os clientes automaticamente.
5. Informar os participantes sobre a transcrição e garantir que ela está ativa
   no Meet. Transcrição é independente de gravação de vídeo.
6. Importar a transcrição da conferência correta assim que o Google a liberar.
7. Preservar o texto original e sua fonte; gerar separadamente um resumo com
   decisões, pendências, responsáveis, prazos e referências à transcrição.
8. O gestor revisa sugestões antes de transformá-las em tarefas/compromissos.
   O Master acompanha pendências e saúde da carteira, não apenas o último chat.

### Implementado neste incremento

A aba Onboarding passa a oferecer **Apresentar onboarding** assim que consegue
ler uma resposta salva. Não existe geração manual, chamada de IA nem cobrança
adicional para montar a apresentação: o HTML deriva do formulário mais recente
do mesmo `group_id`. O conteúdo persiste na resposta original; não há um arquivo
PowerPoint nem um novo link público expondo respostas.

Sete capítulos: ponto de partida, objetivos, público, oferta, investimento,
operação e pauta de próximos passos. Linguagem se adapta a clínica/empresa.
Dados ausentes aparecem como pontos de alinhamento. A pauta final é uma sugestão
identificada como tal, não uma promessa de resultado. Apenas campos selecionados
entram na apresentação; CNPJ, e-mail, telefone e chaves desconhecidas não entram.
PDF e formulários existentes foram preservados. O componente é carregado apenas
quando solicitado e possui navegação por teclado e layout móvel.

### Próximo incremento: Google por usuário (ainda não conectado)

O proprietário informou que usa contas Gmail pagas com transcrição já gerada no
Drive, mas ainda não tem projeto/cliente OAuth para o Painel. A assinatura e a
autorização de API são coisas distintas. Não ativar outro gravador/transcritor.

- Criar projeto Google Cloud exclusivo do Painel sob uma conta controlada pela
  empresa, habilitar Calendar e Meet APIs e configurar o consentimento OAuth.
- Usar cliente OAuth **Web application**. A URL de retorno deve coincidir
  exatamente com a rota HTTPS que for implementada na Vercel; não marcar o
  conector como pronto antes dessa implementação e da autorização real.
- Cada integrante conecta sua própria conta. Começar com escopos mínimos para
  eventos próprios e espaços/conferências do Meet; não pedir acesso irrestrito
  ao Drive. As entradas de transcrição podem ser lidas pelo Meet API.
- Armazenar refresh tokens cifrados em área privada, apenas acessível ao backend;
  validar state, PKCE, expiração e usuário da sessão no retorno OAuth. Nunca
  armazenar refresh token em localStorage ou colunas expostas ao navegador.
- O app precisa de credenciais Google e capacidade administrativa restrita no
  banco na Vercel. Nenhum desses segredos foi criado ou copiado neste incremento.
- Conferir exigências de verificação do Google e limitações de modo de teste.
  Em contas pessoais não existe autorização interna de domínio Workspace.
- Representar explicitamente estados: não conectado, autorizado, reconexão
  necessária, reunião criada, aguardando transcrição, importada, falha recuperável.
- Importar por identificadores estáveis (usuário, espaço, conferenceRecord,
  transcrição); não associar por nome de arquivo. Paginar todas as entradas,
  preservar falantes/horários e tornar reexecuções idempotentes.
- As entradas da API Meet expiram 30 dias após a reunião. Sincronizar cedo, salvar
  fonte/horário e guardar texto no banco, sem depender de reler o Drive para sempre.
- Implementar sincronização agendada no backend; clicar em Atualizar não deve
  ser a única maneira de receber uma transcrição.

### Dados e segurança a implementar antes de liberar reuniões/IA

Separar: atribuições por `user_id`, reuniões, transcrições originais, resumos
versionados, decisões/tarefas revisadas e log de integração sem segredos. O
`group_id` é o vínculo com o WhatsApp, não uma credencial de acesso.

Master pode consultar toda a carteira. Gestor acessa apenas clientes atribuídos.
Aplicar essa regra no backend e em RLS, não apenas no filtro visual. As políticas
legadas precisam de revisão: existem leituras amplas para usuários autenticados
e escritas antigas públicas. Fazer inventário dos formulários/webhooks antes de
substituir políticas para não interromper a operação.

Não considerar a governança concluída com a apresentação: conexão Google,
importação automática, RLS de carteira, análise OpenAI e painel consolidado ainda
exigem implementação e testes reais. Jarvis e correção das conversas duplicadas
ficam fora desta etapa por orientação do proprietário.

Referências técnicas consultadas:

- https://developers.google.com/workspace/meet/api/guides/artifacts
- https://developers.google.com/workspace/meet/api/guides/authenticate-authorize
- https://developers.google.com/identity/protocols/oauth2/web-server

## Revisão v2 — 06/10/2026, antes da migração completa

### Destino corrigido e situação comprovada

O proprietário informou e autorizou preparar/validar o novo Supabase
`gorqyovidpdvuockzndm` (Painel de Controle NV). Ele é o destino, não o VOXI.
O bundle público e `server/public-database.json` ainda apontam para
`fmipenijdipscnqhtwvy`. Não alterar só a URL: o destino foi encontrado sem
tabelas públicas, usuários Auth ou Edge Functions. As chaves mostradas pelo
proprietário no novo projeto não validam uma migração nem estão disponíveis
automaticamente na Vercel.

Inventário agregado em `migration-inventory-2026-10-07.json`: 25 grupos,
8 formulários, 4 perfis, 8.646 conversas. As conversas incluem aproximadamente
1,115 GB em registros JSON brutos; mídias/base64 exigem uma exportação completa.

Na primeira tentativa, foi criada SOMENTE uma área privada `migration_stage` no destino, com RLS e
sem grants para anon/authenticated. Dois registros de `ai_chat_messages`
foram copiados e conferidos por SHA-256, como primeiro lote. A cópia seguinte
foi bloqueada pela franquia de consultas do conector de origem. A consulta
agregada liberou depois, mas a exportação em lote foi novamente bloqueada.
Nenhuma tabela de aplicação, senha, usuário Auth, arquivo ou função foi migrada.
Nenhum dado da origem foi apagado e nenhuma conexão de produção foi trocada.
O aviso INFO do advisor “RLS enabled no policy” nas três tabelas privadas é
intencional: acesso de usuários finais é negado, não falta uma política pública.
Referência do aviso: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

### Recorte posterior aprovado: três meses, textos e áudios

O proprietário reduziu o histórico para os últimos três meses e depois esclareceu
que áudios devem ser preservados. Essa decisão substitui a tentativa integral
descrita acima; não autoriza apagar a origem. O checkpoint atual está em
`migration-three-months-2026-10-07.json`, separado do inventário integral original.

- Início: 06/07/2026 00:00 de Brasília. Snapshot: 06/10/2026 22:07:39 de Brasília.
- Preservar cadastros/configurações necessários, mesmo anteriores ao recorte.
- Conversas: texto, remetente, datas e identificador do evento. Imagens e vídeos
  viram `[Imagem]` / `[Vídeo]`, sem arquivo, miniatura, URL ou legenda.
- Áudio: manter transcrição existente e arquivo quando disponível. Inventário
  da origem: 145 mensagens de áudio, 96 arquivos embutidos (8.933.404 caracteres
  base64), 82 mensagens com transcrição. Essas contagens podem se sobrepor.
  Os outros 49 não têm arquivo embutido; uma URL antiga não comprova recuperação.
- Não levar apikey, payload completo, mídia citada ou outros binários no evento.
- Cópia parcial privada: 3.000/3.250 conversas normalizadas e 154 registros de
  cadastros/configurações/históricos menores. SHA-256 conferido por registro;
  nenhuma imagem/vídeo/base64 não autorizado nos lotes normalizados.
- Nenhum arquivo de áudio foi copiado ainda. `audio_copy_pending` impede
  confundir metadados já copiados com preservação do arquivo.
- Dois registros de teste de chat IA, anteriores ao recorte, foram retirados
  apenas da área privada do destino. A origem continua disponível para recuperação.

O conector da origem limitou temporariamente a próxima leitura. Retomar pelo
UUID do checkpoint usando `scripts/migration/export-messages.sql`; não reiniciar
com OFFSET nem sobrescrever arquivos de áudio já conciliados com um lote somente
de metadados. `export-audio.sql` é somente leitura e nunca deve ter seus resultados
impressos em logs ou versionados. Ainda faltam 250 conversas, arquivos de áudio e
cinco tabelas históricas indicadas no checkpoint. Recontar e conciliar alterações
posteriores ao snapshot antes da troca; o recorte não é expurgo automático futuro.

`message-retention.ts` prepara a mesma política no código do receptor de eventos,
com testes de remoção de imagens/vídeos, segredos e anexos citados, preservando
áudio e transcrição. Publicar código no GitHub/Vercel NÃO publica essa Edge Function.
Ela não foi ativada na origem nem no destino nesta etapa. Auth, esquema público,
permissões, funções e virada de produção continuam pendentes. Não considerar o
painel independente do Lovable antes dessas validações.

Para completar: exportação do recorte aprovado (ou backup oficial como origem
para restauração seletiva); esquema, dados e áudios verificados; Auth e recuperação de
senha; funções com autenticação/escopo de carteira; segredos no runtime correto;
rotas públicas de formulários; webhook compartilhado e agendamentos; conciliação
do delta de mensagens antes de qualquer troca. Não criar endpoint público de
exportação nem remover proteção para contornar a franquia.

Exportação oficial da origem (documentação Lovable conferida em 07/10/2026):
More → Cloud → Overview → Advanced settings → Export project data → Database
→ Export → Start export. O arquivo fica disponível no Storage após o aviso.
É um backup PostgreSQL custom-format `.backup` (possivelmente em ZIP), não SQL
para colar no editor. Inspecionar o índice com `pg_restore --list` e restaurar
seletivamente em destino isolado, com ferramenta compatível com zstd. Não usar
`--clean` sobre o Supabase inicializado sem revisão. Esse formato inclui Auth
e hashes de senha; quando restaurados corretamente, as senhas podem ser
preservadas, mas novas sessões serão necessárias. Arquivos Storage, segredos,
funções e agendamentos exigem etapas próprias. A exportação ainda NÃO foi
solicitada: navegador autenticado indisponível; pedido encaminhado ao proprietário.

### Melhorias implementadas nesta revisão

- Onboarding HTML padrão para TODOS os clientes, sem hardcode de Titanium:
  dez capítulos, logo original, azul/ciano Newvox, plano de trabalho, checklist
  de acessos, responsabilidades, rotina, decisões e próximos passos.
- Respostas clínicas/empresas e download PDF preservados. Dados não preenchidos
  continuam “a confirmar”; não há promessa automática de metas ou datas.
- Editor de reunião: rascunho LOCAL por operador + grupo + formulário, com
  esquema versionado e limites de tamanho. Não sincroniza entre gestores.
- Download HTML offline, sem APIs/scripts externos, somente campos selecionados
  e texto revisado da reunião. Valores escapados e CSP restritiva. Arquivo
  compartilhado não expira nem é revogável. Link público personalizado com
  validade/revogação AINDA NÃO foi implementado; não confundir com o link
  existente do formulário ou com a exportação HTML.
- Área “Anúncios” para navegar pela carteira. Não altera campanhas na Meta.
  Vínculo só mostra sucesso após confirmação de uma linha gravada no banco.
  Erros não-2xx têm explicação segura; respostas antigas de consultas não
  sobrescrevem uma nova seleção/período. Moeda da conta quando conhecida.
- O token do backend ANTIGO foi rejeitado pela Meta. Isso NÃO prova que o token
  informado no novo projeto seja inválido. A ligação à nova integração depende
  da migração do runtime e sua validação autenticada.
- Saúde operacional v2 (0–100) é diferente de NPS real. Regras transparentes:
  silêncio maior que 630/1260 minutos úteis reduz 10/25 pontos; retorno pendente
  por mais de 30/120/630 minutos úteis reduz 25/45/60 pontos. Sem mensagens
  verificáveis, não atribuir índice saudável. Expediente seg–sex, 8h–18h30 BRT,
  sem calendário de feriados. Corrigida aplicação dupla do fuso do navegador.
- NPS real: última resposta válida por cliente no período/filtros, 9–10
  promotores, 7–8 neutros e 0–6 detratores. Histórico original mantido.
  Gráficos antigos na Performance são explicitamente “índice legado”, não NPS.
- Performance deixa de inventar notas 5/10 ou atividade 100% quando faltam
  observações. Nota declarada pelo cliente não recebe bônus por complexidade;
  considera a última resposta válida por cliente no período. O índice de
  execução agrega somente dimensões observadas de tarefas, pendências e nota
  do cliente; não é NPS nem avaliação conclusiva de desempenho do gestor.
- Conversas: deduplicação VISUAL por identificador do evento, sem excluir registros
  nem juntar textos iguais de eventos diferentes. Ordenação estável por data/id,
  proteção contra resposta de consulta de outro card, e erro com nova tentativa.
  Idempotência definitiva do webhook e saneamento dos registros ainda pendentes.
- Card ampliado, abas com rolagem própria; paleta navy/azul/ciano preservando
  temas claro/escuro. Jarvis/chat retirados da navegação, rotas/dados preservados.
- Dashboard deixa de consultar previsões de NPS que não são mais usadas nos cards.

### Limites da verificação

Testes automatizados de recuperação/alteração de senha, formulários/PDF,
carregamento, descoberta de grupos e novos fluxos. Visual com clínica fictícia
isolada, desktop 1440×1000 e celular 390×844, sem envio a clientes.
Esses testes não provam login real, Meta válido ou recepção Evolution no novo
projeto. Políticas legadas do banco atual continuam exigindo revisão: filtros
de carteira na interface NÃO substituem RLS/validação do servidor.
Google fica explicitamente para a segunda rodada.

O navegador de teste renderizou/aplicou a personalização sem erros. A gravação
de downloads foi cancelada pelo ambiente de automação tanto para o HTML quanto
para um TXT de controle; portanto o salvamento no disco não foi comprovado nesse
navegador. Geração, escape/CSP, carregamento da marca e criação do download são
cobertos por testes automatizados. Não confundir essa limitação com validação
do envio de arquivos por WhatsApp (não houve envio nesta rodada).

Referências operacionais:
- https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
