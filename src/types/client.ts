export interface Grupo {
  id: string;
  group_id: string;
  nome: string;
  categoria: string | null;
  created_at: string;
  total_mensagens: number;
  ultima_mensagem: string | null;
  ultimo_horario: string | null;
}
