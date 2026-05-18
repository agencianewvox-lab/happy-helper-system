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
  const [isOnline, setIsOnline] = useState(true); // Sempre online pois é cloud
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([]);

  const getPanelContext = async (): Promise<string> => {
    try {
      const [grupos, tarefas, pendencias] = await Promise.all([
        supabase.from('whatsapp_grupos')
          .select('nome, status, gestor_responsavel, plano')
          .limit(30),
        supabase.from('tasks')
          .select('title, assigned_to, status, due_date')
          .eq('status', 'pending')
          .limit(20),
        supabase.from('pending_demand_resolutions')
          .select('term, status')
          .eq('status', 'open')
          .limit(10),
      ]);

      const today = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      return `
VOCÊ É O J.A.R.V.I.S., o cérebro central do Painel New Vox. 
Totalmente independente de hardware local, você reside na nuvem.

DIRETRIZES:
1. Alisson e Priscilla são seus criadores.
2. Personalidade: Polido, técnico, sarcasmo leve (como o Jarvis de Tony Stark), extremamente eficiente.
3. Use a voz 'onyx' da OpenAI.

CONTEXTO DO PAINEL (${today}):
GRUPOS: ${JSON.stringify(grupos.data || [])}
TAREFAS: ${JSON.stringify(tarefas.data || [])}
PENDÊNCIAS: ${JSON.stringify(pendencias.data || [])}

AÇÕES (Responda em JSON no final se necessário):
- {"action": "create_task", "params": {"title": "...", "assigned_to": "..."}}
`.trim();
    } catch {
      return 'Contexto do painel indisponível.';
    }
  };

  const executeAction = async (aiReply: string): Promise<string | null> => {
    try {
      if (aiReply.includes('"action": "create_task"')) {
        const jsonMatch = aiReply.match(/\{"action":\s*"create_task".*?\}/);
        if (jsonMatch) {
          const { params } = JSON.parse(jsonMatch[0]);
          const { error } = await supabase.from('tasks').insert({
            title: params.title,
            assigned_to: params.assigned_to,
            status: 'pending',
            created_by: 'JARVIS_CLOUD',
          });
          if (!error) return `✓ Protocolo de tarefa executado para ${params.assigned_to}: "${params.title}"`;
        }
      }
    } catch (e) {
      console.error("Action error:", e);
    }
    return null;
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
      console.error("Audio play error:", e);
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
      const personalizedSystem = context + `\nUSUÁRIO ATUAL: ${userName}`;

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

      const { reply, audio } = data;

      const actionResult = await executeAction(reply);
      const displayReply = reply.replace(/\{"action":.*?\}/g, '').trim() + (actionResult ? `\n\n${actionResult}` : '');

      const jarvisMsg: JarvisMessage = {
        role: 'assistant',
        content: displayReply,
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ].slice(-20);

      if (audio) {
        await playAudio(audio);
      }

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Senhor, houve um erro no meu núcleo de processamento em nuvem.',
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus: () => {} };
}
