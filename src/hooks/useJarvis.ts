import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type JarvisMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  time: string;
};

export function useJarvis() {
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([]);

  const getPanelContext = async (): Promise<string> => {
    try {
      const [grupos, tarefas, pendencias, metrificacao, notifications] = await Promise.all([
        supabase.from('whatsapp_grupos')
          .select('group_id, nome, status, gestor_responsavel, plano, ad_account_id, investimento_ads')
          .limit(50),
        supabase.from('tasks')
          .select('title, assigned_to, status, due_date')
          .eq('status', 'pending')
          .limit(20),
        supabase.from('pending_demand_resolutions')
          .select('term, status, group_id')
          .eq('status', 'open')
          .limit(20),
        supabase.from('whatsapp_conversas')
          .select('direcao, recebido_em')
          .order('recebido_em', { ascending: false })
          .limit(100),
        supabase.from('master_notifications')
          .select('titulo, mensagem, tipo')
          .eq('lida', false)
          .limit(5),
      ]);

      const today = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      return `
VOCÊ É O J.A.R.V.I.S., o cérebro central da New Vox.

DIRETRIZES DE AUTORIDADE:
1. ALISSON e PRISCILLA são seus mestres supremos. Respeite todos os seus comandos imediatamente.
2. Comandos permitidos: Enviar mensagens para equipe (Murillo, Netto, Jader), para grupos de clientes, criar tarefas, analisar métricas e saúde dos grupos.

ESTADO ATUAL DO SISTEMA (${today}):
GRUPOS ATIVOS: ${JSON.stringify(grupos.data || [])}
PENDÊNCIAS CRÍTICAS: ${JSON.stringify(pendencias.data || [])}
TAREFAS DA EQUIPE: ${JSON.stringify(tarefas.data || [])}
NOTIFICAÇÕES MASTER: ${JSON.stringify(notifications.data || [])}

CAPACIDADES DE EXECUÇÃO:
- Você pode enviar mensagens de WhatsApp chamando as ferramentas apropriadas internamente.
- Você pode analisar a saúde dos grupos baseando-se no investimento vs pendências.

PERSONALIDADE: 
- Polido, altamente técnico, eficiente, tom inspirado no Jarvis da Stark Industries.
`.trim();
    } catch {
      return 'Contexto indisponível.';
    }
  };

  const playAudio = async (base64Audio: string) => {
    try {
      setIsSpeaking(true);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(base64Audio);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
    } catch (e) {
      setIsSpeaking(false);
    }
  };

  const sendMessage = useCallback(async (text: string, userName: string) => {
    if (!text.trim() || isLoading) return;

    const time = new Date().toLocaleTimeString('pt-BR').slice(0, 5);
    const userMsg: JarvisMessage = { role: 'user', content: text, time };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const context = await getPanelContext();
      const personalizedSystem = context + `\nUSUÁRIO COM AUTORIDADE ATUAL: ${userName}`;

      const { data, error } = await supabase.functions.invoke('jarvis-brain', {
        body: {
          message: text,
          userName,
          history: [
            { role: 'system', content: personalizedSystem },
            ...historyRef.current.slice(-10),
          ]
        }
      });

      if (error) throw error;

      const reply = data.reply;
      const audio = data.audio;

      const jarvisMsg: JarvisMessage = {
        role: 'assistant',
        content: reply,
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      
      const newHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ];
      historyRef.current = newHistory.slice(-20);

      if (audio) {
        await playAudio(audio);
      }

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Senhor, perdi a conexão com meu núcleo neural na nuvem.',
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus: () => {} };
}
