# Central Social: entrega editorial

Módulo independente do Voxi. Calendário, produção, revisão, aprovação por versão,
biblioteca privada, comentários e registro de publicação manual com link.
Datas são planejamento, NÃO agendamento automático. Aprovação externa por link
e publicação Meta ainda não são habilitadas nesta entrega.

## Conexão Instagram (OAuth)

O Voxi utiliza Instagram Login, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET e retorno
próprio. Não alterar callbacks, webhooks, tokens ou código do CRM.

Antes de OAuth no Painel: verificar permissões de publicação, modo do aplicativo
e revisão/acesso avançado exigidos pela Meta. Cadastrar INSTAGRAM_APP_ID e
INSTAGRAM_APP_SECRET no Supabase do Painel, nunca em chat ou código público.
Tokens são armazenados criptografados pelo Supabase Vault; não é necessária
uma terceira chave de criptografia. O navegador nunca recebe tokens de acesso.
Estado aleatório de uso único, hash SHA-256, validade de dez minutos e vínculo
com o usuário ativo e o ID do cliente protegem o retorno. A confirmação explícita
mostra cliente e @perfil; uma conta Instagram não pode pertencer a dois clientes.
Reconectar substitui apenas o token do Painel depois da confirmação.

URI exata a ADICIONAR no aplicativo Meta (não substituir os retornos do Voxi):
https://paineldecontrole.newvox.site/social/instagram/retorno

Escopos: instagram_business_basic e instagram_business_content_publish.
Modo de desenvolvimento/revisão e acesso avançado na Meta podem limitar quais
contas autorizam. A presença das duas chaves não confirma a validade delas.
A autorização real será validada somente após cadastrar a URI e conectar um
perfil autorizado. Nenhuma assinatura de webhook, mensagem ou publicação é
realizada por esse fluxo. Renovação automática e desconexão ficam para a próxima
fase; a interface mostra a expiração e permite reconectar.
Autorizações abandonadas não são acessíveis por usuários nem usadas para publicar.
Ao iniciar uma nova conexão, a limpeza remove autorizações expiradas e somente
seus tokens pendentes, sem remover credenciais de contas confirmadas.

## Acesso e segurança

- Master: carteira completa e atribuições editoriais.
- Gestor: próprios clientes, produção e aprovação interna.
- Membro editorial: clientes atribuídos explicitamente, aprovação opcional.
- Atribuições sociais não alteram RLS de WhatsApp, anúncios, CRM ou profiles.
- Arquivos privados e imutáveis; URLs temporárias para visualização.
- Editar texto, arquivos, formato ou data invalida a aprovação.
- Controle otimista rejeita gravações de versões desatualizadas.
- Auditoria no banco preserva ator, conteúdo, etapa e versão.
- Publicação manual exige link Instagram e confirmação do usuário; não significa
  que a API verificou a existência do post ou sua correspondência com a peça.
- Biblioteca editorial é separada da mídia descartável das conversas.
- Upload por arquivo limitado a 50 MB nesta primeira versão; vídeos maiores
  exigirão upload resumível e validação específica antes da publicação automática.
- Uploads não salvos podem ficar órfãos. Não aplicar limpeza sem janela de retenção
  e checagem de referências em versões históricas.

## Validação e próxima fase

Testes locais cobrem validação de arquivos, separação de clientes, etapas,
aprovação, URLs de publicação manual e datas de Brasília. Consultas somente de
leitura confirmaram RLS, ausência de gravação direta, bucket privado e carteira
real (Master: 23 clientes; gestor Netto: 7, nenhum fora de sua atribuição).
Teste mutável de ponta a ponta em produção não foi executado: a proteção de
segurança bloqueou criação/exclusão de usuários e arquivos temporários.
Revisão visual via navegador também ficou indisponível por falha do runtime.

Próxima fase: capacidades por perfil, validação de formatos, fila durável,
agendamento real, ID publicado, reconciliação de respostas incertas e piloto
autorizado. Publicação automática continua desligada até concluir essa validação.
