# Newvox Reuniões — instalação interna 1.0.0

1. Extraia o ZIP para uma pasta fixa. Não execute a partir do ZIP.
2. Abra chrome://extensions, ative Modo do desenvolvedor e escolha Carregar sem compactação.
3. Selecione a pasta newvox-reunioes (contém manifest.json). Fixe a extensão.
4. Abra a reunião em meet.google.com. Se a aba já estava aberta antes da instalação/atualização, recarregue-a. Clique no ícone, dê um nome ao computador e autentique no Painel.
5. Confira o mesmo código nas duas telas. Autorize apenas conexões que você iniciou. O Master precisa aprovar o primeiro dispositivo de cada gestor em Reuniões > Dispositivos.
6. Volte e clique em Já autorizei. Selecione o cliente, título e confirme o aviso/autorização de todos os participantes. Inicie somente depois de entrar na chamada.
7. Conceda acesso ao microfone quando o Chrome pedir. Fale brevemente e confira o medidor. O áudio remoto continua audível.
8. Ao terminar, clique em Encerrar e sincronizar. Aguarde a confirmação de sincronização antes de fechar o Chrome. A transcrição é processada em segundo plano e fica na aba Reuniões do cliente.

## Segurança e limites

- Apenas Master e gestores; carteira conferida no servidor a cada operação. Não inclui Social Media.
- A senha do Painel e a chave da OpenAI nunca ficam na extensão. A autorização temporária dura no máximo 8 horas, termina ao sair do Painel ou por revogação e não persiste após fechar o Chrome.
- O Master vê dispositivos, última comunicação, aprovação, bloqueio e registro de uso. Nome/versão do computador são informações declaradas, não prova de integridade. Instalação sem Web Store não impede cópia ou adulteração: o controle efetivo é no servidor. Não instale códigos modificados.
- Não há gravação silenciosa automática, vídeo, câmera, download do Drive nem bot convidado. Quem inicia é responsável por avisar os participantes; a extensão NÃO envia aviso na conversa do Meet.
- Chrome desktop 116 ou posterior. Captura a aba do Meet e o microfone do operador. Requer controles de microfone do Meet em português ou inglês; se não puder verificá-los por 15s, interrompe. Ao silenciar no Meet, o microfone local é excluído. Mudanças na interface do Meet podem exigir atualização.
- Áudio misturado: identificação de cada pessoa e transcrição perfeita NÃO são garantidas. Pequenas lacunas podem ocorrer entre trechos. Revise números, nomes, tarefas e decisões. A IA apenas sugere; tarefas dependem de confirmação humana.
- Até 4 horas por reunião, até 8h de áudio por usuário em 24h, máximo 40 reuniões/dia. Verificações periódicas encerram captura sem autorização/conectividade em até 45s. Isso não transforma uma máquina comprometida em ambiente confiável.
- Trechos de áudio aguardando sincronização ficam no armazenamento local do Chrome, sem criptografia adicional à proteção do sistema operacional. Use conta individual do Windows, bloqueio de tela e criptografia de disco. Não compartilhe o perfil do Chrome. Os trechos são removidos localmente após confirmação de upload. Em caso de falha, entre com a mesma conta e sincronize em até 24 horas.
- Áudio privado no servidor: removido 24h após transcrição; trechos com falha expiram em 7 dias. Histórico e texto permanecem. Não é armazenamento de vídeo.
- O processamento consome a API OpenAI configurada no servidor do Painel. Não é gratuito nem ilimitado.

## Falhas e atualizações

Se o navegador fechar inesperadamente, autentique de novo e use Sincronizar registro pendente. Não inicie outra reunião antes de resolver a pendência. Se o computador não puder ser recuperado, um usuário autorizado pode finalizar apenas os trechos disponíveis no Painel, explicitamente como registro parcial.

Para atualizar, encerre/sincronize primeiro, baixe a nova versão pelo Painel, substitua os arquivos na mesma pasta e clique Recarregar em chrome://extensions. Não há atualização automática nem distribuição pela Web Store. Faça uma chamada interna de validação com participantes avisados antes do primeiro atendimento a um cliente.
