# Equipe e acessos

O Master abre **Equipe e acessos → Adicionar pessoa** e informa nome completo,
e-mail, senha inicial (12 a 128 caracteres) e perfil.

- Social Media: apenas área social e Minha conta; nenhum cliente liberado por padrão.
- Gestor: operação da carteira atribuída, sem promover a Master.

Depois, em **Social Media → Equipe**, selecione cliente e pessoa e salve o acesso.
Marque explicitamente aprovação, conexão e publicação quando necessário.
Repita para cada cliente. A remoção exige confirmação e revoga esse vínculo.

O cadastro não envia e-mail e não depende de SMTP. Compartilhe a senha inicial
por um canal seguro e peça à pessoa que a altere em Minha conta.
Recuperação por e-mail depende da configuração de envio do Supabase.

O endpoint create-team-users exige sessão Master antes de qualquer operação.
Não há credenciais fixas no código, nem criação de administradores pela interface.
Falhas no provisionamento do perfil bloqueiam o novo login.
As políticas do banco não reconhecem Social Media como responsável comercial,
mesmo se o nome coincidir com um gestor. A publicação exige vínculo editorial
com aprovação ou privilégio legítimo de gestor/Master.
